import { tokenUserId } from "@/api/client";
import { tierFor } from "@/lib/streakBadges";

const STORAGE_KEY = "bnm_streak_seen";

/**
 * What's worth celebrating about the streak since this device last showed it,
 * or null. Also records what it's showing now, so each rise is marked once.
 *
 * Only a rise across days counts. A streak goes up overnight — today joins it
 * the moment it starts on budget — so the first look each day is when there's
 * news. Rises within a day are edits (deleting the expense that tipped today
 * over) or a restore, which has its own confirmation.
 *
 * Nothing is celebrated the first time a device or account sees the streak:
 * with no earlier figure there's no rise to show, and "5 days!" on a phone
 * you signed into a minute ago would be a claim about days it never saw.
 */
export function streakMoment({ currentStreak, longestStreak }, today) {
  const user = tokenUserId();
  let seen = null;
  try {
    seen = JSON.parse(localStorage.getItem(STORAGE_KEY));
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ user, day: today, streak: currentStreak, best: longestStreak })
    );
  } catch {
    // Storage unavailable (private mode): no memory, so no moments. Fine.
    return null;
  }

  if (!seen || seen.user !== user || seen.day === today) return null;
  if (!(currentStreak > seen.streak)) return null;

  return {
    from: seen.streak,
    // Crossed into a new badge (every five days; see streakBadges). After days
    // away a rise can skip one — 8 to 16 goes Bronze to Gold — and the badge
    // it lands on is the news, so that's the one named.
    upgraded: tierFor(currentStreak) > tierFor(seen.streak),
    // Beating a best you'd already seen. A best of 0 was no record to beat.
    newBest: currentStreak === longestStreak && longestStreak > seen.best && seen.best > 0,
  };
}
