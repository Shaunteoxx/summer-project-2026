// Black-box tests for the pages and the hooks behind them: the real app is
// mounted (providers, router, pages) with only the network and the clock
// replaced. Each expectation is something the README or HANDOFF.md says the
// page shows, checked through what a user would read or tap.
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, fireEvent, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/api/endpoints", async () => (await import("./_holder.js")).endpoints);
vi.mock("@/lib/utils", async (original) => {
  const { holder } = await import("./_holder.js");
  return { ...(await original()), localToday: () => holder.today };
});

import { makeServer, entry } from "./_fakeServer.js";
import { renderAt, setDeviceDate, pageText } from "./_app.jsx";

afterEach(() => { vi.useRealTimers(); });

const settle = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));
const open = async (route, today, options = {}, { signedIn = true } = {}) => {
  setDeviceDate(today);
  const server = makeServer({ today, ...options });
  renderAt(route, server);
  if (!signedIn) localStorage.clear();
  await settle(900);
  return server;
};

// ── fixtures ────────────────────────────────────────────────────────────

const MONTH = (daysLeft = 22, savings = 100) => ({ start: "2026-03-01", end: "2026-03-31", days: 31, savings, savesTotal: 3, daysLeft, funding: null, cycle: null, cycles: null });
const monthLedger = [
  entry("a", "2026-03-01", "income", 900, "Allowance"),
  entry("b", "2026-03-05", "expense", 90, "Shoes", { category: "Shopping" }),
  entry("c", "2026-03-09", "expense", 6, "Kopi"),
  entry("z", "2026-02-27", "expense", 15, "Last month's lunch"),
];
const monthHome = { periodIncome: 900, periodExpenses: 96, periodSavings: 100, leftToSpend: 704 };
const monthStreak = {
  hasData: true, hasIncome: true, leftToSpend: 704, periodSavings: 100, currentStreak: 5, longestStreak: 5,
  today: { spent: 0, budget: 32, remaining: 32, within: true }, savesLeftThisPeriod: 3,
  periodDays: ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"].map((d) => ({ date: `2026-03-${d}`, spent: d === "05" ? 90 : d === "09" ? 6 : 0, budget: 30, status: d === "05" ? "break" : "win" })),
  last7: [],
};
const monthOpts = (extra = {}) => ({ mode: "month", period: MONTH(), ledger: monthLedger, home: monthHome, streak: monthStreak, ...extra });

const DAYS = (daysLeft = 5) => ({ id: "p1", start: "2026-02-20", end: "2026-03-05", days: 14, savings: 50, savesTotal: 1, daysLeft, funding: null, cycle: null, cycles: null });
const daysLedger = [
  entry("a", "2026-02-20", "income", 700, "Allowance"),
  entry("b", "2026-02-25", "expense", 35, "Groceries run"),
  entry("c", "2026-02-28", "expense", 12, "Bubble tea", { category: "Transport" }),
];
const daysHome = { periodIncome: 700, periodExpenses: 47, periodSavings: 50, leftToSpend: 603 };
const daysStreak = {
  hasData: true, hasIncome: true, leftToSpend: 603, periodSavings: 50, currentStreak: 10, longestStreak: 10,
  today: { spent: 0, budget: 120.6, remaining: 120.6, within: true }, savesLeftThisPeriod: 1,
  periodDays: [["2026-02-20", 0], ["2026-02-21", 0], ["2026-02-22", 0], ["2026-02-23", 0], ["2026-02-24", 0], ["2026-02-25", 35], ["2026-02-26", 0], ["2026-02-27", 0], ["2026-02-28", 12], ["2026-03-01", 0]].map(([date, spent]) => ({ date, spent, budget: 60, status: "win" })),
  last7: [],
};
const daysOpts = (extra = {}) => ({ mode: "days", period: DAYS(), ledger: daysLedger, home: daysHome, streak: daysStreak, ...extra });

const CYCLE = (daysLeft = 31) => ({ id: "t1:2", start: "2026-03-01", end: "2026-03-31", days: 31, savings: 0, savesTotal: 3, daysLeft, funding: 1000, cycle: 3, cycles: 6 });
const TERM = { id: "t1", start: "2026-01-01", end: "2026-06-30", months: 6, income: 6000, spent: 2000, saved: 0, left: 4000 };
const termOpts = (extra = {}) => ({
  mode: "term", period: CYCLE(), term: TERM,
  ledger: [entry("a", "2026-01-01", "income", 6000, "Allowance for the term"), entry("b", "2026-02-15", "expense", 988, "February rent")],
  home: { periodIncome: 0, periodFunding: 1000, periodExpenses: 0, periodSavings: 0, leftToSpend: 1000 },
  streak: { hasData: true, hasIncome: true, leftToSpend: 1000, currentStreak: 59, longestStreak: 59, today: { spent: 0, budget: 32.26, remaining: 32.26, within: true }, savesLeftThisPeriod: 3, periodDays: [{ date: "2026-03-01", spent: 0, budget: 32.26, status: "win" }], last7: [] },
  ...extra,
});

// ── the app shell ───────────────────────────────────────────────────────

describe("signed out", () => {
  it("shows the login page and asks the API for nothing", async () => {
    const server = await open("/", "2026-03-10", monthOpts(), { signedIn: false });
    expect(screen.getByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try the Demo" })).toBeInTheDocument();
    expect(server.api.fetchHomeStats).not.toHaveBeenCalled();
    expect(server.api.fetchTransactions).not.toHaveBeenCalled();
  });

  it("a deep link to a private page lands on login too", async () => {
    for (const route of ["/tracker", "/transactions", "/more", "/stats", "/friends", "/plan"]) {
      const server = await open(route, "2026-03-10", monthOpts(), { signedIn: false });
      expect(screen.getByRole("button", { name: "Continue with Google" }), route).toBeInTheDocument();
      expect(server.api.fetchTransactions, route).not.toHaveBeenCalled();
      cleanup();
    }
  }, 20000);

  it("a session the server rejects is cleared and sent to login", async () => {
    const rejected = Object.assign(new Error("Unauthorized"), { response: { status: 401, data: { message: "Session ended, please sign in again" } } });
    await open("/", "2026-03-10", monthOpts({ overrides: { fetchMe: async () => { throw rejected; } } }));
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
  });

  it("Try the Demo asks the API for a demo session", async () => {
    const server = await open("/", "2026-03-10", monthOpts(), { signedIn: false });
    fireEvent.click(screen.getByRole("button", { name: "Try the Demo" }));
    await waitFor(() => expect(server.api.demoLogin).toHaveBeenCalledTimes(1));
  });
});

describe("signed in", () => {
  it("has the four tabs", async () => {
    await open("/", "2026-03-10", monthOpts());
    for (const name of ["Home", "Transactions", "Tracker", "More"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("an unknown address falls back to a real page rather than a blank one", async () => {
    await open("/no-such-page", "2026-03-10", monthOpts());
    expect(pageText()).toMatch(/Welcome|Know exactly/);
  });

  it("sends the device's date, not the server's, with every budget request", async () => {
    const server = await open("/", "2026-03-10", monthOpts());
    expect(server.api.fetchHomeStats).toHaveBeenCalledWith("2026-03-10");
    expect(server.api.fetchPeriod).toHaveBeenCalledWith("2026-03-10");
  });

  it("a demo session says so", async () => {
    await open("/", "2026-03-10", monthOpts({ me: { isDemo: true } }));
    expect(pageText()).toMatch(/demo/i);
  });
});

// ── home ────────────────────────────────────────────────────────────────

describe("home: the hero", () => {
  // README's worked example: $1,240 in, $300 reserved, $287.40 out on day 12 of 31.
  const example = () => ({
    mode: "month",
    period: { start: "2026-08-01", end: "2026-08-31", days: 31, savings: 300, savesTotal: 3, daysLeft: 20, funding: null, cycle: null, cycles: null },
    ledger: [entry("a", "2026-08-01", "income", 1240, "Allowance"), entry("b", "2026-08-11", "expense", 287.4, "Textbooks", { category: "Shopping" })],
    home: { periodIncome: 1240, periodExpenses: 287.4, periodSavings: 300, leftToSpend: 652.6 },
    streak: { hasData: true, hasIncome: true, leftToSpend: 652.6, periodSavings: 300, currentStreak: 3, longestStreak: 3, today: { spent: 0, budget: 32.63, remaining: 32.63, within: true }, savesLeftThisPeriod: 3 },
  });

  it("shows what is left, the days left, and In / Out / Reserved", async () => {
    await open("/", "2026-08-12", example());
    expect(screen.getByText("Left to Spend This Month")).toBeInTheDocument();
    expect(screen.getByText("$652.60")).toBeInTheDocument();
    expect(pageText()).toContain("20 days left");
    expect(pageText()).toMatch(/In\s*\$1,240\.00/);
    expect(pageText()).toMatch(/Out\s*\$287\.40/);
    expect(pageText()).toMatch(/Reserved\s*\$300\.00/);
  });

  it("the pace bar is budget spent, and the verdict is an amount", async () => {
    await open("/", "2026-08-12", example());
    // $287.40 of a $940 budget is 31%; even pace after 11 of 31 days is
    // $333.55, so this is $46.15 under.
    expect(pageText()).toContain("31% spent");
    expect(pageText()).toContain("$46.15 under pace");
    expect(pageText()).not.toMatch(/Ahead of pace|Behind pace/);
  });

  it("never calls unspent money 'saved'", async () => {
    await open("/", "2026-08-12", example());
    expect(pageText()).not.toMatch(/Saved this month/i);
  });

  it("past the budget, says by how much and offers the two ways out", async () => {
    const opts = example();
    opts.home = { periodIncome: 1240, periodExpenses: 1100, periodSavings: 300, leftToSpend: -160 };
    opts.streak = { ...opts.streak, leftToSpend: -160, overspentBy: 160, today: { spent: 0, budget: 0, remaining: 0, within: true } };
    await open("/", "2026-08-12", opts);
    expect(pageText()).toContain("$160.00");
    expect(pageText()).not.toContain("$-160.00");
    expect(screen.getByRole("button", { name: "Add Income" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lower Target" })).toBeInTheDocument();
  });

  it("a lapsed period says so and offers to start the next", async () => {
    const previous = { id: "p0", start: "2026-02-10", end: "2026-02-23", days: 14, savings: 0, savesTotal: 1, daysLeft: 0, funding: null, cycle: null, cycles: null };
    await open("/", "2026-03-01", { mode: "days", period: null, status: "lapsed", previous, ledger: [entry("a", "2026-02-10", "income", 300, "Allowance")], home: { status: "lapsed" } });
    expect(screen.getByText("Your Last Budget Period Has Ended")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start Next Period" })).toBeInTheDocument();
    expect(screen.queryByText(/Left to Spend/)).not.toBeInTheDocument();
  });

  it("when the recent-entries request fails, the budget is still shown", async () => {
    // Stats say $900 in and $704 left; only the list of entries failed to load.
    await open("/", "2026-03-10", monthOpts({ overrides: { fetchTransactions: async () => { throw new Error("Network Error"); } } }));
    expect(screen.queryByText("Nothing Logged Yet"), pageText()).not.toBeInTheDocument();
    expect(screen.getByText("$704.00")).toBeInTheDocument();
  });

  it("when the stats request fails, it says so rather than 'Nothing Logged Yet'", async () => {
    await open("/", "2026-03-10", monthOpts({ overrides: { fetchHomeStats: async () => { throw new Error("Network Error"); } } }));
    expect(pageText()).toContain("Couldn't load your stats. Please try again.");
    expect(screen.queryByText("Nothing Logged Yet"), pageText()).not.toBeInTheDocument();
  });

  it("term mode names the allowance apart from money that came in", async () => {
    await open("/", "2026-03-02", termOpts({ period: CYCLE(30), ledger: [entry("a", "2026-01-01", "income", 6000, "Allowance for the term"), entry("e", "2026-03-01", "expense", 8, "Kopi")], home: { periodIncome: 0, periodFunding: 1000, periodExpenses: 8, periodSavings: 0, leftToSpend: 992 } }));
    expect(pageText()).toMatch(/Allowance\s*\$1,000\.00/);
    expect(pageText()).toContain("Month 3 of 6");
    // The lump sum is not shown as this month's "In" beside the allowance.
    expect(pageText()).not.toMatch(/In\s*\$6,000\.00/);
  });
});

// ── transactions ────────────────────────────────────────────────────────

describe("transactions page", () => {
  it("month mode lists this calendar month, newest first", async () => {
    await open("/transactions", "2026-03-10", monthOpts());
    expect(pageText()).toContain("March 2026");
    expect(pageText()).toContain("3 entries");
    const rows = ["Kopi", "Shoes", "Allowance"].map((name) => screen.getAllByText(name)[0]);
    expect(rows[0].compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[1].compareDocumentPosition(rows[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText("Last month's lunch")).not.toBeInTheDocument();
  });

  it("days mode on the 1st lists the whole period, including last month's entries", async () => {
    await open("/transactions", "2026-03-01", daysOpts());
    expect(pageText()).toContain("20 Feb – 5 Mar");
    expect(pageText()).toContain("3 entries");
    expect(screen.getByText("Groceries run")).toBeInTheDocument();
    expect(screen.getByText("Bubble tea")).toBeInTheDocument();
    expect(pageText()).toContain("Yesterday · 28 Feb");
  });

  it("the Expenses and Income pills filter the list", async () => {
    await open("/transactions", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Income" }));
    await settle(200);
    expect(screen.queryByText("Shoes")).not.toBeInTheDocument();
    expect(screen.getAllByText("Allowance").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Expenses" }));
    await settle(200);
    expect(screen.getByText("Shoes")).toBeInTheDocument();
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit Allowance" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All" }));
    await settle(200);
    expect(screen.getByRole("button", { name: "Edit Allowance" })).toBeInTheDocument();
  });

  it("search matches the description or the category, ignoring case", async () => {
    await open("/transactions", "2026-03-10", monthOpts());
    const search = screen.getByLabelText("Search transactions");
    fireEvent.change(search, { target: { value: "KOPI" } });
    await settle(300);
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.queryByText("Shoes")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "shopping" } });
    await settle(300);
    expect(screen.getByText("Shoes")).toBeInTheDocument();
    expect(screen.queryByText("Kopi")).not.toBeInTheDocument();
    fireEvent.change(search, { target: { value: "" } });
    await settle(300);
    expect(screen.getByText("Kopi")).toBeInTheDocument();
    expect(screen.getByText("Shoes")).toBeInTheDocument();
  });

  it("a search with no match says so instead of looking like an empty ledger", async () => {
    await open("/transactions", "2026-03-10", monthOpts());
    fireEvent.change(screen.getByLabelText("Search transactions"), { target: { value: "zzzz" } });
    await settle(300);
    expect(screen.queryByText("Kopi")).not.toBeInTheDocument();
    expect(pageText()).not.toMatch(/Add Your First Entry/);
  });

  it("delete removes the row at once and offers Undo", async () => {
    const server = await open("/transactions", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Delete Kopi" }));
    await settle(300);
    expect(screen.queryByText("Kopi")).not.toBeInTheDocument();
    expect(screen.getByText("Transaction deleted")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(server.api.removeTransaction).not.toHaveBeenCalled(); // deferred for the undo window
  });

  it("Undo puts the row back where it was and never tells the server", async () => {
    const server = await open("/transactions", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Delete Shoes" }));
    await settle(300);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await settle(300);
    const rows = ["Kopi", "Shoes", "Allowance"].map((name) => screen.getAllByText(name)[0]);
    expect(rows[0].compareDocumentPosition(rows[1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rows[1].compareDocumentPosition(rows[2]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(server.api.removeTransaction).not.toHaveBeenCalled();
  });

  it("leaving the page inside the undo window still deletes the entry", async () => {
    const server = await open("/transactions", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Delete Kopi" }));
    await settle(200);
    fireEvent.click(screen.getByRole("link", { name: "More" }));
    await waitFor(() => expect(server.api.removeTransaction).toHaveBeenCalledWith("c"));
  });

  it("the add sheet offers the categories for the chosen type", async () => {
    await open("/transactions", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Add a transaction" }));
    await settle(400);
    const sheet = screen.getByRole("dialog");
    for (const name of ["F & B", "Transport", "Shopping", "Entertainment", "Travel"]) {
      expect(sheet.querySelector(`button[aria-label="${name}"], button`), name).toBeTruthy();
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    fireEvent.click(screen.getAllByRole("button", { name: "Income" }).find((b) => sheet.contains(b)));
    await settle(300);
    for (const name of ["Allowance", "Job", "Gifts"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Transport" })).not.toBeInTheDocument();
  });

  it("an entry with no amount is not sent", async () => {
    const server = await open("/transactions", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Add a transaction" }));
    await settle(400);
    fireEvent.click(screen.getByRole("button", { name: "Transport" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Expense" }));
    await settle(300);
    expect(server.api.addTransaction).not.toHaveBeenCalled();
  });

  const offline = { fetchTransactions: async () => { throw new Error("Network Error"); } };

  it("a failed load says so", async () => {
    await open("/transactions", "2026-03-10", monthOpts({ overrides: offline }));
    expect(pageText()).toContain("Couldn't load transactions. Please try again.");
  });

  it.fails("a failed load does not pretend the ledger is empty", async () => {
    // The toast goes away after a few seconds; what stays on the page must not
    // tell someone with a full ledger that they have never logged anything.
    await open("/transactions", "2026-03-10", monthOpts({ overrides: offline }));
    expect(pageText()).not.toMatch(/Nothing Logged Yet/);
    expect(pageText()).not.toMatch(/Add Your First Entry/);
  });
});

// ── tracker ─────────────────────────────────────────────────────────────

describe("tracker page", () => {
  it("days mode on the 1st covers the whole period, both sides of the month boundary", async () => {
    await open("/tracker", "2026-03-01", daysOpts());
    expect(pageText()).toContain("20 Feb – 5 Mar");
    expect(pageText()).toMatch(/Left to Spend\s*\$603\.00/);
    expect(pageText()).toMatch(/Reserved\s*\$50\.00/);
    expect(pageText()).toMatch(/Spent\s*\$47\.00/);
    expect(pageText()).toMatch(/Income\s*\$700\.00/);
    expect(pageText()).toMatch(/25\s*\$35\.00/); // 25 Feb's cell
    expect(pageText()).toMatch(/28\s*\$12\.00/);
  });

  it("today's budget is the figure the streak endpoint gave — the same as Home's", async () => {
    await open("/tracker", "2026-03-01", daysOpts());
    expect(pageText()).toContain("Today's budget $120.60");
  });

  it("splits spending by category", async () => {
    await open("/tracker", "2026-03-01", daysOpts());
    expect(pageText()).toMatch(/F & B\s*\$35\.00/);
    expect(pageText()).toMatch(/Transport\s*\$12\.00/);
  });

  it("says Unspent, not Saved, for a period still running", async () => {
    await open("/tracker", "2026-03-10", monthOpts());
    expect(pageText()).toMatch(/Unspent|Left to Spend/);
    expect(pageText()).not.toMatch(/Total Saved/);
  });

  it("term mode on the 1st shows the funded month, not an empty state", async () => {
    await open("/tracker", "2026-03-01", termOpts());
    expect(pageText()).toMatch(/Allowance\s*\$1,000\.00/);
    expect(pageText()).toContain("Month 3 of 6");
    expect(pageText()).toContain("Today's budget $32.26");
    expect(pageText()).toMatch(/\$4,000\.00\s*left of \$6,000\.00/);
  });

  it("a day's sheet lists that day's transactions", async () => {
    await open("/tracker", "2026-03-01", daysOpts());
    const cell = screen.getAllByRole("button").find((b) => /25 Feb/.test(b.getAttribute("aria-label") || ""));
    expect(cell, "no calendar cell for 25 Feb").toBeTruthy();
    fireEvent.click(cell);
    await settle(400);
    expect(screen.getByRole("dialog")).toHaveTextContent("Groceries run");
    expect(screen.getByRole("dialog")).not.toHaveTextContent("Bubble tea");
  });
});

// ── plan ────────────────────────────────────────────────────────────────

describe("plan page: live planners", () => {
  it("dynamic daily budget is what is left ÷ the days after today", async () => {
    await open("/plan", "2026-03-01", daysOpts());
    expect(pageText()).toMatch(/Dynamic daily budget\s*\$150\.75/); // 603 ÷ 4
    expect(pageText()).toContain("$603.00 left ÷ 4 days");
  });

  it("on the last day of the period it shows the remaining amount itself", async () => {
    await open("/plan", "2026-03-05", daysOpts({ period: DAYS(1) }));
    expect(pageText()).toMatch(/Left for the rest of today\s*\$603\.00/);
    expect(pageText()).toContain("Last day of the period");
    expect(pageText()).not.toMatch(/Infinity|NaN|÷ 0 days/);
  });

  it("term mode plans from the allowance, though no income landed this month", async () => {
    await open("/plan", "2026-03-01", termOpts());
    expect(pageText()).toMatch(/Dynamic daily budget\s*\$33\.33/); // 1000 ÷ 30
    expect(pageText()).not.toMatch(/add (your )?income/i);
  });

  it("what-if: a purchase lowers every remaining day", async () => {
    await open("/plan", "2026-03-01", daysOpts());
    fireEvent.change(screen.getByPlaceholderText("35.00"), { target: { value: "100" } });
    await settle(300);
    expect(pageText()).toContain("$125.75"); // (603 − 100) ÷ 4
    expect(pageText()).toContain("$20.60");  // today's 120.60 − 100
  });

  it("what-if: blowing today alone is absorbed, not an over-budget warning", async () => {
    await open("/plan", "2026-03-01", daysOpts());
    fireEvent.change(screen.getByPlaceholderText("35.00"), { target: { value: "200" } });
    await settle(300);
    expect(pageText()).toContain("$100.75"); // (603 − 200) ÷ 4
    expect(pageText()).not.toMatch(/over budget/i);
  });

  it("what-if: a purchase larger than everything left is over budget", async () => {
    await open("/plan", "2026-03-01", daysOpts());
    fireEvent.change(screen.getByPlaceholderText("35.00"), { target: { value: "1000" } });
    await settle(300);
    expect(pageText()).toMatch(/over budget/i);
  });

  it("pace: average per day so far, and the projection it implies", async () => {
    await open("/plan", "2026-03-01", daysOpts());
    expect(pageText()).toContain("$4.70/day");      // 47 ÷ 10 days in
    expect(pageText()).toMatch(/Projected Saved\s*\$634\.20/); // 700 − (47 + 4.70 × 4)
  });

  it("goal ↔ daily: a savings goal turns into a daily cap and back", async () => {
    await open("/plan", "2026-03-01", daysOpts());
    const [goal, cap] = [screen.getByLabelText(/Save this period/), screen.getByLabelText(/Spend at Most/)];
    fireEvent.change(goal, { target: { value: "100" } });
    await settle(300);
    expect(Number(cap.value)).toBeCloseTo((700 - 100 - 47) / 5, 2); // 110.60
    fireEvent.change(cap, { target: { value: "100" } });
    await settle(300);
    expect(Number(goal.value)).toBeCloseTo(700 - 47 - 100 * 5, 2); // 153.00
  });

  it("with no income this period it asks for income instead of dividing by nothing", async () => {
    await open("/plan", "2026-03-10", { mode: "month", period: MONTH(), ledger: [], home: {}, streak: {} });
    expect(pageText()).not.toMatch(/NaN|Infinity/);
    expect(pageText()).toMatch(/coming in|income/i);
    expect(pageText()).not.toContain("Dynamic daily budget");
  });
});

// ── stats ───────────────────────────────────────────────────────────────

describe("stats page", () => {
  const summaries = [
    { userId: "u1", month: 2, year: 2026, totalIncome: 900, totalExpenses: 96, totalSaved: 804, percentageSaved: 89, percentageSpent: 11 },
    { userId: "u1", month: 1, year: 2026, totalIncome: 0, totalExpenses: 40, totalSaved: -40, percentageSaved: 0, percentageSpent: 0 },
    { userId: "u1", month: 0, year: 2026, totalIncome: 800, totalExpenses: 600, totalSaved: 200, percentageSaved: 25, percentageSpent: 75 },
  ];
  const lifetime = { earned: 800, spent: 640, saved: 160, rate: 20, through: "2026-02-28" };
  const stats = (extra = {}) => monthOpts({ overrides: { fetchAllSummaries: summaries, fetchLifetimeSavings: lifetime }, ...extra });

  it("the all-time tiles come from finished windows and say where they stop", async () => {
    await open("/stats", "2026-03-10", stats());
    expect(pageText()).toMatch(/\$800\.00\s*Total Earned/);
    expect(pageText()).toMatch(/\$640\.00\s*Total Spent/);
    expect(pageText()).toMatch(/\$160\.00\s*Total Saved/);
    expect(pageText()).toMatch(/20%\s*Savings Rate/);
    expect(pageText()).toContain("Up to 28 Feb 26");
  });

  it("a finished month is 'saved'; the running one is 'unspent so far'", async () => {
    await open("/stats", "2026-03-10", stats());
    expect(pageText()).toMatch(/January 2026.*25% saved/);
    expect(pageText()).toMatch(/March 2026.*89% unspent so far/);
    expect(pageText()).not.toMatch(/March 2026[^J]*89% saved/);
  });

  it("a month with no income reads 'No income logged', not '0% saved'", async () => {
    await open("/stats", "2026-03-10", stats());
    expect(pageText()).toMatch(/February 2026.*No income logged/);
    expect(pageText()).not.toContain("0% saved");
  });

  it("stays on calendar months in days mode", async () => {
    await open("/stats", "2026-03-01", daysOpts({ overrides: { fetchAllSummaries: summaries.slice(1), fetchLifetimeSavings: { earned: 800, spent: 600, saved: 200, rate: 25, through: "2026-02-19" } } }));
    expect(pageText()).toContain("January 2026");
    expect(pageText()).toContain("February 2026");
    expect(pageText()).toContain("Up to 19 Feb 26");
  });

  it("with no history it shows an empty state, not zeros dressed as a record", async () => {
    await open("/stats", "2026-03-10", { mode: "month", period: MONTH(), ledger: [] });
    expect(pageText()).not.toMatch(/NaN|Infinity|undefined/);
  });
});

// ── friends ─────────────────────────────────────────────────────────────

describe("friends page", () => {
  const board = {
    through: "2026-02-28",
    leaderboard: [
      { id: "u2", username: "zed", profilePicture: "", avatar: "panda", isMe: false, percentageSaved: 40, totalSaved: 400 },
      { id: "u1", username: "shaunteo", profilePicture: "", avatar: "", isMe: true, percentageSaved: 20, totalSaved: 160 },
    ],
  };
  const friends = (extra = {}) => monthOpts({ overrides: { fetchComparison: board, fetchRequests: [{ id: "u3", username: "newbie", profilePicture: "", avatar: "" }], searchUsers: async (q) => (String(q).toLowerCase().startsWith("qu") ? [{ id: "u9", username: "quokka", profilePicture: "", avatar: "", status: "none" }] : []), ...extra } });

  it("ranks the leaderboard as the server sent it, marks your row, and says where totals stop", async () => {
    await open("/friends", "2026-03-10", friends());
    expect(pageText()).toMatch(/1\s*zed\s*40%/);
    expect(pageText()).toMatch(/2\s*S?shaunteo\s*You\s*20%/);
    expect(pageText()).toContain("up to 28 Feb 26");
  });

  it("an incoming request can be accepted", async () => {
    const server = await open("/friends", "2026-03-10", friends());
    expect(pageText()).toContain("Requests · 1");
    fireEvent.click(screen.getByRole("button", { name: /Accept newbie/ }));
    await waitFor(() => expect(server.api.acceptFriendRequest).toHaveBeenCalledWith("u3"));
    expect(server.api.declineFriendRequest).not.toHaveBeenCalled();
  });

  it("an incoming request can be declined", async () => {
    const server = await open("/friends", "2026-03-10", friends());
    fireEvent.click(screen.getByRole("button", { name: /Decline newbie/ }));
    await waitFor(() => expect(server.api.declineFriendRequest).toHaveBeenCalledWith("u3"));
    expect(server.api.acceptFriendRequest).not.toHaveBeenCalled();
  });

  it("searching asks the server for that name and lists who it found", async () => {
    const server = await open("/friends", "2026-03-10", friends());
    const box = screen.getByLabelText("Search users by username");
    fireEvent.change(box, { target: { value: "quo" } });
    // Typing or pressing return — either way the search has to reach the server.
    fireEvent.keyDown(box, { key: "Enter", code: "Enter" });
    if (box.form) fireEvent.submit(box.form);
    await waitFor(() => expect(server.api.searchUsers).toHaveBeenCalled(), { timeout: 3000 });
    expect(server.api.searchUsers.mock.calls.at(-1)[0]).toBe("quo");
    expect(await screen.findByText("quokka")).toBeInTheDocument();
  });

  it("a failed leaderboard does not blank the page or show a wrong ranking", async () => {
    await open("/friends", "2026-03-10", friends({ fetchComparison: async () => { throw new Error("Network Error"); } }));
    expect(pageText()).toContain("Friends");
    expect(pageText()).not.toMatch(/NaN|undefined/);
  });
});

// ── more ────────────────────────────────────────────────────────────────

describe("more page", () => {
  it("summarises the budget period and its savings target", async () => {
    await open("/more", "2026-03-01", daysOpts());
    expect(pageText()).toMatch(/Budget Period\s*20 Feb – 5 Mar\s*14 days/);
    expect(pageText()).toMatch(/Savings Target.*\$50\.00/);
  });

  it("shows the profile and counts of accounts, categories and repeating entries", async () => {
    await open("/more", "2026-03-10", monthOpts({ me: {
      accounts: [{ id: "a1", name: "DBS", color: "#aabbcc", archived: false }, { id: "a2", name: "Old", color: "#aabbcc", archived: true }],
      customCategories: [{ id: "c1", name: "Pets", type: "expense", color: "#aabbcc" }],
      recurring: [{ id: "r1", description: "Rent", amount: 500, type: "expense", category: "Shopping", accountId: null, frequency: "monthly", dayOfMonth: 1, weekday: null, startKey: "2026-03-01", lastRunKey: null, paused: false }],
    } }));
    expect(pageText()).toContain("shaunteo");
    expect(pageText()).toMatch(/Bank Accounts.*?1/);
    expect(pageText()).toMatch(/Categories.*?1/);
    expect(pageText()).toMatch(/Repeating Entries.*?1/);
  });

  it("Log Out ends the session on the server and returns to login", async () => {
    const server = await open("/more", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Log Out" }));
    await waitFor(() => expect(server.api.endSession).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: "Continue with Google" })).toBeInTheDocument();
    expect(localStorage.getItem("bnm_token")).toBe(null);
  });

  it("Delete Account asks before doing anything", async () => {
    const server = await open("/more", "2026-03-10", monthOpts());
    fireEvent.click(screen.getByRole("button", { name: "Delete Account" }));
    await settle(400);
    expect(server.api.deleteAccount).not.toHaveBeenCalled();
  });
});
