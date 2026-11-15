// The reported bug: in a budget period that is not a calendar month, the
// homepage on the 1st says nothing has been logged.
//
// Black-box: the real app (providers, router, HomePage) is mounted against a
// fake API that answers exactly as the backend does — including its rule that
// GET /api/transactions with no date range means "this calendar month".
import { describe, it, expect, vi, afterEach } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("@/api/endpoints", async () => (await import("./_holder.js")).endpoints);
vi.mock("@/lib/utils", async (original) => {
  const { holder } = await import("./_holder.js");
  return { ...(await original()), localToday: () => holder.today };
});

import { makeServer, entry } from "./_fakeServer.js";
import { renderAt, setDeviceDate, pageText } from "./_app.jsx";

afterEach(() => { vi.useRealTimers(); });

const open = async (today, options) => {
  setDeviceDate(today);
  const server = makeServer({ today, ...options });
  renderAt("/", server);
  await screen.findByText(/Welcome/, {}, { timeout: 4000 });
  // Let every request the page fired settle before reading it.
  await new Promise((resolve) => setTimeout(resolve, 400));
  return server;
};

// A 14-day period that began on 20 February and runs to 5 March.
const daysPeriod = (daysLeft) => ({ id: "p1", start: "2026-02-20", end: "2026-03-05", days: 14, savings: 50, savesTotal: 1, daysLeft, funding: null, cycle: null, cycles: null });
const daysLedger = [
  entry("a", "2026-02-20", "income", 700, "Allowance"),
  entry("b", "2026-02-25", "expense", 35, "Groceries run"),
  entry("c", "2026-02-28", "expense", 12, "Bubble tea"),
];
const daysHome = { periodIncome: 700, periodExpenses: 47, periodSavings: 50, leftToSpend: 603 };
const daysStreak = { hasIncome: true, leftToSpend: 603, periodSavings: 50, currentStreak: 9, longestStreak: 9, today: { spent: 0, budget: 120.6, remaining: 120.6, within: true }, savesLeftThisPeriod: 1 };

// A six-month allowance term from 1 January; March is its third cycle.
const cycle = (daysLeft) => ({ id: "t1:2", start: "2026-03-01", end: "2026-03-31", days: 31, savings: 0, savesTotal: 3, daysLeft, funding: 1000, cycle: 3, cycles: 6 });
const term = { id: "t1", start: "2026-01-01", end: "2026-06-30", months: 6, income: 6000, spent: 2000, saved: 0, left: 4000 };
const termLedger = [
  entry("a", "2026-01-01", "income", 6000, "Allowance for the term"),
  entry("b", "2026-01-15", "expense", 1000, "January rent"),
  entry("c", "2026-02-15", "expense", 988, "February rent"),
  entry("d", "2026-02-28", "expense", 12, "Bubble tea"),
];
const termHome = { periodIncome: 0, periodFunding: 1000, periodExpenses: 0, periodSavings: 0, leftToSpend: 1000 };
const termStreak = { hasIncome: true, leftToSpend: 1000, currentStreak: 59, longestStreak: 59, today: { spent: 0, budget: 32.26, remaining: 32.26, within: true }, savesLeftThisPeriod: 3 };

describe("control: the homepage away from the month boundary", () => {
  it("days mode on 28 February shows the budget and the period's entries", async () => {
    await open("2026-02-28", { mode: "days", period: daysPeriod(6), ledger: daysLedger, home: daysHome, streak: daysStreak });
    expect(screen.getByText("Left to Spend This Period")).toBeInTheDocument();
    expect(screen.getByText("$603.00")).toBeInTheDocument();
    expect(screen.getByText("Bubble tea")).toBeInTheDocument();
    expect(screen.getByText("Groceries run")).toBeInTheDocument();
    expect(screen.queryByText("Nothing Logged Yet")).not.toBeInTheDocument();
  });
});

describe("days mode: on the 1st, inside a period that began last month", () => {
  it("does not claim nothing has been logged", async () => {
    await open("2026-03-01", { mode: "days", period: daysPeriod(5), ledger: daysLedger, home: daysHome, streak: daysStreak });
    expect(screen.queryByText("Nothing Logged Yet"), pageText()).not.toBeInTheDocument();
    expect(screen.queryByText("Add Your First Entry")).not.toBeInTheDocument();
  });

  it("still shows what is left to spend this period", async () => {
    await open("2026-03-01", { mode: "days", period: daysPeriod(5), ledger: daysLedger, home: daysHome, streak: daysStreak });
    expect(screen.getByText("Left to Spend This Period")).toBeInTheDocument();
    expect(screen.getByText("$603.00")).toBeInTheDocument();
    expect(pageText()).toContain("5 days left");
  });

  it("lists the period's recent entries, though they are dated last month", async () => {
    await open("2026-03-01", { mode: "days", period: daysPeriod(5), ledger: daysLedger, home: daysHome, streak: daysStreak });
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Bubble tea")).toBeInTheDocument();
    expect(screen.getByText("Groceries run")).toBeInTheDocument();
  });

  it("does not send a user with a running period back to the setup checklist", async () => {
    await open("2026-03-01", { mode: "days", period: daysPeriod(5), ledger: daysLedger, home: daysHome, streak: daysStreak });
    expect(pageText()).not.toMatch(/Log your first spend/);
  });

  it("an entry logged on the 1st sits above last month's in the same list", async () => {
    const ledger = [...daysLedger, entry("d", "2026-03-01", "expense", 4.5, "Kopi")];
    await open("2026-03-01", { mode: "days", period: daysPeriod(5), ledger, home: { ...daysHome, periodExpenses: 51.5, leftToSpend: 598.5 }, streak: daysStreak });
    const names = ["Kopi", "Bubble tea", "Groceries run"].map((name) => screen.getByText(name));
    for (let i = 1; i < names.length; i += 1) {
      expect(names[i - 1].compareDocumentPosition(names[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe("term mode: on the 1st of a month the allowance already funds", () => {
  it("does not claim nothing has been logged", async () => {
    await open("2026-03-01", { mode: "term", period: cycle(31), term, ledger: termLedger, home: termHome, streak: termStreak });
    expect(screen.queryByText("Nothing Logged Yet"), pageText()).not.toBeInTheDocument();
    expect(screen.queryByText("Add Your First Entry")).not.toBeInTheDocument();
  });

  it("shows this month's funded budget", async () => {
    await open("2026-03-01", { mode: "term", period: cycle(31), term, ledger: termLedger, home: termHome, streak: termStreak });
    expect(screen.getByText("Left to Spend This Month")).toBeInTheDocument();
    // Shown twice: the hero figure, and the Allowance cell of the strip.
    expect(screen.getAllByText("$1,000.00").length).toBeGreaterThan(0);
    expect(pageText()).toContain("31 days left");
    expect(pageText()).toContain("Month 3 of 6");
  });

  it("keeps the streak card, which has a budget to show", async () => {
    await open("2026-03-01", { mode: "term", period: cycle(31), term, ledger: termLedger, home: termHome, streak: termStreak });
    expect(pageText()).toMatch(/59\s*days on budget/);
  });

  it("does not walk a user mid-term through the setup checklist again", async () => {
    await open("2026-03-01", { mode: "term", period: cycle(31), term, ledger: termLedger, home: termHome, streak: termStreak });
    expect(pageText()).not.toMatch(/Set Up in \w+ Steps/);
    expect(pageText()).not.toMatch(/Log the lump sum once/);
  });

  it("lists the most recent entries of the term rather than an empty list", async () => {
    await open("2026-03-01", { mode: "term", period: cycle(31), term, ledger: termLedger, home: termHome, streak: termStreak });
    expect(screen.getByText("Recent")).toBeInTheDocument();
    expect(screen.getByText("Bubble tea")).toBeInTheDocument();
  });

  it("control: from the 2nd, with an entry in the cycle, the page is whole", async () => {
    const ledger = [...termLedger, entry("e", "2026-03-01", "expense", 8, "Kopi")];
    await open("2026-03-02", { mode: "term", period: cycle(30), term, ledger, home: { ...termHome, periodExpenses: 8, leftToSpend: 992 }, streak: { ...termStreak, leftToSpend: 992, currentStreak: 60, longestStreak: 60 } });
    expect(screen.getByText("Left to Spend This Month")).toBeInTheDocument();
    expect(screen.getByText("$992.00")).toBeInTheDocument();
    expect(screen.getByText("Kopi")).toBeInTheDocument();
  });
});

describe("the recent list", () => {
  it("shows at most four entries, newest first", async () => {
    const ledger = [
      entry("i", "2026-03-01", "income", 900, "Allowance"),
      ...["One", "Two", "Three", "Four", "Five", "Six"].map((name, i) => entry(`e${i}`, `2026-03-0${i + 2}`, "expense", 5, `Lunch ${name}`)),
    ];
    const period = { start: "2026-03-01", end: "2026-03-31", days: 31, savings: 0, savesTotal: 3, daysLeft: 22, funding: null, cycle: null, cycles: null };
    await open("2026-03-10", { mode: "month", period, ledger, home: { periodIncome: 900, periodExpenses: 30, leftToSpend: 870 }, streak: { hasIncome: true, leftToSpend: 870, currentStreak: 10, longestStreak: 10, today: { spent: 0, budget: 39.55, remaining: 39.55, within: true }, savesLeftThisPeriod: 3 } });
    const recent = screen.getByText("Recent").closest("section") ?? screen.getByText("Recent").parentElement.parentElement;
    const shown = ["Lunch Six", "Lunch Five", "Lunch Four", "Lunch Three", "Lunch Two", "Lunch One"].filter((name) => within(recent).queryByText(name));
    expect(shown).toEqual(["Lunch Six", "Lunch Five", "Lunch Four", "Lunch Three"]);
  });
});
