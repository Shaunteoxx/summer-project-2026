/**
 * Generate the PNG app icons in public/icons/ from the favicon's artwork, using
 * the Chrome already on the machine plus macOS `sips`. Run once and commit the
 * output; it isn't part of the build.
 *
 *   npm run icons
 *
 * Each variant renders at 1024px and is downscaled, since headless Chrome
 * won't open a window narrower than 500px. The window is taller than the art
 * and the art is centred in it, because `sips -c` crops from the centre.
 */
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

const CHROME =
  process.env.CHROME_PATH ||
  {
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    linux: "/usr/bin/google-chrome",
  }[process.platform];

const PUBLIC = new URL("../public/", import.meta.url).pathname;
const OUT = join(PUBLIC, "icons");
const RENDER = 1024;

const favicon = await readFile(join(PUBLIC, "favicon.svg"), "utf8");
const brand = favicon.match(/<rect[^>]*fill="(#[0-9a-fA-F]{6})"/)[1];
// Everything after the background tile is the glyph.
const glyph = favicon.replace(/^[\s\S]*?<rect[^>]*\/>/, "").replace(/<\/svg>\s*$/, "");

const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${RENDER}" height="${RENDER}">${body}</svg>`;

const VARIANTS = {
  // Rounded tile on transparency, as the favicon draws it.
  rounded: svg(`<rect width="32" height="32" rx="8" fill="${brand}"/>${glyph}`),
  // Full-bleed and opaque: iOS paints transparency black and applies its own
  // corner mask, and maskable icons get cropped to the platform's shape. The
  // glyph already sits inside the central 80% safe zone.
  square: svg(`<rect width="32" height="32" fill="${brand}"/>${glyph}`),
  // Android badges are masked to one colour, so only a silhouette survives.
  badge: svg(glyph),
};

const OUTPUTS = [
  { variant: "rounded", file: "icon-192.png", size: 192 },
  { variant: "rounded", file: "icon-512.png", size: 512 },
  { variant: "square", file: "icon-maskable-512.png", size: 512 },
  { variant: "square", file: "apple-touch-icon.png", size: 180 },
  { variant: "badge", file: "badge-72.png", size: 72 },
];

const work = await mkdtemp(join(tmpdir(), "bnm-icons-"));
await mkdir(OUT, { recursive: true });

try {
  for (const [name, markup] of Object.entries(VARIANTS)) {
    const html = join(work, `${name}.html`);
    await writeFile(
      html,
      `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;background:transparent">${markup}</body></html>`
    );
    const png = join(work, `${name}.png`);
    await run(CHROME, [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      "--default-background-color=00000000",
      `--window-size=${RENDER},${RENDER + 200}`,
      `--screenshot=${png}`,
      `file://${html}`,
    ]);
    await run("sips", ["-c", String(RENDER), String(RENDER), png]);
  }

  for (const { variant, file, size } of OUTPUTS) {
    const target = join(OUT, file);
    await run("sips", ["-z", String(size), String(size), join(work, `${variant}.png`), "--out", target]);
    console.log(`wrote public/icons/${file}`);
  }
} finally {
  await rm(work, { recursive: true, force: true });
}
