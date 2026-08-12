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
import RecurringSheet from "./components/RecurringSheet.jsx";
import DailySpendingCard from "./components/DailySpendingCard.jsx";
import SavingsGoalCard from "./components/SavingsGoalCard.jsx";
import { CategoriesProvider } from "./hooks/useCategories.jsx";
import { AccountsProvider } from "./hooks/useAccounts.jsx";
import { ToastProvider } from "./hooks/useToast.jsx";
import { AuthProvider } from "./hooks/useAuth.jsx";
import { BudgetPeriodProvider } from "./hooks/useBudgetPeriod.jsx";
import AmountCalculator from "./components/AmountCalculator.jsx";
import SwitchRow from "./components/SwitchRow.jsx";
import { LensTab, StatTile } from "./pages/StatsPage.jsx";
import { SavedVsSpentCard, CategoryCard } from "./pages/TrackerPage.jsx";
import {
  DynamicDailyHero,
  WhatIfCard,
  PaceForecastCard,
  GoalDailyCard,
} from "./pages/PlanPage.jsx";
import { Section, Row, RowValue, Segmented } from "./pages/MorePage.jsx";
import Avatar from "./components/Avatar.jsx";
import {
  BarChart3 as _bar,
  Users as _users,
  CalendarRange as _cal,
  Wallet as _wallet,
  Repeat as _repeat,
  PiggyBank as _piggy,
  Sun as _sun,
  Moon as _moon,
  LogOut as _out,
  Search as _search,
  ArrowLeftRight as _swap,
} from "lucide-react";

/** Icons for the More harness view, matching the page's own set. */
const I = {
  bar: _bar, users: _users, cal: _cal, wallet: _wallet, repeat: _repeat,
  piggy: _piggy, sun: _sun, moon: _moon, out: _out,
};
import { ThemeProvider } from "./hooks/useTheme.jsx";
import { useChartColors } from "./hooks/useChartColors.js";
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
 * The provider stack the real components reach for. Auth comes first because
 * CategoriesProvider and the demo guard both read it. With no backend behind
 * them these settle on their built-in defaults, which is what these views want.
 */
function Providers({ children }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <BudgetPeriodProvider>
          <CategoriesProvider>
            <AccountsProvider>{children}</AccountsProvider>
          </CategoriesProvider>
        </BudgetPeriodProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

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
        <h1 className="text-title-lg">All Months</h1>
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

/**
 * The two Tracker donut cards, with the mockup's own numbers so a shot can be
 * held against `design/mockups.html` §06 directly.
 *
 * Both cards take their palette as a prop rather than reaching for a provider,
 * which is what lets them render here without the page's data plumbing.
 * `?empty=1` shows the no-data state instead.
 */
function TrackerView() {
  const colors = useChartColors();
  const empty = params.get("empty") === "1";

  const saved = 952.6;
  const spent = 287.4;
  const cats = [
    ["Food & Drinks", 98.4, "#CC624E", "#FE9580"],
    ["Shopping", 74.9, "#659734", "#94C866"],
    ["Transport", 52.2, "#B9740F", "#F0A346"],
    ["Entertainment", 34.5, "#139A94", "#1ED0C8"],
    ["Travel", 27.4, "#1290CC", "#5DC1FD"],
  ];
  const dark = params.get("theme") !== "light";
  const byCategory = cats.map(([name, value, light, night]) => ({
    name,
    value,
    color: dark ? night : light,
  }));

  return (
    <div className="mx-auto w-full max-w-app space-y-3 p-4">
      <SavedVsSpentCard
        saved={empty ? 0 : saved}
        spent={empty ? 0 : spent}
        percentageSaved={empty ? 0 : 77}
        hasData={!empty}
        colors={colors}
        footnote={empty ? null : "Goal: set aside $300.00 this month"}
      />
      <Providers>
        <SavingsGoalCard
          target={300}
          income={1240}
          spent={287.4}
          period={{ id: "p", start: "2026-08-01", end: "2026-08-31" }}
        />
      </Providers>
      <CategoryCard
        byCategory={empty ? [] : byCategory}
        spent={empty ? 0 : spent}
        colors={colors}
        emptyNoun="month"
      />
    </div>
  );
}

/**
 * The Plan page's four planners on the mockup's own August numbers (§07):
 * $1,240 in, $300 reserved, $287.40 spent, day 11 of 31. That set is what makes
 * both of the mockup's headline figures come out — $32.63/day and $26.13/day.
 *
 * `?filled=1` types into the what-if and goal fields so the result strips show.
 */
function PlanView() {
  const P = {
    income: 1240,
    savings: 300,
    spentSoFar: 287.4,
    periodDays: 31,
    dayOfPeriod: 11,
    daysLeft: 21,
    daysAfterToday: 20,
    todayBudget: 32.63,
    noun: "month",
  };

  useEffect(() => {
    if (params.get("filled") !== "1") return;
    // React tracks the input's value internally, so setting .value directly is
    // ignored — go through the native setter and fire a bubbling input event.
    const set = (id, v) => {
      const el = document.getElementById(id);
      if (!el) return;
      Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      ).set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("whatif-price", "120");
    set("goal-target", "450");
  }, []);

  return (
    <div className="mx-auto w-full max-w-app p-4">
      <DynamicDailyHero
        income={P.income}
        savings={P.savings}
        spentSoFar={P.spentSoFar}
        daysAfterToday={P.daysAfterToday}
        noun={P.noun}
      />
      <div className="mt-[26px] space-y-3">
        <WhatIfCard
          leftToday={P.todayBudget}
          income={P.income}
          savings={P.savings}
          spentSoFar={P.spentSoFar}
          daysAfterToday={P.daysAfterToday}
          noun={P.noun}
        />
        <PaceForecastCard
          income={P.income}
          savings={P.savings}
          spentSoFar={P.spentSoFar}
          periodDays={P.periodDays}
          dayOfPeriod={P.dayOfPeriod}
          periodEndYmd="2026-08-31"
          daysAfterToday={P.daysAfterToday}
          todayBudget={P.todayBudget}
          noun={P.noun}
        />
        <GoalDailyCard
          income={P.income}
          savings={P.savings}
          spentBeforeToday={P.spentSoFar}
          daysLeft={P.daysLeft}
          noun={P.noun}
        />
      </div>
    </div>
  );
}

/**
 * The More page's settings list, built from the same Section/Row primitives the
 * page uses. The page itself needs six providers and a logged-in session, so
 * this composes the mockup's §07 arrangement out of the real parts instead.
 */
function MoreView() {
  const [theme, setTheme] = useState(
    params.get("theme") === "light" ? "light" : "dark"
  );
  const user = { username: "shaunteo", email: "shaunteo2003@gmail.com", avatar: "panda" };

  return (
    <div className="mx-auto w-full max-w-app px-4 pt-6">
      <div className="flex items-center gap-3.5">
        <Avatar user={user} className="h-[54px] w-[54px]" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[19px] font-semibold tracking-[-0.02em]">
            {user.username}
          </h1>
          <p className="mt-0.5 truncate text-meta text-ink-3">{user.email}</p>
        </div>
        <Button
          variant="outline"
          className="h-8 shrink-0 rounded-sm px-3.5 text-[13px] font-medium"
        >
          Edit
        </Button>
      </div>

      <Section label="Browse">
        <Row icon={I.bar} title="Stats" meta="Spending breakdown & trends" onClick={() => {}} />
        <Row
          icon={I.users}
          title="Friends"
          meta="Compare savings on the leaderboard"
          onClick={() => {}}
        />
      </Section>

      <Section label="Budget">
        <Row
          icon={I.cal}
          title="Budget period"
          meta="Resets on the 1st"
          value={<RowValue>Monthly</RowValue>}
          onClick={() => {}}
        />
        <Row
          icon={I.wallet}
          title="Bank accounts"
          meta="Tag where money comes and goes"
          value={<RowValue>3</RowValue>}
          onClick={() => {}}
        />
        <Row
          icon={I.repeat}
          title="Repeating entries"
          meta="Added automatically"
          value={<RowValue>4</RowValue>}
          onClick={() => {}}
        />
        <Row
          icon={I.piggy}
          title="Savings target"
          meta="August · repeats monthly"
          value={<RowValue strong>$300.00</RowValue>}
          onClick={() => {}}
        />
      </Section>

      <Section label="Preferences">
        <Row
          icon={theme === "dark" ? I.moon : I.sun}
          title="Appearance"
          meta={theme === "dark" ? "Dark mode" : "Light mode"}
          chevron={false}
          value={
            <Segmented
              label="Appearance"
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              value={theme}
              onChange={setTheme}
            />
          }
        />
      </Section>

      <Section label="Account">
        <Row icon={I.out} title="Log out" chevron={false} onClick={() => {}} />
      </Section>

      <div className="mt-[30px] text-center">
        <button className="rounded-sm px-2.5 py-1.5 text-[13px] font-medium text-negative">
          Delete account
        </button>
        <p className="mt-4 text-[11.5px] leading-relaxed text-ink-3">
          Broke No More · Avatars by Twemoji (CC-BY 4.0)
        </p>
      </div>
    </div>
  );
}

/**
 * The repeating-entries sheet, in its two states. `?form=1` opens the editor;
 * the default shows the saved list, including a paused rule and the delete
 * confirmation, which are the states with the most colour decisions in them.
 */
function RecurringView() {
  const rules = [
    { id: "1", description: "Rent", amount: 650, type: "expense", category: "Shopping",
      frequency: "monthly", dayOfMonth: 1, startKey: "2026-01-01" },
    { id: "2", description: "Allowance", amount: 1200, type: "income", category: "Allowance",
      frequency: "monthly", dayOfMonth: 28, startKey: "2026-01-01" },
    { id: "3", description: "Spotify", amount: 11.98, type: "expense", category: "Entertainment",
      frequency: "weekly", weekday: 2, startKey: "2026-01-01", paused: true },
  ];

  useEffect(() => {
    if (params.get("form") !== "1") return;
    const btn = [...document.querySelectorAll("button")].find((b) =>
      b.textContent.includes("New repeating entry")
    );
    btn?.click();
  }, []);

  // The sheet reaches for categories, accounts, toasts and the demo guard.
  // Their providers fall back to the built-in category set when the API isn't
  // there, which is exactly what this view needs.
  return (
    <Providers>
    <RecurringSheet
      open
      onClose={() => {}}
      rules={params.get("empty") === "1" ? [] : rules}
      onAdd={async () => {}}
      onUpdate={async () => {}}
      onRemove={async () => {}}
    />
    </Providers>
  );
}

/**
 * The daily-spending card over a 31-day period, with a couple of over-budget
 * days so the tints and the legend both show. `?chart=1` switches to the bar
 * view (the card remembers the choice in localStorage, so it's forced here).
 */
function DailyView() {
  const start = "2026-08-01";
  const ymd = (i) => `2026-08-${String(i + 1).padStart(2, "0")}`;
  const spend = [12, 0, 41, 8, 33, 60, 5, 22, 0, 18, 47, 9, 0, 25, 31, 14];
  const periodDays = spend.map((v, i) => ({ date: ymd(i), spent: v, budget: 32.63 }));
  const transactions = spend.flatMap((v, i) =>
    v === 0
      ? []
      : [{ _id: `t${i}`, type: "expense", amount: v, date: `${ymd(i)}T00:00:00.000Z`,
           category: "Food & Drinks", description: "Lunch" }]
  );

  localStorage.setItem("spendingView", params.get("chart") === "1" ? "chart" : "calendar");

  return (
    <Providers>
        <div className="mx-auto w-full max-w-app p-4">
          <DailySpendingCard
            transactions={transactions}
            income={1240}
            period={{ start, end: "2026-08-31", days: 31, daysLeft: 15 }}
            periodDays={periodDays}
            todayBudget={32.63}
          />
        </div>
    </Providers>
  );
}

/**
 * The Friends page's search field, requests and leaderboard, on the mockup's
 * §07 roster — the arrangement the page now renders.
 */
function FriendsView() {
  const board = [
    ["shaunteo", 77, true], ["marcus", 64], ["priya", 58], ["dan", 41], ["weiling", 33],
  ];

  return (
    <div className="mx-auto w-full max-w-app px-4 pt-6">
      <h1 className="text-title-lg">Friends</h1>
      <p className="mt-1 text-[13px] text-ink-3">Savings rate · 1–31 August</p>

      <div className="relative mt-4">
        <_search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
        <Input placeholder="Find someone by username" className="pl-10" readOnly />
      </div>

      <section className="mt-6">
        <h2 className="mb-2.5 px-0.5 text-overline text-ink-3">Requests · 2</h2>
        <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-card [&>*+*]:border-t [&>*+*]:border-hairline">
          {["jaymes", "aaron"].map((n) => (
            <div key={n} className="flex items-center gap-3 px-4 py-[13px]">
              <Avatar user={{ username: n }} className="h-[34px] w-[34px]" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium tracking-[-0.01em]">{n}</span>
                <span className="mt-0.5 block truncate text-meta text-ink-3">Wants to compare</span>
              </span>
              <span className="flex shrink-0 gap-1.5">
                <button className="flex h-[30px] items-center rounded-[9px] border border-hairline-strong px-2.5 text-[12.5px] font-medium text-ink-2">Decline</button>
                <button className="flex h-[30px] items-center rounded-[9px] bg-ink px-2.5 text-[12.5px] font-semibold text-surface">Accept</button>
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <h2 className="mb-2.5 px-0.5 text-overline text-ink-3">Leaderboard</h2>
        <ul className="-mx-4 border-y border-hairline bg-surface [&>*+*]:border-t [&>*+*]:border-hairline">
          {board.map(([n, pct, me], i) => (
            <li key={n} className={`flex items-center gap-3 px-4 py-[13px] ${me ? "bg-surface-2" : ""}`}>
              <span className={`num w-4 shrink-0 text-center text-[12.5px] ${i < 3 ? "font-semibold text-ink-2" : "font-medium text-ink-3"}`}>{i + 1}</span>
              <Avatar user={{ username: n }} className="h-[34px] w-[34px]" />
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium tracking-[-0.01em]">
                {n}
                {me && <span className="ml-1.5 text-[11px] font-medium text-ink-3">You</span>}
              </span>
              <span className="num shrink-0 text-[15px] font-medium text-positive">{pct}%</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * The grouped ledger from §05: a day header carrying the day's net, then that
 * day's rows on hairlines. Mirrors the page's markup without its data layer.
 */
function LedgerGroupedView() {
  const days = [
    ["Today · 11 Aug", "−$12.70", null, [
      ["food", "Chicken rice", "Food & Drinks · Trust", "−$4.50"],
      ["transport", "Grab to school", "Transport · Trust", "−$8.20"],
    ]],
    ["Yesterday · 10 Aug", "−$29.90", null, [
      ["shopping", "Uniqlo tee", "Shopping · Trust", "−$29.90"],
    ]],
    ["8 Aug", "−$10.90", null, [
      ["entertainment", "Spotify", "Entertainment · DBS", "−$10.90", true],
    ]],
    ["4 Aug", "—", null, [["transfer", "DBS → Trust", "Transfer · doesn't touch your budget", "$400.00"]]],
    ["1 Aug", "+$1,240.00", "pos", [
      ["allowance", "Monthly allowance", "Allowance · DBS", "+$1,240.00", false, "pos"],
    ]],
  ];
  const CAT = {
    food: "#CC624E", transport: "#B9740F", shopping: "#659734",
    entertainment: "#139A94", allowance: "#7A79D7",
  };
  const dark = params.get("theme") !== "light";
  const DARK = {
    food: "#FE9580", transport: "#F0A346", shopping: "#94C866",
    entertainment: "#1ED0C8", allowance: "#AAADFD",
  };

  return (
    <div className="mx-auto w-full max-w-app px-4 pt-6">
      <h1 className="text-title-lg">Transactions</h1>
      <p className="mt-1 text-[13px] text-ink-3">1–31 August · this period · 5 entries</p>
      {days.map(([label, sub, subCol, rows]) => (
        <section key={label} className="mt-[22px]">
          <header className="flex items-baseline justify-between gap-3 pb-2">
            <h2 className="text-overline text-ink-3">{label}</h2>
            <span className={`num text-[12px] font-medium ${subCol ? "text-positive" : "text-ink-3"}`}>{sub}</span>
          </header>
          <ul className="-mx-4 border-y border-hairline bg-surface [&>*+*]:border-t [&>*+*]:border-hairline">
            {rows.map(([c, t, m, a, rep, col]) => (
              <li key={t} className="flex items-center gap-3 px-4 py-[13px]">
                {c === "transfer" ? (
                  <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-3">
                    <_swap className="h-4 w-4" />
                  </span>
                ) : (
                  <span
                    className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-sm"
                    style={{
                      background: `color-mix(in srgb, ${(dark ? DARK : CAT)[c]} 14%, transparent)`,
                      color: (dark ? DARK : CAT)[c],
                    }}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-[15px] font-medium tracking-[-0.01em]">
                    <span className="truncate">{t}</span>
                    {rep && <_repeat className="h-3 w-3 shrink-0 text-ink-3" />}
                  </span>
                  <span className="mt-0.5 block truncate text-meta text-ink-3">{m}</span>
                </span>
                <span className={`num shrink-0 text-[15px] font-medium ${col ? "text-positive" : c === "transfer" ? "text-ink-3" : "text-ink"}`}>{a}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
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
  tracker: TrackerView,
  plan: PlanView,
  more: MoreView,
  recurring: RecurringView,
  daily: DailyView,
  friends: FriendsView,
  grouped: LedgerGroupedView,
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

// ThemeProvider resolves its own initial theme from storage, then re-applies the
// `dark` class in an effect. Left alone it would fight the pre-paint class
// harness.html sets from ?theme=, so seed storage with the same answer first.
localStorage.setItem("bnm_theme", params.get("theme") === "light" ? "light" : "dark");

ReactDOM.createRoot(document.getElementById("root")).render(
  <MotionConfig reducedMotion={reducedMotion}>
    <ThemeProvider>
      <Harness />
    </ThemeProvider>
  </MotionConfig>
);
