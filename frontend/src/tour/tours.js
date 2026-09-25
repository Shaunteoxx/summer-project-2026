import { stepLabel } from "@/lib/setup";

/**
 * Every tour, tip and guided setup move in the app, as data.
 *
 * One file so the words live together and read as one voice, and so a test
 * can check that every element a tour points at still exists (see
 * tours.test.js) — a redesign that drops one should fail CI rather than
 * quietly skip a step.
 *
 * Kinds, and when each may start on its own:
 *
 *   page   A page's tour: the first visit on which the page has real content.
 *          At most one page-or-tip tour per visit, so arriving somewhere never
 *          plays two back to back.
 *   tip    One feature the first time it appears (over budget, a restore on
 *          offer). Counts against the same one-per-visit allowance, and waits
 *          behind the page's own tour.
 *   sheet  A tip inside a sheet, started by opening that sheet. One per open.
 *   quest  A guided setup move. Never starts on its own; the setup card and
 *          the welcome start them.
 *
 * Steps point at elements carrying a matching `data-tour` attribute. A step
 * whose element isn't on screen is skipped, so a tour can name things that
 * only exist sometimes (the accounts card, the pace verdict) without a
 * condition of its own. What a step can say:
 *
 *   target       data-tour id, a list of them (spotlit together), a function
 *                of ctx, or null for a card with nothing to point at
 *   title, body  text, or a function of ctx
 *   interactive  the reader uses the element itself; everything else is held
 *   blocking     false: no dimming, nothing held (the "Saving…" note)
 *   advanceWhen  (ctx) => true moves on by itself, checked every frame
 *   advanceOn    a signal (see signals.js) that moves on
 *   failOn       a signal that ends the tour
 *   primary      button: a label, { label, run(ctx) }, a function of ctx
 *                returning one, or null for none. Defaults to Next / Done.
 *   secondary    a second button, same shapes
 *   route        quest steps only: the page the step lives on
 *   onGone       what happens if the element leaves: "end" (default), "back"
 *   wait         ms to wait for the element before giving up
 */

const noun = (ctx) => ctx.noun ?? "month";

/**
 * The end of each setup move: point at what just changed, then offer the next
 * move. Falls back to the setup card while the page is still empty, which is
 * the one thing guaranteed to be on Home either way.
 */
function reward({ target, title, body }) {
  return {
    route: "/",
    target: (ctx) => (ctx.exists(target) ? target : "quest.card"),
    title,
    body,
    haptic: "success",
    // Home refetches everything on arrival, and the API can take a while to
    // wake. The reward waits rather than giving up on a slow first load.
    wait: 20000,
    primary: (ctx) => {
      const next = ctx.quest?.next;
      if (next) {
        return {
          label: `Next: ${stepLabel(next.go, ctx.mode)}`,
          run: () => ctx.quest.start(next.go),
        };
      }
      return { label: "Finish", run: () => ctx.start("setup.finish") };
    },
    secondary: { label: "Later" },
    skip: false,
  };
}

/**
 * Logging an entry, one control at a time. The same sheet both times; income
 * gets the fuller version because it's the first thing anyone logs.
 */
function entrySteps(type) {
  const income = type === "income";
  const on = "/transactions";
  return [
    income && {
      route: on,
      target: "entry.type",
      title: "It's Set to Income",
      body: "Money coming in. Switch to Expense here whenever you're logging spending.",
      wait: 12000,
    },
    {
      route: on,
      target: "entry.amount",
      interactive: true,
      title: income ? "How Much Came In?" : "What Did It Cost?",
      body: income
        ? "Tap the amount to type it in. The keypad does sums too, like 450+50."
        : "Tap the amount and type it in.",
      advanceWhen: (ctx) => ctx.exists("entry.keypad"),
      primary: null,
      wait: 12000,
    },
    {
      route: on,
      target: "entry.keypad",
      interactive: true,
      title: "Type It In",
      body: "Then tap Use to put it on the entry.",
      advanceWhen: (ctx) => !ctx.exists("entry.keypad") && ctx.filled("entry.amount"),
      // Cancel on the keypad takes you back to the form with no amount — back
      // to the step that asks for one, rather than the end of the guide.
      onGone: "back",
      primary: null,
    },
    {
      route: on,
      target: "entry.category",
      interactive: true,
      title: income ? "Where's It From?" : "What Was It For?",
      body: income ? "Pick a category, like Allowance or Job." : "Pick a category.",
      advanceWhen: (ctx) => ctx.filled("entry.category"),
      primary: null,
    },
    income && {
      route: on,
      target: "entry.details",
      interactive: true,
      title: "Anything Else?",
      body: "A name and a date are optional. Today's date is already filled in.",
    },
    {
      route: on,
      target: "entry.submit",
      interactive: true,
      title: income ? "Tap Add Income" : "Tap Add Expense",
      body: income ? "That's all it takes." : "Four taps, start to finish.",
      advanceOn: "entry:added",
      primary: null,
    },
    {
      route: on,
      target: null,
      blocking: false,
      placement: "top",
      title: "Saving…",
      body: "Putting it in your ledger.",
      advanceOn: "entry:saved",
      failOn: "entry:failed",
      primary: null,
      wait: 60000,
    },
    {
      route: on,
      target: null,
      title: "Logged!",
      body: income
        ? "Your first entry is in. Now see what it did to your budget."
        : "That's the daily habit: tap +, amount, category, done.",
      primary: (ctx) => ({ label: "See My Budget", run: () => ctx.navigate("/") }),
      skip: false,
    },
  ].filter(Boolean);
}

const COUNT_WORDS = ["", "One", "Two", "Three", "Four", "Five"];

export const TOURS = {
  /* ── Setup ──────────────────────────────────────────────────────────── */

  "setup.welcome": {
    kind: "page",
    priority: 10,
    label: "Getting Started",
    // Marked whichever button is pressed: from here on the setup card stays
    // on Home until it's finished or dismissed, even once entries exist.
    doneId: "setup.begun",
    steps: [
      {
        target: null,
        placement: "center",
        title: (ctx) => (ctx.username ? `Welcome, ${ctx.username}` : "Welcome"),
        body: (ctx) => {
          const count = ctx.quest?.moves?.length ?? 3;
          return `Broke No More works out what you can spend each day. ${
            COUNT_WORDS[count] ?? count
          } quick moves and yours is running — about a minute.`;
        },
        primary: (ctx) => ({
          label: "Let's Go",
          run: () => ctx.quest?.next && ctx.quest.start(ctx.quest.next.go),
        }),
        secondary: { label: "Not Now" },
        skip: false,
      },
    ],
  },

  "setup.finish": {
    kind: "page",
    priority: 9,
    label: "Getting Started",
    doneId: "setup.done",
    steps: [
      {
        target: null,
        placement: "center",
        haptic: "success",
        title: "You're All Set 🎉",
        body: "Your budget's running. Want a quick look at what everything on Home means?",
        primary: (ctx) => ({ label: "Show Me", run: () => ctx.start("home", { force: true }) }),
        secondary: { label: "Later" },
        skip: false,
      },
    ],
  },

  "setup.period": {
    kind: "quest",
    steps: [
      {
        route: "/more",
        target: "period.form",
        interactive: true,
        wait: 12000,
        title: (ctx) => (ctx.mode === "term" ? "When Did It Arrive?" : "How Long Does It Last?"),
        body: (ctx) =>
          ctx.mode === "term"
            ? "Say when the lump sum arrived and how many months it has to cover, then tap Set Up Allowance."
            : "Pick when your money arrived and how many days it has to cover, then tap Start Period.",
        advanceOn: "period:saved",
        primary: null,
      },
      reward({
        target: "quest.card",
        title: (ctx) => (ctx.mode === "term" ? "Allowance Set Up" : "Period Started"),
        body: "Next, log the money it has to cover.",
      }),
    ],
  },

  "setup.income": {
    kind: "quest",
    steps: [
      ...entrySteps("income"),
      reward({
        target: "home.hero",
        title: "That's Your Budget",
        body: (ctx) =>
          `Everything you can spend this ${noun(ctx)}. It goes down as you log what you spend.`,
      }),
    ],
  },

  "setup.savings": {
    kind: "quest",
    steps: [
      {
        route: "/more",
        target: "savings.form",
        interactive: true,
        wait: 12000,
        title: "How Much Do You Want to Keep?",
        body: "It's set aside before your daily budget is worked out, so you can't spend it by accident. $0 is fine too.",
        advanceOn: "savings:saved",
        primary: null,
      },
      reward({
        target: "home.strip",
        title: "Set Aside",
        body: (ctx) =>
          ctx.exists("home.strip")
            ? "It's under Reserved now, and already off what you can spend."
            : "It comes off the top as soon as there's income to take it from.",
      }),
    ],
  },

  "setup.expense": {
    kind: "quest",
    steps: [
      {
        route: "/",
        target: "fab",
        interactive: true,
        radius: 22,
        title: "Tap + to Log a Spend",
        body: "This is the button you'll use every day.",
        // It's fixed in the corner; there's nothing to scroll to.
        noScroll: true,
        // The button takes you to the ledger with the sheet open, so arriving
        // there is the tap.
        advanceWhen: (ctx) => ctx.pathname === "/transactions",
        primary: null,
      },
      ...entrySteps("expense"),
      reward({
        target: "home.hero",
        title: "Down It Goes",
        body: "Every spend comes off here. Stay under today's budget and you'll start a streak.",
      }),
    ],
  },

  /* ── Page tours ─────────────────────────────────────────────────────── */

  home: {
    kind: "page",
    version: 1,
    priority: 5,
    title: "Home",
    route: "/",
    steps: [
      {
        target: "home.hero",
        title: "Left to Spend",
        body: (ctx) =>
          ctx.mode === "term"
            ? "What you can still spend this month: its share of your allowance, minus your savings target, minus what you've spent."
            : `What you can still spend this ${noun(ctx)}: the money in, minus your savings target, minus what you've spent so far.`,
      },
      {
        target: "home.pace",
        title: "Your Pace",
        body: (ctx) =>
          `The bar fills as you spend. The thin tick is how far through the ${noun(ctx)} you are — stay behind it and the money lasts.`,
      },
      {
        target: "home.verdict",
        title: "Over or Under Pace",
        body: (ctx) =>
          `How far you are from spending evenly, in dollars. Tap it to see how the ${noun(ctx)} is likely to end.`,
      },
      {
        target: "home.strip",
        title: "Where It Comes From",
        body: "What came in, what went out and what you've set aside. Together they make the number at the top. Tap for the full breakdown.",
      },
      {
        target: "home.today",
        title: "Today's Budget",
        body: "What's left, spread evenly over the days remaining. Stay under it and today counts towards your streak.",
      },
    ],
  },

  // Home's second half, on a later visit, so arriving on Home never costs
  // eight steps at once.
  streak: {
    kind: "page",
    version: 1,
    priority: 4,
    requires: "home",
    steps: [
      {
        target: "streak.count",
        title: "Your Streak",
        body: "Days in a row you've kept within your daily budget. Every five days earns a new badge — tap it to see them all.",
      },
      {
        target: "streak.week",
        title: "The Last Seven Days",
        body: (ctx) =>
          `A tick is a day within budget, a cross is one that went over. Tap for the whole ${noun(ctx)} on a calendar.`,
      },
      {
        target: "streak.restores",
        title: "Restores",
        body: (ctx) =>
          `Went over one day? A restore repairs it so your streak carries on. You get a few each ${noun(ctx)}.`,
      },
    ],
  },

  transactions: {
    kind: "page",
    version: 1,
    priority: 5,
    title: "Transactions",
    route: "/transactions",
    steps: [
      {
        target: "tx.day",
        title: "One Day at a Time",
        body: "Entries are grouped by day, with that day's total on the right.",
      },
      {
        target: "tx.row",
        title: "Change or Remove",
        body: (ctx) =>
          ctx.coarse
            ? "Tap an entry to change it. Swipe it left to delete — you get 10 seconds to undo."
            : "Click an entry to change it, or use the bin to delete it — you get 10 seconds to undo.",
      },
      {
        target: ["tx.search", "tx.types"],
        title: "Find Anything",
        body: "Search by name or category, or show only expenses or income.",
      },
      {
        target: "tx.accounts",
        title: "Account Activity",
        body: (ctx) => `What went in and out of each of your accounts this ${noun(ctx)}.`,
      },
    ],
  },

  tracker: {
    kind: "page",
    version: 1,
    priority: 5,
    title: "Tracker",
    route: "/tracker",
    steps: [
      {
        target: "tracker.tabs",
        title: "Now or Before",
        body: (ctx) =>
          `This ${noun(ctx)} in detail here. History lines up every month you've tracked.`,
      },
      {
        target: "tracker.ring",
        title: "Where the Money Is",
        body: (ctx) =>
          `This ${noun(ctx)}'s money three ways: what's left to spend, what's reserved for savings, and what's gone.`,
      },
      {
        target: "tracker.term",
        title: "Your Whole Allowance",
        body: "The full lump sum, and which month of it you're in.",
      },
      {
        target: "tracker.savings",
        title: "Savings Target",
        body: "How your savings target is holding up against what you've spent. Set or change it here.",
      },
      {
        target: "tracker.calendar",
        title: "Day by Day",
        body: "Each day turns green or red against its daily budget. Tap a day to see what you spent, or switch to a chart.",
      },
    ],
  },

  history: {
    kind: "page",
    version: 1,
    priority: 5,
    title: "History",
    route: "/stats",
    steps: [
      {
        target: "history.lens",
        title: "All Time or Per Month",
        body: "All Time adds up every month that's finished. Per Month shows your average month instead.",
      },
      {
        target: "history.tiles",
        title: "Finished Months Only",
        body: (ctx) => `These stop where this ${noun(ctx)} began, so it joins them once it's over.`,
      },
      {
        target: "history.chart",
        title: "Month by Month",
        body: "Saved against spent for every month you've tracked. The breakdown further down has the exact figures.",
      },
    ],
  },

  plan: {
    kind: "page",
    version: 1,
    priority: 5,
    title: "Plan",
    route: "/plan",
    steps: [
      {
        target: "plan.daily",
        title: "Your Daily Budget, Live",
        body: (ctx) =>
          `What you can spend each day for the rest of the ${noun(ctx)}. It moves every time you log something.`,
      },
      {
        target: "plan.whatif",
        title: "What If I Buy…",
        body: "Type a price to see what it would leave for today, and for every day after.",
      },
      {
        target: "plan.pace",
        title: "Pace & Forecast",
        body: (ctx) =>
          `At the rate you're spending, when the money would run out, and what you'd have saved by the end of the ${noun(ctx)}.`,
      },
      {
        target: "plan.goal",
        title: "Goal or Daily Cap",
        body: "Type a savings goal to get the daily cap that reaches it, or a cap to see the goal it gets you.",
      },
    ],
  },

  friends: {
    kind: "page",
    version: 1,
    priority: 5,
    title: "Friends",
    route: "/friends",
    steps: [
      {
        target: "friends.search",
        title: "Add Friends",
        body: "Search for someone's username and send them a request.",
      },
      {
        target: "friends.leaderboard",
        title: "The Leaderboard",
        body: "Everyone ranked by how much of their money they've kept, over the months that have finished. It shows percentages, never amounts.",
      },
    ],
  },

  more: {
    kind: "page",
    version: 1,
    priority: 5,
    title: "More",
    route: "/more",
    steps: [
      {
        target: "more.period",
        title: "How You Budget",
        body: "By calendar month, by a number of days you pick, or one allowance spread over several months. Change it here any time.",
      },
      {
        target: "more.savings",
        title: "Savings Target",
        body: "Set aside before your daily budget is worked out, so you can't spend it by accident.",
      },
      {
        target: ["more.accounts", "more.categories", "more.recurring"],
        title: "Optional Extras",
        body: "Tag entries with the card you used, add your own categories, and have rent or subscriptions added for you.",
      },
      {
        target: "more.notifications",
        title: "Reminders",
        body: "Today's budget each morning, and a nudge at night if you haven't logged anything.",
      },
      {
        target: "more.help",
        title: "Replay a Tour",
        body: "Every page's tour is here if you want a refresher, and you can turn tips off.",
      },
    ],
  },

  /* ── Sheet tips ─────────────────────────────────────────────────────── */

  // The one sheet that doesn't explain itself: which mode you're in decides
  // what the rest of it says, so the other two are never described.
  "sheet.period": {
    kind: "sheet",
    version: 1,
    priority: 5,
    steps: [
      {
        target: "period.month",
        title: "Month",
        body: "Your budget runs from the 1st to the end of each month. Simplest if money arrives monthly.",
      },
      {
        target: "period.days",
        title: "Days",
        body: "Pick how many days your money has to last, like a fortnight. You start the next period when one ends.",
      },
      {
        target: "period.term",
        title: "Allowance",
        body: "One lump sum spread over several months. Spend more one month and the rest shrink to match.",
      },
    ],
  },

  "entry.paid-back": {
    kind: "sheet",
    version: 1,
    priority: 5,
    steps: [
      {
        target: "entry.paid-back",
        title: "Split a Bill?",
        body: "Log the whole amount, then what friends paid you back. Your budget only counts your share.",
      },
    ],
  },

  "entry.repeat": {
    kind: "sheet",
    version: 1,
    priority: 5,
    steps: [
      {
        target: "entry.repeat",
        title: "Every Month?",
        body: "Turn this on for rent or a subscription and it's added for you each month.",
      },
    ],
  },

  "entry.account": {
    kind: "sheet",
    version: 1,
    priority: 5,
    steps: [
      {
        target: "entry.account",
        title: "Which Account?",
        body: "Tag the card or account it came from. The last one you used is picked for you.",
      },
    ],
  },

  /* ── One-off tips ───────────────────────────────────────────────────── */

  "tip.overspent": {
    kind: "tip",
    version: 1,
    priority: 3,
    steps: [
      {
        target: "home.overspent",
        title: "Over Budget",
        body: (ctx) =>
          `You've spent more than this ${noun(ctx)}'s budget, so there's no daily budget until the gap closes. Logging income or lowering your savings target closes it.`,
      },
    ],
  },

  "tip.restore": {
    kind: "tip",
    version: 1,
    priority: 3,
    steps: [
      {
        target: "streak.restore",
        title: "Save Your Streak",
        body: "A day went over budget. Spend a restore on it and your streak carries on as if it hadn't.",
      },
    ],
  },

  "tip.repeating": {
    kind: "tip",
    version: 1,
    priority: 3,
    steps: [
      {
        target: "repeat-badge",
        title: "Added for You",
        body: "This came from a repeating entry. Changing or deleting it only affects this one.",
      },
    ],
  },

  "tip.accounts": {
    kind: "tip",
    version: 1,
    priority: 3,
    steps: [
      {
        target: "tx.transfer",
        title: "Moving Money",
        body: "Moving money between your own accounts isn't spending. Log it as a transfer and your budget stays put.",
      },
      {
        target: "tx.account-filter",
        title: "One Account at a Time",
        body: "Show only the entries from one account.",
      },
    ],
  },

  "tip.friend-request": {
    kind: "tip",
    version: 1,
    priority: 3,
    steps: [
      {
        target: "friends.requests",
        title: "Someone Wants to Compare",
        body: "Accept and you'll each show up on the other's leaderboard.",
      },
    ],
  },
};

/** What marks `id` as done in the saved list: "home@1", or a setup marker. */
export function doneIdFor(id) {
  const tour = TOURS[id];
  if (!tour) return null;
  if (tour.doneId) return tour.doneId;
  if (tour.kind === "quest") return null;
  return `${id}@${tour.version ?? 1}`;
}

/** The page tours, in the order More lists them for replaying. */
export const REPLAYABLE = ["home", "transactions", "tracker", "history", "plan", "friends", "more"];

/** What replaying one page's tour forgets. Home's comes in two halves. */
export const REPLAY_WITH = { home: ["home", "streak"] };

/**
 * Everything "Replay Everything" forgets, Home first so it's the one that
 * starts: every tour and tip, but none of the setup — replaying tips
 * shouldn't put a finished setup back on Home.
 */
export const ALL_TOURS = [
  "home",
  ...Object.keys(TOURS).filter(
    (id) => id !== "home" && TOURS[id].kind !== "quest" && !id.startsWith("setup.")
  ),
];

/** Setup markers that aren't tours: kept in the same saved list. */
export const MARKS = {
  begun: "setup.begun",
  done: "setup.done",
  savings: "setup.savings",
  savingsSkipped: "setup.savings-skipped",
};
