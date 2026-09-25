/**
 * Render the app icons from the artwork in scripts/icon-art.mjs, using the
 * Chrome already on the machine plus macOS `sips`. Run it after changing the
 * artwork and commit the output; it isn't part of the build.
 *
 *   npm run icons
 *
 * Writes public/favicon.svg, the in-app mark at src/assets/brand-mark.svg and
 * the PNGs in public/icons/, then stamps each public file's content hash into
 * its URL in index.html, the manifest and src/lib/appIcon.js. Chrome treats an
 * installed app's icon URLs as immutable: without a new URL it never offers
 * the new icon to people who already have the app.
 *
 * Each PNG renders at 1024px and is downscaled, since headless Chrome won't
 * open a window narrower than 500px. The window is taller than the art and the
 * art is centred in it, because `sips -c` crops from the centre.
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { MASKABLE_SCALE, badgeSvg, iconSvg } from "./icon-art.mjs";

const run = promisify(execFile);

const CHROME =
  process.env.CHROME_PATH ||
  {
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    linux: "/usr/bin/google-chrome",
  }[process.platform];

const ROOT = new URL("../", import.meta.url).pathname;
const PUBLIC = join(ROOT, "public");
const OUT = join(PUBLIC, "icons");
const RENDER = 1024;

const VARIANTS = {
  // Full bleed and opaque: iOS paints transparency black and cuts its own
  // corners.
  square: iconSvg(),
  // Android crops maskable icons to its own shape, as tight as a circle 80%
  // across, so the wallet is drawn smaller.
  maskable: iconSvg({ scale: MASKABLE_SCALE }),
  // Desktop installs and notifications show the image as it is, so it brings
  // its own corners.
  rounded: iconSvg({ shape: "squircle" }),
  // Android badges are masked to one colour, so only a silhouette survives.
  badge: badgeSvg(),
  // The Home Screen icon iPhone users can pick instead (src/lib/appIcon.js).
  piggy: iconSvg({ art: "piggy" }),
};

const OUTPUTS = [
  { variant: "rounded", file: "icon-192.png", size: 192 },
  { variant: "rounded", file: "icon-512.png", size: 512 },
  { variant: "maskable", file: "icon-maskable-512.png", size: 512 },
  { variant: "square", file: "apple-touch-icon.png", size: 180 },
  { variant: "piggy", file: "apple-touch-icon-piggy.png", size: 180 },
  { variant: "badge", file: "badge-72.png", size: 72 },
];

// Too small for the lift shadow to show, and fewer points on the tile's curve
// keep the file light.
const favicon = iconSvg({ shape: "squircle", lift: false, steps: 96 });
// The in-app mark (components/BrandMark): the same tile, drawn up to 56px on
// the sign-in screen, so its curve gets more points. It's imported from src,
// so Vite fingerprints it and no version stamp is needed.
const brandMark = iconSvg({ shape: "squircle", lift: false, steps: 180 });

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 8);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Point each URL at its current content: "/icons/x.png" -> "/icons/x.png?v=1a2b3c4d".
async function stamp(file, urls) {
  let text = await readFile(file, "utf8");
  for (const [url, version] of Object.entries(urls)) {
    text = text.replace(new RegExp(`${escape(url)}(\\?v=[0-9a-f]+)?"`, "g"), `${url}?v=${version}"`);
  }
  await writeFile(file, text);
}

const work = await mkdtemp(join(tmpdir(), "bnm-icons-"));
await mkdir(OUT, { recursive: true });
const versions = {};

try {
  await writeFile(join(PUBLIC, "favicon.svg"), `${favicon}\n`);
  versions["/favicon.svg"] = hash(favicon);
  console.log("wrote public/favicon.svg");
  await mkdir(join(ROOT, "src/assets"), { recursive: true });
  await writeFile(join(ROOT, "src/assets/brand-mark.svg"), `${brandMark}\n`);
  console.log("wrote src/assets/brand-mark.svg");

  for (const [name, markup] of Object.entries(VARIANTS)) {
    const html = join(work, `${name}.html`);
    await writeFile(
      html,
      `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;background:transparent">` +
        markup.replace("<svg ", `<svg width="${RENDER}" height="${RENDER}" `) +
        `</body></html>`
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
    versions[`/icons/${file}`] = hash(await readFile(target));
    console.log(`wrote public/icons/${file}`);
  }

  const pick = (...urls) => Object.fromEntries(urls.map((u) => [u, versions[u]]));
  await stamp(join(ROOT, "index.html"), pick("/favicon.svg", "/icons/apple-touch-icon.png"));
  await stamp(
    join(PUBLIC, "manifest.webmanifest"),
    pick("/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-maskable-512.png")
  );
  await stamp(
    join(ROOT, "src/lib/appIcon.js"),
    pick("/icons/apple-touch-icon.png", "/icons/apple-touch-icon-piggy.png")
  );
  console.log("stamped icon versions into index.html, the manifest and src/lib/appIcon.js");
} finally {
  await rm(work, { recursive: true, force: true });
}
