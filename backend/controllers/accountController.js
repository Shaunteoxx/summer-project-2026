import Transaction from "../models/Transaction.js";
import Transfer from "../models/Transfer.js";
import { HEX_COLOR, resolveClientToday, roundMoney, ymd } from "../lib/validation.js";
import { dayFromYmd } from "../lib/period.js";
import { loadPeriodContext } from "../lib/periodContext.js";
import { ensureCurrentMonthSavings } from "../lib/savingsCarry.js";
import { ensureRecurringDue } from "../lib/recurring.js";
import { INCOME_AMOUNT, SPENT_AMOUNT } from "../lib/entryFields.js";

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
 *
 * Money friends paid back for a shared bill keeps that identity too. The bill's
 * full `amount` goes out of the account that paid it and the `paidBack` comes
 * into the account it was returned to, so `totals.spent` — what the budget
 * counts — is the bill less the repayment.
 */
export async function getAccountTotals(req, res) {
  const today = resolveClientToday(req.query.today);
  if (!today) return res.status(400).json({ message: "Invalid today date" });
  const todayKey = ymd(today);

  await ensureCurrentMonthSavings(req.user, todayKey);
  await ensureRecurringDue(req.user, todayKey);
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
    paidBackIn: 0,
    net: 0,
  }));

  // Days mode can leave the user between periods. There is no window to total,
  // so report the accounts with nothing in them rather than inventing one.
  if (!period) {
    return res.json({ period: null, accounts, totals: zeroTotals() });
  }

  const range = { $gte: dayFromYmd(period.start), $lte: dayFromYmd(period.end) };
  const [txnRows, transferRows, paidBackRows] = await Promise.all([
    Transaction.aggregate([
      { $match: { userId: req.user._id, date: range } },
      {
        $group: {
          _id: "$accountId",
          income: { $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] } },
          // What left the account, in full.
          spent: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, "$amount", 0] } },
          // What the budget counts: the same bills, less what came back.
          counted: { $sum: { $cond: [{ $eq: ["$type", "expense"] }, SPENT_AMOUNT, 0] } },
          // Whatever came back past a bill. Already In for the account it
          // landed in (paidBackIn below); counted here for the budget.
          extra: {
            $sum: { $cond: [{ $eq: ["$type", "expense"] }, INCOME_AMOUNT, 0] },
          },
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
    // Grouped by the account the money came back into, which is often not the
    // one the bill was paid from.
    Transaction.aggregate([
      { $match: { userId: req.user._id, date: range, paidBack: { $gt: 0 } } },
      { $group: { _id: "$paidBackAccountId", amount: { $sum: "$paidBack" } } },
    ]),
  ]);

  const byId = new Map(accounts.map((a) => [a.id, a]));
  // Rows logged before the user made any accounts, or left untagged. Kept as
  // its own bucket so the arithmetic still ties out during the transition
  // rather than the difference silently going missing.
  const unassigned = { income: 0, spent: 0, paidBackIn: 0, net: 0 };
  let counted = 0;
  let extra = 0;

  for (const row of txnRows) {
    const target = row._id ? byId.get(String(row._id)) : unassigned;
    // An account deleted while its rows survived would land here; skip rather
    // than throw, and the totals below will show the gap.
    if (!target) continue;
    target.income += row.income;
    target.spent += row.spent;
    counted += row.counted;
    extra += row.extra;
  }

  for (const row of paidBackRows) {
    const target = row._id ? byId.get(String(row._id)) : unassigned;
    if (target) target.paidBackIn += row.amount;
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
    a.paidBackIn = roundMoney(a.paidBackIn);
    a.net = roundMoney(a.income - a.spent + a.paidBackIn + a.transfersIn - a.transfersOut);
  }
  unassigned.income = roundMoney(unassigned.income);
  unassigned.spent = roundMoney(unassigned.spent);
  unassigned.paidBackIn = roundMoney(unassigned.paidBackIn);
  unassigned.net = roundMoney(unassigned.income - unassigned.spent + unassigned.paidBackIn);

  // Money paid back past a bill is income to the budget, the same as a gift.
  const income = roundMoney(
    accounts.reduce((sum, a) => sum + a.income, 0) + unassigned.income + extra
  );
  const spent = roundMoney(counted);
  const reserved = roundMoney(period.savings || 0);
  // A term cycle's money came from the lump sum, which arrived in an earlier
  // cycle and belongs to no account any more. Null outside term mode.
  const funding = period.funding ?? null;
  const term =
    funding !== null ? context.terms.find((t) => String(t._id) === period.termId) : null;
  const fundedBy = term ? await incomeCategories(req.user._id, term.start, period.end) : [];

  res.json({
    period: { start: period.start, end: period.end, savings: reserved, funding, fundedBy },
    accounts,
    // Omitted entirely once everything is tagged, so the client doesn't have to
    // decide whether a row of zeroes is worth showing.
    ...(unassigned.income || unassigned.spent || unassigned.paidBackIn ? { unassigned } : {}),
    totals: {
      income,
      spent,
      funding,
      // Still strictly what moved through the accounts, so the per-account nets
      // go on summing to it. Funding sits outside that identity on purpose: it
      // is in no account, and putting it in one would be a fabrication.
      net: roundMoney(income - spent),
      reserved,
      leftToSpend: roundMoney((funding ?? income) - spent - reserved),
    },
  });
}

/**
 * The income categories a term cycle's money came from, largest first, so the
 * card can say "$652.40 in from Allowance".
 *
 * Over the same window the cycle's share is cut from: income from the start of
 * the term to the end of this cycle. Usually that's the one lump sum.
 */
async function incomeCategories(userId, start, end) {
  const rows = await Transaction.aggregate([
    {
      $match: {
        userId,
        type: "income",
        date: { $gte: dayFromYmd(start), $lte: dayFromYmd(end) },
      },
    },
    { $group: { _id: "$category", amount: { $sum: "$amount" } } },
    { $sort: { amount: -1, _id: 1 } },
  ]);
  return rows.map((r) => r._id);
}

const zeroTotals = () => ({
  income: 0,
  spent: 0,
  net: 0,
  reserved: 0,
  leftToSpend: 0,
});

/** Shape sent to the client; the id is what transactions store. */
export const presentAccount = (a) => ({
  id: a._id,
  name: a.name,
  color: a.color,
  archived: !!a.archived,
});

// Enough for the accounts a person actually spends from, and few enough that
// the picker in the add sheet stays a chip row rather than a scrolling list.
const MAX_ACCOUNTS = 8;

/** POST /api/auth/accounts { name, color } -> create a bank account. */
export async function addAccount(req, res) {
  const user = req.user;
  const name = String(req.body.name || "").trim();
  const { color } = req.body;

  if (!name || !color) {
    return res.status(400).json({ message: "name and color are required" });
  }
  if (name.length > 24) {
    return res.status(400).json({ message: "Name too long (max 24 characters)" });
  }
  if (!HEX_COLOR.test(color)) {
    return res.status(400).json({ message: "Invalid color" });
  }

  const lc = name.toLowerCase();
  if (user.accounts.some((a) => a.name.toLowerCase() === lc)) {
    return res.status(409).json({ message: "That account already exists" });
  }
  // Archived accounts keep their history but shouldn't count against the limit.
  if (user.accounts.filter((a) => !a.archived).length >= MAX_ACCOUNTS) {
    return res.status(400).json({ message: "Account limit reached" });
  }

  user.accounts.push({ name, color });
  await user.save();
  res.status(201).json(presentAccount(user.accounts[user.accounts.length - 1]));
}

/** PATCH /api/auth/accounts/:id { name?, color?, archived? } */
export async function updateAccount(req, res) {
  const user = req.user;
  const account = user.accounts.id(req.params.id);
  if (!account) return res.status(404).json({ message: "Account not found" });

  const { name, color, archived } = req.body;

  if (name !== undefined) {
    const next = String(name).trim();
    if (!next) return res.status(400).json({ message: "name is required" });
    if (next.length > 24) {
      return res.status(400).json({ message: "Name too long (max 24 characters)" });
    }
    const lc = next.toLowerCase();
    const clash = user.accounts.some(
      (a) => String(a._id) !== String(account._id) && a.name.toLowerCase() === lc
    );
    if (clash) return res.status(409).json({ message: "That account already exists" });
    account.name = next;
  }

  if (color !== undefined) {
    if (!HEX_COLOR.test(color)) {
      return res.status(400).json({ message: "Invalid color" });
    }
    account.color = color;
  }

  if (archived !== undefined) {
    if (typeof archived !== "boolean") {
      return res.status(400).json({ message: "Invalid archived flag" });
    }
    // Un-archiving has to respect the limit too, or it becomes a way past it.
    if (!archived && user.accounts.filter((a) => !a.archived).length >= MAX_ACCOUNTS) {
      return res.status(400).json({ message: "Account limit reached" });
    }
    account.archived = archived;
  }

  await user.save();
  res.json(presentAccount(account));
}

/**
 * DELETE /api/auth/accounts/:id
 *
 * Only for accounts with nothing behind them. Deleting one that has history
 * would orphan its transactions — they would keep an accountId pointing at
 * nothing, and quietly drop out of the per-account totals while still counting
 * towards the budget. Archiving is the answer for those.
 */
export async function removeAccount(req, res) {
  const user = req.user;
  const account = user.accounts.id(req.params.id);
  if (!account) return res.status(404).json({ message: "Account not found" });

  const [txns, transfers] = await Promise.all([
    Transaction.countDocuments({ userId: user._id, accountId: account._id }),
    Transfer.countDocuments({
      userId: user._id,
      $or: [{ from: account._id }, { to: account._id }],
    }),
  ]);
  if (txns + transfers > 0) {
    return res.status(409).json({
      message: "This account has history. Archive it instead of deleting it.",
      inUse: true,
    });
  }
  // A repeating entry pointing at a deleted account would keep producing
  // transactions tagged to nothing — invisible in the per-account totals while
  // still counting against the budget.
  if ((user.recurring || []).some((r) => String(r.accountId) === String(account._id))) {
    return res.status(409).json({
      message: "A repeating entry uses this account. Archive it instead.",
      inUse: true,
    });
  }

  user.accounts.pull(req.params.id);
  await user.save();
  res.json({ message: "Deleted", id: req.params.id });
}
