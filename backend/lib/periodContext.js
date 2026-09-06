import BudgetPeriod from "../models/BudgetPeriod.js";
import BudgetTerm from "../models/BudgetTerm.js";
import Transaction from "../models/Transaction.js";
import { roundMoney } from "./validation.js";
import {
  createPeriodResolver,
  cyclesOfTerm,
  dayFromYmd,
  latestPeriodBefore,
  priceCycles,
  periodStatus,
} from "./period.js";

/**
 * Everything a term needs costed, in one pass: the pot its active cycle draws
 * from, and the whole term's running totals.
 *
 * Rows are bucketed against the cycle rather than filtered to it, because the
 * two answers want different slices of the same scan — the pot needs income up
 * to the end of the cycle and spending only from before it, while the term
 * totals want the lot.
 *
 * The pot counts income up to the end of the cycle, the way month mode has
 * always treated income landing mid-window, and spending only once it is behind
 * us: what gets spent *inside* the cycle is already handled by the daily budget
 * shrinking as it goes, and charging it here too would take it twice.
 */
async function costTerm(userId, term, cycle, cycles) {
  const rows = await Transaction.aggregate([
    {
      $match: {
        userId,
        date: { $gte: dayFromYmd(term.start), $lte: dayFromYmd(term.end) },
      },
    },
    {
      $group: {
        _id: {
          type: "$type",
          y: { $year: "$date" },
          m: { $month: "$date" },
        },
        total: { $sum: "$amount" },
      },
    },
  ]);

  // A term has at most one cycle per calendar month, so the month a row falls
  // in names its cycle. Bucketing per cycle rather than per side-of-today is
  // what lets every cycle be priced, not just the running one.
  const byCycle = { income: new Map(), expense: new Map() };
  const keyFor = (y, m) =>
    cycles.find((c) => {
      const d = dayFromYmd(c.start);
      return d.getUTCFullYear() === y && d.getUTCMonth() + 1 === m;
    })?.key;
  for (const row of rows) {
    const key = keyFor(row._id.y, row._id.m);
    if (!key) continue;
    const side = byCycle[row._id.type];
    if (side) side.set(key, (side.get(key) || 0) + row.total);
  }

  const sum = (map) => [...map.values()].reduce((n, v) => n + v, 0);
  const income = roundMoney(sum(byCycle.income));
  const spent = roundMoney(sum(byCycle.expense));

  const funding = priceCycles(cycles, {
    incomeByCycle: byCycle.income,
    expenseByCycle: byCycle.expense,
  });

  return {
    // Only cycles up to and including the running one are settled. A later one
    // was priced as though this month stopped spending now, which it won't, so
    // it is dropped rather than published as a figure someone might rely on.
    funding: new Map([...funding].filter(([key]) => key <= cycle.start)),
    pot: 0,
    totals: { income, spent, left: roundMoney(income - spent) },
  };
}

/**
 * Everything the request handlers need to talk about periods: the user's mode,
 * their stored windows, a resolver, and where today sits.
 *
 * Kept separate from lib/period.js so that module stays pure and testable
 * without a database.
 */
export async function loadPeriodContext(user, todayYmd) {
  const mode = ["days", "term"].includes(user.budgetMode) ? user.budgetMode : "month";
  const savingsByMonth = Object.fromEntries(user.savingsByMonth || []);
  const [periods, terms] = await Promise.all([
    mode === "days"
      ? BudgetPeriod.find({ userId: user._id }).sort({ start: 1 }).lean()
      : [],
    mode === "term"
      ? BudgetTerm.find({ userId: user._id }).sort({ start: 1 }).lean()
      : [],
  ]);

  const resolve = createPeriodResolver({ mode, savingsByMonth, periods, terms });
  const active = resolve(todayYmd);

  // A term's cycles are derived, so the windows that "exist" — the ones status
  // and the lapse message ask about — are the cycles, not the term rows.
  const windows =
    mode === "term" ? terms.flatMap((t) => cyclesOfTerm(t, savingsByMonth)) : periods;

  // Only the active cycle needs its funding priced here; the streak walks the
  // rest itself, from history it already holds.
  let termTotals = null;
  let cycleFunding = null;
  if (mode === "term" && active) {
    const term = terms.find((t) => String(t._id) === active.termId);
    if (term) {
      const costed = await costTerm(user._id, term, active, cyclesOfTerm(term, savingsByMonth));
      active.funding = costed.funding.get(active.key) ?? 0;
      termTotals = costed.totals;
      cycleFunding = costed.funding;
    }
  }

  return {
    mode,
    savingsByMonth,
    periods: windows,
    terms,
    resolve,
    active,
    // Whole-term income/spend, so screens can show where the allowance stands
    // as well as where this month does. Null outside term mode.
    termTotals,
    // What each settled cycle of the running term was given.
    cycleFunding,
    status: periodStatus(todayYmd, active, windows),
    // Only set when lapsed — lets the client say which window just ended.
    previous: active ? null : latestPeriodBefore(todayYmd, windows),
  };
}
