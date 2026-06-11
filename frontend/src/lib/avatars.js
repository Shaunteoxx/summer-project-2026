// Animal avatar set — Twemoji SVGs bundled in /public/avatars.
// Twemoji is © Twitter, licensed CC-BY 4.0. Keep ids in sync with the backend
// ALLOWED_AVATARS list in authController.js.
export const AVATARS = [
  { id: "dog", label: "Dog" },
  { id: "cat", label: "Cat" },
  { id: "hamster", label: "Hamster" },
  { id: "panda", label: "Panda" },
  { id: "dragon", label: "Dragon" },
  { id: "teddybear", label: "Teddy" },
  { id: "trex", label: "T-rex" },
  { id: "pumpkin", label: "Pumpkin" },
  { id: "snowman", label: "Snowman" },
];

export const AVATAR_IDS = AVATARS.map((a) => a.id);

/** Public URL of an avatar's SVG, or null for an unknown / empty id. */
export function avatarSrc(id) {
  return id && AVATAR_IDS.includes(id) ? `/avatars/${id}.svg` : null;
}
