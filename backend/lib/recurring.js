import Transaction from "../models/Transaction.js";
import { addDaysYmd, dayFromYmd } from "./period.js";

/**
 * Turning repeating rules into real transactions.
 *
 * The rules are templates; nothing in the app reads them when working out a
 * budget. On the first request of each day, any occurrence that has come due
 * since the rule last ran is written as an ordinary Transaction, and from then
 * on it is an ordinary transaction in every respect — the streak, summaries,
 * per-account totals and the ledger all see it without knowing it was generated,
 * and the user can correct or delete it like anything else.
 *
 * Materialised, never inferred, for the same reason lib/savingsCarry.js is:
 * `computeStreak` walks every day since the user's first transaction, so a rule
 * that was *evaluated* at read time would keep changing what past days cost as
 * the rule was edited. A written row is a fact that stays put.
 *
 * Two guards make it safe to call on any request:
 *   - `lastRunKey` on the rule short-circuits the whole thing once a day.
 *   - a unique partial index on (userId, recurringId, dueKey) means two requests
 *     racing on app open cannot both insert the same occurrence. The loser's
 *     duplicate-key error is expected and swallowed.
 *
 * Like ensureCurrentMonthSavings, this must only be called with the
 * authenticated user's own full document — never over a friend's partially
 * selected one, since it writes.
 */

// Ceiling on how many occurrences one rule may produce in a single run. Reached
// only by a weekly rule left alone for well over a year; it stops a corrupt or
// hand-edited rule from writing unboundedly, and the next run continues from
// where this one stopped.
const MAX_PER_RUN = 120;

const pad = (n) => String(n).padStart(2, "0");

const daysInMonth = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** The later of two YYYY-MM-DD keys; either may be null. */
const laterKey = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * Occurrence dates for `rule` after `after` and up to and including `through`,
 * oldest first. `after` is exclusive so it can be handed the last day already
 * materialised.
 */
export function occurrencesFor(rule, after, through) {
  // The window is exclusive at the bottom, so an `after` that has already
  // reached `through` leaves nothing to produce.
  if (!after || !through || after >= through) return [];
  return rule.frequency === "weekly"
    ? weeklyOccurrences(rule, after, through)
    : monthlyOccurrences(rule, after, through);
}

function monthlyOccurrences(rule, after, through) {
  const out = [];
  const from = dayFromYmd(after);
  let year = from.getUTCFullYear();
  let month = from.getUTCMonth();

  for (let i = 0; i < MAX_PER_RUN; i += 1) {
    // A rule for the 31st fires on the 30th, 29th or 28th in the months that
    // have no 31st, rather than skipping them. Skipping would quietly drop
    // February's rent.
    const day = Math.min(rule.dayOfMonth, daysInMonth(year, month));
    const key = `${year}-${pad(month + 1)}-${pad(day)}`;
    if (key > through) break;
    if (key > after) out.push(key);
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  return out;
}

function weeklyOccurrences(rule, after, through) {
  const out = [];
  const first = addDaysYmd(after, 1);
  const offset = (rule.weekday - dayFromYmd(first).getUTCDay() + 7) % 7;
  let key = addDaysYmd(first, offset);

  while (key <= through && out.length < MAX_PER_RUN) {
    out.push(key);
    key = addDaysYmd(key, 7);
  }
  return out;
}

/** The transaction a rule produces for one occurrence. */
function rowFor(rule, userId, dueKey) {
  const when = dayFromYmd(dueKey);
  return {
    userId,
    description: rule.description,
    amount: rule.amount,
    type: rule.type,
    category: rule.category,
    date: when,
    month: when.getUTCMonth(),
    year: when.getUTCFullYear(),
    accountId: rule.accountId ?? null,
    recurringId: rule._id,
    dueKey,
  };
}

/**
 * Write any occurrences that have come due on or before `todayYmd`, and move
 * each rule's watermark up to today. Returns how many rows were created.
 *
 * Safe and cheap to call on every read: a user with no rules returns without
 * touching anything, and one whose rules have already run today short-circuits
 * on a string comparison.
 */
export async function ensureRecurringDue(user, todayYmd) {
  if (!user?.recurring?.length || user.isDemo) return 0;
  if (typeof user.save !== "function") return 0;
  if (!todayYmd) return 0;

  const rows = [];
  let advanced = false;

  for (const rule of user.recurring) {
    if (rule.paused || rule.lastRunKey === todayYmd) continue;

    // Start from whichever is later: the day after the rule's first eligible
    // day, or the day after the last one already written. A rule created today
    // has neither behind it, so it simply waits for its first due date.
    const after = laterKey(rule.lastRunKey, addDaysYmd(rule.startKey, -1));
    for (const dueKey of occurrencesFor(rule, after, todayYmd)) {
      rows.push(rowFor(rule, user._id, dueKey));
    }

    rule.lastRunKey = todayYmd;
    advanced = true;
  }

  if (rows.length > 0) {
    try {
      await Transaction.insertMany(rows, { ordered: false });
    } catch (err) {
      // A duplicate means another request materialised the same occurrence
      // first, which is exactly what the unique index is for. Anything else is
      // a real failure and must not be swallowed.
      const errors = err?.writeErrors ?? [];
      const codes = errors.length
        ? errors.map((e) => e?.err?.code ?? e?.code)
        : [err?.code];
      if (!codes.every((code) => code === 11000)) throw err;
    }
  }

  // Save after the inserts: if they fail, the watermark stays where it was and
  // the next request tries again rather than skipping the day silently.
  if (advanced) await user.save();
  return rows.length;
}
