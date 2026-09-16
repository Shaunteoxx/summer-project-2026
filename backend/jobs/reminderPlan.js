import { localWallClock } from "../lib/localTime.js";

/**
 * Decide which opted-in users are due a reminder at instant `now`.
 *
 * Pure, like computeStreak: no database and no clock. It knows nothing about
 * which reminder it is planning; callers map their own fields into the
 * candidate shape.
 *
 * @param {Array<{ id: string, timezone: string, hour: number, lastSentKey: string|null }>} candidates
 * @param {Date} now
 * @returns {{
 *   due: Array<{ id: string, dayKey: string }>,
 *   skipped: Array<{ id: string, reason: "invalid-timezone"|"wrong-hour"|"already-sent" }>,
 * }}
 */
export function planReminders(candidates, now) {
  const due = [];
  const skipped = [];
  for (const candidate of candidates) {
    const clock = localWallClock(now, candidate.timezone);
    if (!clock) {
      skipped.push({ id: candidate.id, reason: "invalid-timezone" });
    } else if (clock.hour !== candidate.hour) {
      skipped.push({ id: candidate.id, reason: "wrong-hour" });
    } else if (candidate.lastSentKey === clock.dayKey) {
      skipped.push({ id: candidate.id, reason: "already-sent" });
    } else {
      due.push({ id: candidate.id, dayKey: clock.dayKey });
    }
  }
  return { due, skipped };
}

/**
 * Drop users who already logged something on their own local day.
 * `loggedIds` holds string ids; an ObjectId would never match.
 */
export function withoutLogged(due, loggedIds) {
  return due.filter((entry) => !loggedIds.has(entry.id));
}
