// Animal avatar set — Twemoji SVGs bundled in /public/avatars.
// Twemoji is © Twitter, licensed CC-BY 4.0. Keep ids in sync with the backend
// ALLOWED_AVATARS list in authController.js.

/**
 * What the picker offers. Deliberately all animals: the set used to include a
 * pumpkin and a snowman, which made it read as "assorted emoji" rather than a
 * considered set.
 *
 * To extend it, drop the Twemoji SVG into /public/avatars and add an entry
 * here. Good candidates that keep the set coherent: fox (1f98a), rabbit
 * (1f430), penguin (1f427), owl (1f989), whale (1f433), koala (1f428),
 * tiger (1f42f).
 */
export const AVATARS = [
  { id: "dog", label: "Dog" },
  { id: "cat", label: "Cat" },
  { id: "hamster", label: "Hamster" },
  { id: "panda", label: "Panda" },
  { id: "teddybear", label: "Teddy" },
  { id: "dragon", label: "Dragon" },
  { id: "trex", label: "T-rex" },
];

/**
 * Everything that still has an SVG on disk, including ids retired from the
 * picker. An existing user who chose a pumpkin keeps their pumpkin — they just
 * can't pick a new one. Silently downgrading them to a monogram would be a
 * worse outcome than a slightly inconsistent set.
 */
const RENDERABLE = [...AVATARS.map((a) => a.id), "pumpkin", "snowman"];

export const AVATAR_IDS = AVATARS.map((a) => a.id);

/** Public URL of an avatar's SVG, or null for an unknown / empty id. */
export function avatarSrc(id) {
  return id && RENDERABLE.includes(id) ? `/avatars/${id}.svg` : null;
}

/**
 * Deterministic accent for the monogram fallback.
 *
 * A user who has never picked an avatar gets their initial on a hue derived
 * from their name rather than a generic grey silhouette — otherwise every such
 * user looks identical to every other on the Friends leaderboard, which is the
 * one screen where telling people apart is the entire point.
 *
 * Hues are the eight category tokens, so this introduces no new colour.
 */
const MONOGRAM_TOKENS = [
  "food",
  "transport",
  "shopping",
  "entertainment",
  "travel",
  "allowance",
  "job",
  "gifts",
];

export function monogramToken(name = "") {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return MONOGRAM_TOKENS[Math.abs(hash) % MONOGRAM_TOKENS.length];
}
