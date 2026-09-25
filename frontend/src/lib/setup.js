/**
 * The first-run script, per budget mode.
 *
 * Everything here is copy the Home checklist and the guided setup share, so
 * the two can't drift. Which step is live is worked out from what's actually
 * done (see useSetupQuest) rather than stored per mode: a window already
 * running makes "start one" a step behind you, whichever mode you're in.
 *
 * Each step carries `go`, the thing it actually opens. The steps used to name
 * the More row you had to go and find ("under More → Savings Target") because
 * they were text and text was all they could do; now that each one is a button
 * that opens the sheet itself, naming the route would describe a journey the
 * tap skips. The one place a row name still earns its keep is the More screen
 * itself, where the labels match.
 */
export const SETUP = {
  month: {
    steps: [
      { text: "Log the money coming in this month", go: "income" },
      { text: "Set what you want to keep each month", go: "savings" },
    ],
    logBody: "Add your income for the month and your daily budget appears here.",
    // Only month mode carries this. A new account is always in month mode
    // (User.budgetMode defaults to it) and nothing on the first-run path
    // otherwise says the other two exist — the days and term checklists
    // explain themselves, but you can't see one until you've already chosen
    // it. This app is for students, whose money often arrives as a semester's
    // allowance rather than monthly, so leaving that undiscoverable quietly
    // gives the wrong budget model to the reader it was built for.
    //
    // A line rather than a step: month mode needs no setup, so a step that is
    // already done for almost everyone is busywork in a list whose whole job
    // is saying what to do next. Switching is non-destructive either way.
    alternatives:
      "Money not monthly? Budget by a set number of days, or spread one allowance across a term.",
  },
  days: {
    steps: [
      { text: "Start a budget period, and say how long it runs", go: "period" },
      { text: "Log the money coming in for it", go: "income" },
      { text: "Set what you want to keep", go: "savings" },
    ],
    logBody:
      "Add the money for this period and your daily budget appears here.",
  },
  term: {
    steps: [
      {
        text: "Set your allowance term, and say how many months it covers",
        go: "period",
      },
      {
        text: "Log the lump sum once — it's split across those months for you",
        go: "income",
      },
      { text: "Set what you want to keep each month", go: "savings" },
    ],
    logBody:
      "Log your allowance once and it's split across the term, a month at a time.",
  },
};

/**
 * The step every mode ends on. The others set a budget up; this one is the
 * thing you'll do every day after, so it's the one worth doing once with a
 * guide beside you.
 */
export const FIRST_SPEND = { text: "Log your first spend", go: "expense" };

/** The steps for `mode`, first spend included. */
export function setupSteps(mode) {
  return [...(SETUP[mode] ?? SETUP.month).steps, FIRST_SPEND];
}

/** What a "Next: …" button calls each step. Short: it shares a row with "Later". */
export function stepLabel(go, mode) {
  if (go === "period") return mode === "term" ? "Set Up Allowance" : "Start a Period";
  return { income: "Log Income", savings: "Set Savings", expense: "Log a Spend" }[go];
}
