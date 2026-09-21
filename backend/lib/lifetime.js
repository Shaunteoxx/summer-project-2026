import Transaction from "../models/Transaction.js";
import { roundMoney } from "./validation.js";
import { addDaysYmd, dayFromYmd } from "./period.js";
import { SPENT_AMOUNT } from "./entryFields.js";

/**
 * All-time savings: what someone has kept, over the windows that have finished.
 *
 * The window running right now is deliberately left out. Money you simply
 * haven't spent yet is unspent, not saved — the same distinction Home draws
 * with "Unspent So Far" — and while it's the only window you have, the figure
 * reads like an achievement on day 2 of tracking. So the totals stop at the day
 * before the active window opens, and `through` names that day for the caller
 * to caption with. With no window running (a days-mode gap, or before the first
 * one) there is nothing in progress to hold back, and every entry counts.
 *
 * Term mode needs one more correction. A term's income lands once and is
 * released a cycle at a time, so raw income would credit a January lump sum in
 * full to a March reader and call five months of earmarked rent "saved" — the
 * exact inflation this module exists to remove. For the running term, income is
 * therefore replaced by what its finished cycles were actually funded (the same
 * funding-not-income swap the budget, the streak and /stats already make).
 * Terms that have ended keep their raw income: every cycle of theirs has been
 * released, so the two agree.
 */

/** What the running term has handed to cycles that closed before `cutoff`. */
function releasedBefore(cycleFunding, cutoff) {
  let total = 0;
  for (const [key, amount] of cycleFunding ?? []) {
    if (key < cutoff) total += amount;
  }
  return total;
}

/** Everything about a person the aggregates need, read off their context. */
function planFor(user, context) {
  const active = context?.active ?? null;
  const term =
    context?.mode === "term" && active?.termId
      ? context.terms?.find((t) => String(t._id) === active.termId) ?? null
      : null;
  return {
    key: String(user._id),
    userId: user._id,
    // Exclusive: the first day of the window still in progress.
    cutoff: active?.start ?? null,
    // Income before this day belongs to no running term, so it counts as it is.
    termStart: term?.start ?? null,
    released: term ? releasedBefore(context.cycleFunding, active.start) : 0,
  };
}

const empty = (through) => ({
  earned: 0,
  spent: 0,
  saved: 0,
  rate: 0,
  through,
});

/**
 * All-time savings for several people at once: `userId string -> figures`.
 *
 * Takes each person's already-loaded period context rather than loading its
 * own, because every caller has one in hand — and because loading one for a
 * friend must stay a read (see lib/savingsCarry.js).
 *
 * Two aggregates however long the friends list is: everyone's totals up to
 * their own cutoff, then the pre-term income of just the term-mode people. A
 * per-user cutoff is what makes it an $or rather than one date range.
 */
export async function lifetimeSavingsFor(entries) {
  const plans = entries.map(({ user, context }) => planFor(user, context));
  const figures = new Map(
    plans.map((p) => [p.key, empty(p.cutoff ? addDaysYmd(p.cutoff, -1) : null)])
  );
  if (plans.length === 0) return figures;

  const upTo = (plan, extra = {}) => ({
    userId: plan.userId,
    ...extra,
    ...(plan.cutoff ? { date: { $lt: dayFromYmd(plan.cutoff) } } : {}),
  });

  const rows = await Transaction.aggregate([
    { $match: { $or: plans.map((plan) => upTo(plan)) } },
    {
      $group: {
        _id: "$userId",
        income: {
          $sum: { $cond: [{ $eq: ["$type", "income"] }, "$amount", 0] },
        },
        // Expenses net of what friends paid back, as everywhere else.
        expenses: {
          $sum: { $cond: [{ $eq: ["$type", "expense"] }, SPENT_AMOUNT, 0] },
        },
      },
    },
  ]);
  const totals = new Map(rows.map((row) => [String(row._id), row]));

  const termed = plans.filter((plan) => plan.termStart);
  const preTerm = new Map();
  if (termed.length > 0) {
    const termRows = await Transaction.aggregate([
      {
        $match: {
          $or: termed.map((plan) => ({
            userId: plan.userId,
            type: "income",
            date: { $lt: dayFromYmd(plan.termStart) },
          })),
        },
      },
      { $group: { _id: "$userId", income: { $sum: "$amount" } } },
    ]);
    for (const row of termRows) preTerm.set(String(row._id), row.income);
  }

  for (const plan of plans) {
    const row = totals.get(plan.key);
    const earned = roundMoney(
      plan.termStart
        ? (preTerm.get(plan.key) || 0) + plan.released
        : row?.income || 0
    );
    const spent = roundMoney(row?.expenses || 0);
    const saved = roundMoney(earned - spent);
    figures.set(plan.key, {
      earned,
      spent,
      saved,
      rate: earned > 0 ? Math.round((saved / earned) * 100) : 0,
      through: plan.cutoff ? addDaysYmd(plan.cutoff, -1) : null,
    });
  }
  return figures;
}

/** The same figures for one person. */
export async function lifetimeSavings(user, context) {
  const figures = await lifetimeSavingsFor([{ user, context }]);
  return figures.get(String(user._id));
}
