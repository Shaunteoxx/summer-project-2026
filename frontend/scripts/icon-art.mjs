/**
 * The app icon's artwork: a white wallet with two green notes tucked into it,
 * on an ink tile. An empty wallet is the picture of being broke; this one has
 * money in it.
 *
 * Also the piggy bank that iPhone and iPad users can pick instead, under
 * More → App Icon (see src/lib/appIcon.js). It exists only as a Home Screen
 * icon: the favicon, Android and notifications always use the wallet.
 *
 * Drawn in code on a 1024 grid so every size comes from one source: the home
 * screen icons, the maskable one, the favicon, the notification badge, and the
 * mark in the app itself (the top bar, sign-in and the loader).
 * scripts/icons.mjs renders them, so change the drawing here.
 */

// The app's own palette. Ink for the tile, like the in-app mark; the notes take
// dark mode's positive green, because green only ever means money.
const INK = ["#2B2C30", "#121315"];
const WHITE = ["#FFFFFF", "#E9E9E6"];
const GREEN = ["#5CE0AE", "#2BB985"];
const GREEN_PALE = "#9DEBC9";
const TAB_INK = "#1C1D20";
// The piggy bank's coin is gold rather than green: a coin reads as a coin
// before it reads as the brand.
const GOLD = "#F2C14E";

// The wallet's front, and the tab that closes it. The tab is squared off with
// the snap in the middle: a full pill with the dot at one end read as a switch.
const BODY = { x: 206, y: 418, w: 612, h: 392, r: 96 };
const TAB = { x: 608, y: 550, w: 244, h: 128, r: 40 };
const SNAP = { cx: 713, cy: 614, r: 26 };

// Two notes fanned out of the pocket, the one behind paler.
const NOTE = { w: 470, h: 260, r: 26 };
const NOTES = [
  { cx: 496, cy: 350, rot: -11, fill: GREEN_PALE },
  { cx: 530, cy: 366, rot: -2, fill: "url(#green)" },
];

// How big the wallet sits on the tile. Maskable icons are cropped by the
// platform to as little as a circle 80% across, so they draw it smaller.
export const SCALE = 0.94;
export const MASKABLE_SCALE = 0.84;

const box = ({ x, y, w, h, r }, grow = 0) =>
  `x="${x - grow}" y="${y - grow}" width="${w + 2 * grow}" height="${h + 2 * grow}" rx="${r + grow}"`;

function note({ cx, cy, rot, fill }, face) {
  const turn = `transform="rotate(${rot} ${cx} ${cy})"`;
  const rect = `x="${cx - NOTE.w / 2}" y="${cy - NOTE.h / 2}" width="${NOTE.w}" height="${NOTE.h}" rx="${NOTE.r}"`;
  // A banknote's inset border and medallion, printed in white so they tint
  // with the note underneath.
  const print = face
    ? `<rect x="${cx - NOTE.w / 2 + 26}" y="${cy - NOTE.h / 2 + 26}" width="${NOTE.w - 52}" height="${NOTE.h - 52}" rx="16" fill="none" stroke="#FFF" stroke-opacity=".38" stroke-width="10"/>` +
      `<circle cx="${cx}" cy="${cy}" r="${NOTE.h * 0.2}" fill="#FFF" fill-opacity=".38"/>`
    : "";
  return {
    shape: `<rect ${rect} ${turn}/>`,
    art: `<g ${turn}><rect ${rect} fill="${fill}"/>${print}</g>`,
  };
}

function wallet() {
  const notes = NOTES.map((n) => note(n, true));
  // Shade the notes just above the pocket, so they sit inside it rather than
  // lying on top of it.
  const tuck =
    `<clipPath id="notes">${notes.map((n) => n.shape).join("")}</clipPath>` +
    `<g clip-path="url(#notes)"><rect x="${BODY.x - 40}" y="${BODY.y - 34}" width="${BODY.w + 80}" height="64" fill="#000" fill-opacity=".16" filter="url(#soften)"/></g>`;
  return (
    notes.map((n) => n.art).join("") +
    tuck +
    `<rect ${box(BODY)} fill="url(#white)"/>` +
    `<rect ${box(TAB)} fill="${TAB_INK}"/>` +
    `<circle cx="${SNAP.cx}" cy="${SNAP.cy}" r="${SNAP.r}" fill="url(#green)"/>`
  );
}

// The piggy bank, facing right, with a coin halfway into its slot.
const PIG = { cx: 486, cy: 586, rx: 268, ry: 200 };

function piggy() {
  const { cx, cy, rx, ry } = PIG;
  const slotY = cy - ry + 28;
  const coin = { cx: cx - 2, cy: slotY - 92, r: 110 };
  const ear = { x: cx + 96, y: cy - ry + 34 };
  const snout = { x: cx + rx - 44, y: cy - 98, w: 84, h: 136 };
  const leg = (x) => `<rect x="${x}" y="${cy + ry - 90}" width="100" height="154" rx="38" fill="url(#white)"/>`;
  return (
    // Short legs, tucked under the body so only their ends show.
    leg(cx - 170) +
    leg(cx + 78) +
    // A soft ear, tipped forward. Pointed, it read as a cat's; round, a bear's.
    `<path d="M${ear.x - 44} ${ear.y + 34}C${ear.x - 34} ${ear.y - 14} ${ear.x + 4} ${ear.y - 64} ${ear.x + 50} ${ear.y - 84}` +
    `C${ear.x + 70} ${ear.y - 92} ${ear.x + 84} ${ear.y - 80} ${ear.x + 86} ${ear.y - 56}` +
    `C${ear.x + 90} ${ear.y - 20} ${ear.x + 92} ${ear.y + 14} ${ear.x + 90} ${ear.y + 44}Z" fill="url(#white)"/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#white)"/>` +
    // One nostril, seen side on. Two, head on, made the snout read as a plug.
    `<rect x="${snout.x}" y="${snout.y}" width="${snout.w}" height="${snout.h}" rx="${snout.w / 2}" fill="url(#white)"/>` +
    `<ellipse cx="${snout.x + snout.w - 28}" cy="${snout.y + snout.h / 2}" rx="11" ry="20" fill="${TAB_INK}" fill-opacity=".75"/>` +
    `<circle cx="${cx + 160}" cy="${cy - 88}" r="19" fill="${TAB_INK}"/>` +
    `<rect x="${cx - 92}" y="${slotY - 13}" width="184" height="26" rx="13" fill="${TAB_INK}"/>` +
    // The coin, its lower half already through the slot.
    `<clipPath id="above-slot"><rect width="1024" height="${slotY}"/></clipPath>` +
    `<g clip-path="url(#above-slot)"><circle cx="${coin.cx}" cy="${coin.cy}" r="${coin.r}" fill="${GOLD}"/>` +
    `<circle cx="${coin.cx}" cy="${coin.cy}" r="${coin.r - 32}" fill="none" stroke="#FFF" stroke-opacity=".42" stroke-width="12"/></g>`
  );
}

// Each drawing's size on the tile, and how far it's nudged off centre (in its
// own units) to look centred. The wallet's body is the heavy part and its tab
// juts out to the right; the piggy bank's coin sits high above it.
const ARTWORK = {
  wallet: { draw: wallet, scale: SCALE, nudge: [-8.5, -6.4] },
  piggy: { draw: piggy, scale: 0.95, nudge: [-4.2, -16.8] },
};

const place = (scale, [dx, dy]) =>
  `translate(${512 + dx * scale} ${512 + dy * scale}) scale(${scale}) translate(-512 -512)`;

// A superellipse, which is the shape the iOS home screen masks icons to.
export function squircle(size, steps = 360) {
  const a = size / 2;
  const pt = (t) => {
    const c = Math.cos(t), s = Math.sin(t);
    const x = a + a * Math.sign(c) * Math.abs(c) ** 0.4;
    const y = a + a * Math.sign(s) * Math.abs(s) ** 0.4;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  return `M${Array.from({ length: steps }, (_, i) => pt((i / steps) * 2 * Math.PI)).join("L")}Z`;
}

const gradient = (id, [top, bottom], units) =>
  `<linearGradient id="${id}" x1="0" y1="${units ? 200 : 0}" x2="0" y2="${units ? 824 : 1}"${units ? ' gradientUnits="userSpaceOnUse"' : ""}>` +
  `<stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;

/**
 * The icon as a standalone SVG.
 *   art "wallet" or "piggy".
 *   shape "square":   full bleed. iOS and Android cut their own corners.
 *   shape "squircle": a rounded tile on transparency, for places that show
 *                     the image as it is (desktop installs, the favicon).
 */
export function iconSvg({ art = "wallet", shape = "square", scale, lift = true, steps } = {}) {
  const { draw, nudge, scale: size } = ARTWORK[art];
  const clip = shape === "squircle";
  const defs =
    gradient("ink", INK) +
    // The wallet and notes share one light source across the whole tile.
    gradient("white", WHITE, true) +
    gradient("green", GREEN, true) +
    `<radialGradient id="sheen" cx=".5" cy="0" r=".85"><stop offset="0" stop-color="#FFF" stop-opacity=".07"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>` +
    `<filter id="soften" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="12"/></filter>` +
    (lift
      ? `<filter id="lift" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="14" stdDeviation="20" flood-color="#000" flood-opacity=".38"/></filter>`
      : "") +
    (clip ? `<clipPath id="tile"><path d="${squircle(1024, steps)}"/></clipPath>` : "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>${defs}</defs>` +
    `<g${clip ? ' clip-path="url(#tile)"' : ""}>` +
    `<rect width="1024" height="1024" fill="url(#ink)"/><rect width="1024" height="1024" fill="url(#sheen)"/>` +
    `<g${lift ? ' filter="url(#lift)"' : ""}><g transform="${place(scale ?? size, nudge)}">${draw()}</g></g>` +
    `</g></svg>`
  );
}

/**
 * Android's notification badge: the platform keeps only the alpha channel, so
 * this is a white silhouette. Gaps stand in for the colour that separates the
 * notes, the wallet and its tab in the full icon.
 */
export function badgeSvg() {
  const GAP = 26;
  const notes = NOTES.map((n) => note(n, false).shape).join("");
  // Centre the silhouette on its own bounds and fill most of the badge.
  const t = `translate(512 512) scale(1.42) translate(-529 -495)`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><defs>` +
    `<mask id="notes-cut"><rect width="1024" height="1024" fill="#fff"/><rect ${box(BODY, GAP)} fill="#000"/></mask>` +
    `<mask id="body-cut"><rect width="1024" height="1024" fill="#fff"/><rect ${box(TAB, GAP)} fill="#000"/></mask>` +
    `<mask id="tab-cut"><rect width="1024" height="1024" fill="#fff"/><circle cx="${SNAP.cx}" cy="${SNAP.cy}" r="${SNAP.r + 4}" fill="#000"/></mask>` +
    `</defs><g transform="${t}" fill="#fff">` +
    `<g mask="url(#notes-cut)">${notes}</g>` +
    `<rect ${box(BODY)} mask="url(#body-cut)"/>` +
    `<rect ${box(TAB)} mask="url(#tab-cut)"/>` +
    `</g></svg>`
  );
}
