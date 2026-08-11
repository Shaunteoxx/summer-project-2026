/**
 * Screenshot the design harness at device size, in both themes, with headless
 * Chrome. No Playwright install needed — it drives the browser already on the
 * machine.
 *
 *   npm run dev            # in one terminal
 *   npm run shots          # in another
 *
 * Output lands in frontend/.shots/ (gitignored). Add or edit SHOTS below to
 * capture new states; `press` clicks keypad keys so a shot can show a
 * mid-expression display rather than an empty one.
 *
 * Gotchas this script already handles, so you don't rediscover them:
 *  - Headless Chrome CLAMPS the window to a 500px minimum CSS width. Asking for
 *    --window-size=375,667 silently gives you a 500x580 viewport, not an error.
 *    A true phone width is therefore unreachable via --window-size; instead the
 *    harness takes ?width=375 and pins the sheet's max-w-app cap, which is what
 *    actually drives the layout under test.
 *  - --window-size height includes ~87px of browser chrome, so the CSS viewport
 *    is shorter than requested. WINDOW_CHROME_PX compensates.
 *  - --virtual-time-budget fast-forwards timers so animations and the harness's
 *    scripted key presses finish before the frame is captured.
 *  - Every shot asserts the viewport it actually got (the harness publishes it
 *    on body[data-viewport]) so a silently wrong size fails loudly.
 */
import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { promisify } from "node:util";

const run = promisify(execFile);

const CHROME =
  process.env.CHROME_PATH ||
  {
    darwin: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    linux: "/usr/bin/google-chrome",
  }[process.platform];

const BASE = process.env.HARNESS_URL || "http://localhost:5173/harness.html";
const OUT = new URL("../.shots/", import.meta.url).pathname;

// iPhone SE — the tightest viewport the app targets, so the height budget for
// the sheet is worst-case here.
const PHONE_WIDTH = 375;
const CSS_HEIGHT = 667;
const SCALE = 2;
// Chrome won't open narrower than this, so the window stays at the floor and
// the phone width is applied to the sheet instead.
const MIN_WINDOW_WIDTH = 500;
const WINDOW_CHROME_PX = 87;

// `expect` is asserted against the rendered state, so a shot that captured a
// half-entered expression (or a toggle that didn't take) fails instead of
// looking plausible. `probe` says where to read that state from; it defaults to
// the calculator's Use button.
const USE_BUTTON = /Use (?:\$[\d,.]+|amount)/;
const SWITCH_STATE = /role="switch"[^>]*aria-checked="(?:true|false)"/;
const LENS_STATE = /aria-pressed="true"/;
const SHEET_OPEN = /role="dialog"/;
const LEDGER_MARK = /Chicken rice/;

const SHOTS = [
  { name: "expense-dark", theme: "dark", tone: "destructive", press: "1,2,.,5,0,+,8", expect: "Use $20.50" },
  { name: "expense-light", theme: "light", tone: "destructive", press: "1,2,.,5,0,+,8", expect: "Use $20.50" },
  { name: "income-dark", theme: "dark", tone: "success", press: "4,8", expect: "Use $48.00" },
  { name: "income-light", theme: "light", tone: "success", press: "4,8", expect: "Use $48.00" },
  { name: "empty-dark", theme: "dark", tone: "destructive", expect: "Use amount" },
  { name: "empty-light", theme: "light", tone: "destructive", expect: "Use amount" },

  // The savings sheet, to check the repeat toggle in both states and themes.
  { name: "repeat-on-dark", view: "savings", theme: "dark", repeat: "1", probe: SWITCH_STATE, expect: 'role="switch" aria-checked="true"' },
  { name: "repeat-on-light", view: "savings", theme: "light", repeat: "1", probe: SWITCH_STATE, expect: 'role="switch" aria-checked="true"' },
  { name: "repeat-off-dark", view: "savings", theme: "dark", probe: SWITCH_STATE, expect: 'role="switch" aria-checked="false"' },
  { name: "repeat-off-light", view: "savings", theme: "light", probe: SWITCH_STATE, expect: 'role="switch" aria-checked="false"' },

  // The stats headline block: four tiles all-time, two per-month.
  { name: "stats-all-dark", view: "stats", theme: "dark", probe: LENS_STATE, expect: 'aria-pressed="true"' },
  { name: "stats-all-light", view: "stats", theme: "light", probe: LENS_STATE, expect: 'aria-pressed="true"' },
  { name: "stats-months-light", view: "stats", theme: "light", lens: "months", probe: LENS_STATE, expect: 'aria-pressed="true"' },
  { name: "stats-big-light", view: "stats", theme: "light", big: "1", probe: LENS_STATE, expect: 'aria-pressed="true"' },

  // The add sheet with a simulated keyboard: it must sit clear of the strip the
  // keyboard covers, not behind it.
  { name: "keyboard-off-light", view: "keyboard", theme: "light", probe: SHEET_OPEN, expect: 'role="dialog"' },
  { name: "keyboard-on-light", view: "keyboard", theme: "light", keyboard: "300", probe: SHEET_OPEN, expect: 'role="dialog"' },

  // The merged filter row and a transfer entry in the ledger.
  { name: "ledger-light", view: "ledger", theme: "light", probe: LEDGER_MARK, expect: "Chicken rice" },
  { name: "ledger-picked", view: "ledger", theme: "light", account: "Trust", probe: LEDGER_MARK, expect: "Chicken rice" },
];

await mkdir(OUT, { recursive: true });

const WINDOW = `${MIN_WINDOW_WIDTH},${CSS_HEIGHT + WINDOW_CHROME_PX}`;
const EXPECTED_VIEWPORT = `${MIN_WINDOW_WIDTH}x${CSS_HEIGHT}`;

const flags = (extra) => [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  `--force-device-scale-factor=${SCALE}`,
  `--window-size=${WINDOW}`,
  "--virtual-time-budget=6000",
  ...extra,
];

let failed = 0;

for (const { name, expect, probe = USE_BUTTON, ...query } of SHOTS) {
  const url = `${BASE}?${new URLSearchParams({ ...query, width: PHONE_WIDTH })}`;
  const file = `${OUT}${name}.png`;

  await run(CHROME, flags([`--screenshot=${file}`, url]), { maxBuffer: 1 << 28 });

  // Confirm the frame was captured at the size we asked for, showing the state
  // we asked for. Both fail silently otherwise.
  const { stdout } = await run(CHROME, flags(["--dump-dom", url]), {
    maxBuffer: 1 << 28,
  });
  const viewport = stdout.match(/data-viewport="([^"]*)"/)?.[1];
  const state = stdout.match(probe)?.[0];

  const problems = [];
  if (viewport !== EXPECTED_VIEWPORT) {
    problems.push(`viewport=${viewport ?? "<none>"} want ${EXPECTED_VIEWPORT}`);
  }
  if (expect && state !== expect) {
    problems.push(`state=${state ?? "<none>"} want ${JSON.stringify(expect)}`);
  }
  if (problems.length) failed++;
  console.log(
    problems.length
      ? `FAIL ${name.padEnd(16)} ${problems.join("; ")}`
      : `ok   ${name.padEnd(16)} ${state} ${file}`
  );
}

console.log(`\n${SHOTS.length} shots written to ${OUT}`);
if (failed) {
  console.error(`${failed} shot(s) captured at an unexpected viewport.`);
  process.exit(1);
}
