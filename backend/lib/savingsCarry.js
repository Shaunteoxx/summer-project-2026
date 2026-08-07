import { dayFromYmd } from "./period.js";

/**
 * Carrying the savings target into a new calendar month.
 *
 * The tempting implementation is a read-time fallback in `monthPeriodOf` — if
 * this month has no target, use the most recent one. That is wrong here.
 * `computeStreak` resolves a period for *every day since the user's first
 * transaction*, so a fallback would retroactively hand a target to every past
 * month the user never set one for, silently rewriting historical daily
 * budgets, the streak, the tracker calendar and every savings rate.
 *
 * So the carry is a write, materialised once for the current month and never
 * for a past one. History stays exactly as it was lived.
 *
 * This is deliberately NOT called from `loadPeriodContext`, even though that is
 * the one place both the streak and period endpoints pass through:
 * `friendController.getComparison` runs that loader over *friends'*
 * partially-selected documents, and a leaderboard read must never write to
 * somebody else's account. Call it explicitly from owner-scoped handlers where
 * `user` is the authenticated user's own full document.
 */

/** "YYYY-M" with a 0-based month — the key savingsByMonth has always used. */
export const monthKeyOf = (todayYmd) => {
  const date = dayFromYmd(todayYmd);
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
};

/** Sortable ordinal for a "YYYY-M" key, or null if it isn't one. */
function monthOrdinal(key) {
  const match = /^(\d{4})-(\d{1,2})$/.exec(key);
  if (!match) return null;
  const month = Number(match[2]);
  if (month > 11) return null;
  return Number(match[1]) * 12 + month;
}

/**
 * Give the calendar month containing `todayYmd` a savings target copied from
 * the most recent earlier month, if the user has asked for that and hasn't
 * already set one. Returns true if it wrote.
 *
 * Only ever writes the current month's key, so calling it repeatedly — or from
 * two requests racing on app open — is idempotent: both compute the same value
 * for the same key, and `save()` only sends that one modified path.
 */
export async function ensureCurrentMonthSavings(user, todayYmd) {
  // A partially-selected doc (a friend's, say) has no repeatSavings to read, so
  // this bails before touching anything it shouldn't.
  if (!user?.repeatSavings || user.isDemo) return false;
  if (typeof user.save !== "function") return false;
  // Days mode keeps its target on the BudgetPeriod row; nothing to carry.
  if (user.budgetMode === "days") return false;

  const savings = user.savingsByMonth;
  if (typeof savings?.has !== "function") return false;

  const key = monthKeyOf(todayYmd);
  const current = monthOrdinal(key);
  // An unparseable today (or a month already decided, including a deliberate
  // zero) means there is nothing to do.
  if (current === null || savings.has(key)) return false;

  // The most recent earlier month rather than strictly last month: someone who
  // didn't open the app for a while should resume their old target, not lose it.
  let latest = null;
  let carried = null;
  for (const [existing, value] of savings) {
    const ordinal = monthOrdinal(existing);
    if (ordinal === null || ordinal >= current) continue;
    if (latest === null || ordinal > latest) {
      latest = ordinal;
      carried = value;
    }
  }
  if (carried === null) return false;

  savings.set(key, Math.max(0, Number(carried) || 0));
  await user.save();
  return true;
}
