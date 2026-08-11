/**
 * Design harness — a dev-only page for eyeballing components at device size,
 * in both themes, without booting the backend or logging in.
 *
 * Served by Vite at /harness.html (dev only; not part of the production build,
 * which has its own single `index.html` entry).
 *
 *   npm run dev
 *   open http://localhost:5173/harness.html?tone=destructive&press=1,2,.,5,0,+,8
 *
 * Query params:
 *   theme   light | dark              (default dark; applied in harness.html)
 *   view    calculator | savings | stats | keyboard  (default calculator)
 *   tone    destructive | success     expense or income styling (calculator)
 *   amount  seed value for the field, e.g. 48
 *   repeat  1 to start the savings view's toggle switched on
 *   lens    all | months — which headline lens the stats view opens on
 *   keyboard  px height of a simulated on-screen keyboard (keyboard view)
 *   press   comma-separated key labels or aria-labels to click after mount,
 *           e.g. 1,2,.,5,0,+,8 — lets a screenshot capture a mid-expression
 *           state. Use aria-labels for icon keys: Backspace, Clear, Divide.
 *
 * `npm run shots` drives this with headless Chrome; see scripts/shots.mjs.
 */
import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import { MotionConfig } from "framer-motion";

import BottomSheet from "./components/BottomSheet.jsx";
import AmountCalculator from "./components/AmountCalculator.jsx";
import SwitchRow from "./components/SwitchRow.jsx";
import { LensTab, StatTile } from "./pages/StatsPage.jsx";
import { Button } from "./components/ui/button.jsx";
import { Input } from "./components/ui/input.jsx";
import { Label } from "./components/ui/label.jsx";
import "./index.css";

const params = new URLSearchParams(location.search);

/**
 * Report a reduced-motion preference before anything mounts.
 *
 * `MotionConfig reducedMotion` below only reaches framer's own components —
 * framer's `useReducedMotion()` hook, which `useCountUp` relies on, reads the
 * media query directly and ignores it. Without this, a screenshot of any
 * AnimatedNumber captures it part-way through its 1.2s count-up: $4,820.50
 * photographs as $198.47, and the frame looks entirely plausible. Exactly the
 * class of silent-wrong-capture the rest of this harness exists to prevent.
 *
 * Pass ?motion=on to watch the real animations by hand.
 */
if (params.get("motion") !== "on") {
  const real = window.matchMedia.bind(window);
  window.matchMedia = (query) =>
    /prefers-reduced-motion/.test(query)
      ? {
          matches: true,
          media: query,
          onchange: null,
          addListener() {},
          removeListener() {},
          addEventListener() {},
          removeEventListener() {},
          dispatchEvent: () => false,
        }
      : real(query);
}

const tone = params.get("tone") || "destructive";
const view = params.get("view") || "calculator";
const initialValue = params.get("amount") || "";
const press = (params.get("press") || "").split(",").filter(Boolean);
// Headless Chrome refuses to open a window narrower than 500px CSS, so a real
// 375px phone viewport can't be had from --window-size alone. The sheet is
// centred and capped at max-w-app, so pinning that cap reproduces phone width
// exactly where it matters: the sheet's own layout.
const width = params.get("width");

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Click keypad keys one at a time. Each click must settle into React state
 * before the next is looked up, so this yields between presses rather than
 * firing them all in one synchronous loop.
 */
function useScriptedPresses() {
  const [done, setDone] = useState(press.length === 0);

  useEffect(() => {
    if (!press.length) return;
    let cancelled = false;
    (async () => {
      await wait(250); // let the sheet finish sliding up
      for (const label of press) {
        if (cancelled) return;
        const target = [...document.querySelectorAll("button")].find(
          (b) =>
            b.textContent.trim() === label ||
            b.getAttribute("aria-label") === label
        );
        if (!target) {
          console.warn(`[harness] no key matching ${JSON.stringify(label)}`);
        } else {
          target.click();
        }
        await wait(40);
      }
      if (cancelled) return;
      setDone(true);
      // Screenshot scripts poll for this.
      document.body.dataset.harnessReady = "1";
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return done;
}

/**
 * Publish the real CSS viewport onto <body>, so a screenshot script can assert
 * it captured the size it asked for. Headless Chrome's --window-size and
 * --force-device-scale-factor interact confusingly; this makes it checkable
 * instead of guessable.
 */
function useViewportReadout() {
  useEffect(() => {
    const publish = () => {
      document.body.dataset.viewport = `${window.innerWidth}x${window.innerHeight}`;
    };
    publish();
    window.addEventListener("resize", publish);
    return () => window.removeEventListener("resize", publish);
  }, []);
}

/**
 * The savings sheet from /more, close enough to eyeball the repeat toggle in
 * context: how it sits under the amount field, and how much of the sheet the
 * two-line description eats on a short phone. `repeat=1` starts it switched on.
 */
function SavingsView() {
  const [repeat, setRepeat] = useState(params.get("repeat") === "1");

  return (
    <BottomSheet open onClose={() => {}} title="Savings target">
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-1">
          <span className="flex h-9 w-9 items-center justify-center text-muted-foreground">
            ‹
          </span>
          <span className="font-semibold tabular-nums">August 2026</span>
          <span className="flex h-9 w-9 items-center justify-center text-muted-foreground">
            ›
          </span>
        </div>

        <div className="space-y-2">
          <Label htmlFor="monthly-savings">Amount to set aside in August</Label>
          <Input id="monthly-savings" defaultValue={initialValue || "320"} />
          <p className="text-xs text-muted-foreground">
            Reserved from this month's income first — your daily budget is
            what's left, spread over the days remaining.
          </p>
        </div>

        <SwitchRow
          checked={repeat}
          onChange={setRepeat}
          label="Repeat every month"
          description="New months start with your latest target, so you don't have to set it again."
        />

        <Button className="w-full">Save for August</Button>
      </div>
    </BottomSheet>
  );
}

/**
 * The headline block from /stats, in both lenses. The rest of that page needs
 * the category provider, but these tiles don't — and the four-up grid is the
 * part whose layout is hard to predict on a small screen. `lens=months` shows
 * the two-tile per-month view instead.
 */
function StatsView() {
  const [lens, setLens] = useState(params.get("lens") === "months" ? "months" : "all");
  // ?big=1 pushes the totals to six figures — the width the tiles must not
  // spill at, and the reason the value size steps down.
  const big = params.get("big") === "1";

  return (
    <div className="mx-auto w-full max-w-app space-y-4 p-5">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">All Months</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Savings vs spending across every month you've tracked.
        </p>
      </div>

      <div
        className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-muted/40 p-1"
        role="group"
        aria-label="Headline figures"
      >
        <LensTab
          active={lens === "all"}
          onClick={() => setLens("all")}
          label="All time"
          hint="Everything totalled"
        />
        <LensTab
          active={lens === "months"}
          onClick={() => setLens("months")}
          label="Per month"
          hint="Month by month"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        {lens === "all" ? (
          <>
            <StatTile label="Total earned" value={big ? 148205.5 : 4820.5} money />
            <StatTile label="Total spent" value={big ? 113611.75 : 3611.75} money />
            <StatTile
              label="Total saved"
              value={big ? 34593.75 : 1208.75}
              money
              accent
            />
            <StatTile
              label="Savings rate"
              value={25}
              suffix="%"
              accent
              hint="Of everything earned"
            />
          </>
        ) : (
          <>
            <StatTile label="Months tracked" value={7} />
            <StatTile
              label="Average month"
              value={31}
              suffix="%"
              accent
              hint="Each month counts once"
            />
          </>
        )}
      </div>
    </div>
  );
}


/**
 * The add-entry sheet at phone size with a simulated keyboard up — the case
 * that was broken: on iOS the sheet stayed behind the keyboard and you couldn't
 * see the description you were typing into. `keyboard=300` fakes a 300px
 * keyboard by shrinking the visual viewport, exactly as Safari does.
 */
function KeyboardView() {
  const px = Number(params.get("keyboard") || 0);

  useEffect(() => {
    if (!px || !window.visualViewport) return;
    const vv = window.visualViewport;
    Object.defineProperty(vv, "height", {
      configurable: true,
      get: () => window.innerHeight - px,
    });
    vv.dispatchEvent(new Event("resize"));
  }, []);

  return (
    <>
      {/* The strip the keyboard would occupy, so the shot shows the overlap. */}
      {px > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-[60] flex items-start justify-center border-t-2 border-dashed border-red-500/60 bg-red-500/10 pt-2 text-xs font-semibold text-red-500"
          style={{ height: px }}
        >
          simulated keyboard ({px}px)
        </div>
      )}
      <BottomSheet open onClose={() => {}} title="Add expense">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Paid from</Label>
            <div className="flex flex-wrap gap-2">
              <span className="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm">Trust</span>
              <span className="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-sm">DBS</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <div className="grid grid-cols-3 gap-2">
              {["Food", "Transport", "Shopping", "Fun", "Travel"].map((c) => (
                <span key={c} className="flex min-h-[68px] items-center justify-center rounded-xl border border-border text-[11px]">
                  {c}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="kb-description">Description</Label>
              <span className="text-xs text-muted-foreground">Optional</span>
            </div>
            <Input id="kb-description" defaultValue="Chicken rice" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Amount</Label>
              <Input defaultValue="4.50" />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input defaultValue="2026-08-08" />
            </div>
          </div>
          <Button className="w-full">Add expense</Button>
        </div>
      </BottomSheet>
    </>
  );
}


/**
 * The ledger's filter controls and a transfer entry, at phone width.
 *
 * Type stays a full-width segmented control so all three options are always
 * visible; the account filter collapses to one button beside the search, and
 * opens a sheet listing every account. An earlier attempt merged both into one
 * scrolling chip row, which pushed the account options off screen — worse with
 * every account added.
 */
function LedgerView() {
  const [filter, setFilter] = useState("all");
  const account = params.get("account");

  return (
    <div className="mx-auto w-full max-w-app p-4">
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <Input placeholder="Search description or category" className="px-9" />
        </div>
        <button
          type="button"
          className={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium ${
            account
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-input text-muted-foreground"
          }`}
        >
          {account ? (
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#C26B6B" }} />
          ) : (
            <span className="text-base leading-none">◫</span>
          )}
          <span>{account || "Account"}</span>
          <span className="text-xs opacity-60">▾</span>
        </button>
      </div>

      <div className="mt-3 flex gap-1 rounded-full bg-muted p-1">
        {[
          ["all", "All"],
          ["expense", "Expenses"],
          ["income", "Income"],
        ].map(([v, label]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            className={`relative flex-1 rounded-full px-3 py-1.5 text-sm font-medium ${
              filter === v ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {filter === v && (
              <span className="absolute inset-0 rounded-full bg-card shadow-sm" />
            )}
            <span className="relative">{label}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between gap-3 p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C26B6B22] text-[#C26B6B]">*</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">Chicken rice</p>
                <p className="text-xs text-muted-foreground">6 Aug - Food &amp; Drinks - Trust</p>
              </div>
            </div>
            <span className="font-bold tabular-nums text-destructive">-$4.50</span>
          </div>
        </div>

        <div className="rounded-xl border border-dashed border-border bg-card">
          <div className="flex items-center justify-between gap-3 p-3.5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">T</span>
              <div className="min-w-0">
                <p className="truncate font-semibold">DBS to Trust</p>
                <p className="text-xs text-muted-foreground">2 Aug - Transfer</p>
              </div>
            </div>
            <span className="font-bold tabular-nums text-muted-foreground">$400.00</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const VIEWS = {
  calculator: () => (
    <BottomSheet open onClose={() => {}} title="Calculator" closeLabel="Back to form">
      <AmountCalculator
        initialValue={initialValue}
        tone={tone}
        onApply={() => {}}
        onCancel={() => {}}
      />
    </BottomSheet>
  ),
  savings: SavingsView,
  stats: StatsView,
  keyboard: KeyboardView,
  ledger: LedgerView,
};

function Harness() {
  useViewportReadout();
  useScriptedPresses();

  const View = VIEWS[view];
  if (!View) {
    return <p style={{ padding: 24 }}>Unknown view: {view}</p>;
  }

  return (
    <>
      {width && (
        <style>{`.max-w-app{max-width:${Number(width)}px !important}`}</style>
      )}
      <View />
    </>
  );
}

/**
 * Animations are off by default. Under headless Chrome's --virtual-time-budget,
 * each framer-motion spring consumes virtual time; a handful of scripted key
 * presses can exhaust the budget mid-sequence and the screenshot then captures
 * a half-entered state that looks perfectly plausible. Static appearance is
 * identical either way. Pass ?motion=on to watch transitions by hand.
 */
const reducedMotion = params.get("motion") === "on" ? "user" : "always";

ReactDOM.createRoot(document.getElementById("root")).render(
  <MotionConfig reducedMotion={reducedMotion}>
    <Harness />
  </MotionConfig>
);
