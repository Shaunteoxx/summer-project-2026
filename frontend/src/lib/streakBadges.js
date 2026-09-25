/**
 * Streak badges: a new one every five days on budget.
 *
 * The ladder is the one everyone already reads without being told — bronze,
 * silver, gold, then gems — so nobody has to learn that sapphire outranks
 * platinum. Past the last name the badge keeps upgrading by number (Diamond 2,
 * Diamond 3…), so a long streak never stops earning.
 *
 * A badge belongs to the streak, not the account: break the streak and you're
 * back to earning Bronze. What you've reached before is kept as "earned", read
 * off the longest streak, so the collection still shows how far you once got.
 */
export const DAYS_PER_BADGE = 5;

// `shape` and `detail` drive the art (StreakBadge): coins first, then cut
// gems, then a star, each group adding detail as it climbs, so an upgrade
// looks like more rather than just a different colour.
export const BADGES = [
  { key: "bronze", name: "Bronze", shape: "coin", detail: 1 },
  { key: "silver", name: "Silver", shape: "coin", detail: 2 },
  { key: "gold", name: "Gold", shape: "coin", detail: 3 },
  { key: "platinum", name: "Platinum", shape: "gem", detail: 1 },
  { key: "sapphire", name: "Sapphire", shape: "gem", detail: 2 },
  { key: "amethyst", name: "Amethyst", shape: "gem", detail: 3 },
  { key: "diamond", name: "Diamond", shape: "star", detail: 3 },
];

/** How many badges a streak of `days` has earned: 0 below five days. */
export const tierFor = (days) => Math.floor(Math.max(0, days) / DAYS_PER_BADGE);

/**
 * The badge for tier `tier` (1-based), or null for tier 0. Tiers past the
 * ladder are the top badge with a level: tier 8 is Diamond 2.
 */
export function badgeAt(tier) {
  if (tier < 1) return null;
  const top = BADGES.length;
  const base = BADGES[Math.min(tier, top) - 1];
  const level = tier > top ? tier - top + 1 : 1;
  return {
    ...base,
    tier,
    level,
    days: tier * DAYS_PER_BADGE,
    label: level > 1 ? `${base.name} ${level}` : base.name,
  };
}

/** The badge a streak of `days` holds, or null before the first. */
export const badgeFor = (days) => badgeAt(tierFor(days));

/** The next badge up from a streak of `days`, and how many days away it is. */
export function nextBadge(days) {
  const next = badgeAt(tierFor(days) + 1);
  return { ...next, daysToGo: next.days - Math.max(0, days) };
}

/**
 * How far a streak of `days` is through its current five, 0 to just under 1 —
 * what the ring around the badge fills with. It never reads full: the day it
 * would, the next badge is earned and the count starts again.
 */
export const progressToNext = (days) => (Math.max(0, days) % DAYS_PER_BADGE) / DAYS_PER_BADGE;
