import Transaction from "../models/Transaction.js";
import Transfer from "../models/Transfer.js";
import { resolveClientToday, roundMoney, ymd } from "../lib/validation.js";
import { dayFromYmd } from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { ensureCurrentMonthSavings } from "../lib/savingsCarry.js";

/**
 * GET /api/accounts?today=YYYY-MM-DD
 *
 * Where this period's money sits. Not a bank balance: there is no opening
 * figure, so an account's `net` is only what moved through it since the period
 * began (see ACCOUNTS_PLAN.md §2.2).
 *
 * Because every transfer has one `from` and one `to`, transfers cancel across
 * accounts, so `Σ net === totals.income − totals.spent` — the same number the
 * daily budget is built from, before the savings reserve. That identity is what
 * lets the client show the two views reconciling, and it is asserted in the
 * tests.
 */
export async function getAccountTotals(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });
  const todayKey = ymd(today);

  await ensureCurrentMonthSavings(req.user, todayKey);
  const context = await loadPeriodContext(req.user, todayKey);
  const period = context.active;

  const accounts = (req.user.accounts || []).map((a) => ({
    id: String(a._id),
    name: a.name,
    color: a.color,
    archived: !!a.archived,
    income: 0,
    spent: 0,
    transfersIn: 0,
    transfersOut: 0,
    net: 0,
  }));

  // Days mode can leave the user between periods. There is no window to total,
  // so report the accounts with nothing in them rather than inventing one.
  if (!period) {
    return res.json({ period: null, accounts, totals: zeroTotals() });
  }

  const range = { $gte: dayFromYmd(period.start), $lte: dayFromYmd(period.end) };
  const [txnRows, transferRows] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: req.user._id, date: range } },
      {
        $group: {
          _id: "$accountId",
          income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
          spent: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
        },
      },
    ]),
    Transfer.aggregate([
      { $match: { userId: req.user._id, date: range } },
      {
        // Each facet takes an array of stages, not a bare stage.
        $facet: {
          out: [{ $group: { _id: "$from", amount: { $sum: "$amount" } } }],
          in: [{ $group: { _id: "$to", amount: { $sum: "$amount" } } }],
        },
      },
    ]),
  ]);

  const byId = new Map(accounts.map((a) => [a.id, a]));
  // Rows logged before the user made any accounts, or left untagged. Kept as
  // its own bucket so the arithmetic still ties out during the transition
  // rather than the difference silently going missing.
  const unassigned = { income: 0, spent: 0, net: 0 };

  for (const row of txnRows) {
    const target = row._id ? byId.get(String(row._id)) : unassigned;
    // An account deleted while its rows survived would land here; skip rather
    // than throw, and the totals below will show the gap.
    if (!target) continue;
    target.income += row.income;
    target.spent += row.spent;
  }

  const facet = transferRows[0] ?? { out: [], in: [] };
  for (const row of facet.out) {
    const target = byId.get(String(row._id));
    if (target) target.transfersOut += row.amount;
  }
  for (const row of facet.in) {
    const target = byId.get(String(row._id));
    if (target) target.transfersIn += row.amount;
  }

  for (const a of accounts) {
    a.income = roundMoney(a.income);
    a.spent = roundMoney(a.spent);
    a.transfersIn = roundMoney(a.transfersIn);
    a.transfersOut = roundMoney(a.transfersOut);
    a.net = roundMoney(a.income - a.spent + a.transfersIn - a.transfersOut);
  }
  unassigned.income = roundMoney(unassigned.income);
  unassigned.spent = roundMoney(unassigned.spent);
  unassigned.net = roundMoney(unassigned.income - unassigned.spent);

  const income = roundMoney(
    accounts.reduce((sum, a) => sum + a.income, 0) + unassigned.income
  );
  const spent = roundMoney(
    accounts.reduce((sum, a) => sum + a.spent, 0) + unassigned.spent
  );
  const reserved = roundMoney(period.savings || 0);

  res.json({
    period: { start: period.start, end: period.end, savings: reserved },
    accounts,
    // Omitted entirely once everything is tagged, so the client doesn't have to
    // decide whether a row of zeroes is worth showing.
    ...(unassigned.income || unassigned.spent ? { unassigned } : {}),
    totals: {
      income,
      spent,
      net: roundMoney(income - spent),
      reserved,
      leftToSpend: roundMoney(income - spent - reserved),
    },
  });
}

const zeroTotals = () => ({
  income: 0,
  spent: 0,
  net: 0,
  reserved: 0,
  leftToSpend: 0,
});
