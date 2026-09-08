// The tracker's numerator. This page computes its own totals from the window's
// transactions, which is right until the window's money didn't arrive in it —
// a term cycle spends a slice of a lump sum banked months earlier. Reading
// logged income there put "Unspent $2,090.50" on this page directly under a
// home screen reading "$1,162.75 left", for the same September.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-09-06",
}));

const fetchTransactions = vi.fn();
const fetchStreak = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchTransactions: (...a) => fetchTransactions(...a),
  fetchStreak: (...a) => fetchStreak(...a),
  setMonthlySavings: vi.fn(),
  updatePeriod: vi.fn(),
  updateTerm: vi.fn(),
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { savingsByMonth: {} }, refresh: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ getCategory: () => ({ color: "#666", icon: () => null }) }),
}));
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (value) => value }));
vi.mock("@/hooks/useChartColors", () => ({
  useChartColors: () => ({
    grid: "#eee", axis: "#888", cursor: "#eee", primary: "#0a0", spent: "#666",
    saved: "#0a0", over: "#c00", neutral: "#999",
    tooltipBg: "#fff", tooltipBorder: "#ddd", tooltipText: "#000",
  }),
}));

let mockPeriod;
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => mockPeriod,
}));

import TrackerPage from "@/pages/TrackerPage";

// September, month three of a six-month allowance: $1,272.25 of the lump sum
// is this month's, and $109.50 of it has gone.
const termPeriod = () => ({
  loading: false,
  mode: "term",
  noun: "month",
  status: "active",
  current: {
    id: "t:2",
    start: "2026-09-01",
    end: "2026-09-30",
    days: 30,
    daysLeft: 25,
    savings: 0,
    funding: 1272.25,
    cycle: 3,
    cycles: 6,
  },
  term: {
    id: "t",
    start: "2026-07-01",
    end: "2026-12-31",
    months: 6,
    income: 6985.33,
    spent: 2005.84,
    left: 4979.49,
  },
  history: [
    { start: "2026-07-01", end: "2026-07-31", funding: 797.56 },
    { start: "2026-08-01", end: "2026-08-31", funding: 852.68 },
    { start: "2026-09-01", end: "2026-09-30", funding: 1272.25 },
    { start: "2026-10-01", end: "2026-10-31", funding: null },
    { start: "2026-11-01", end: "2026-11-30", funding: null },
    { start: "2026-12-01", end: "2026-12-31", funding: null },
  ],
  refresh: vi.fn(),
});

const monthPeriod = () => ({
  loading: false,
  mode: "month",
  noun: "month",
  status: "active",
  current: { id: "m", start: "2026-09-01", end: "2026-09-30", days: 30, daysLeft: 25, savings: 0 },
  term: null,
  history: [],
  refresh: vi.fn(),
});

// The only income row inside September is a $2,200 top-up. Reading it as the
// month's budget is exactly the bug.
const txns = [
  { _id: "i1", date: "2026-09-05T00:00:00.000Z", type: "income", amount: 2200, category: "Allowance", description: "Allowance" },
  { _id: "e1", date: "2026-09-01T00:00:00.000Z", type: "expense", amount: 109.5, category: "F & B", description: "Groceries" },
];

const show = async () => {
  render(
    <MemoryRouter>
      <TrackerPage />
    </MemoryRouter>
  );
  await screen.findByText(/Tracker/);
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchTransactions.mockResolvedValue(txns);
  fetchStreak.mockResolvedValue({ periodDays: [], today: { budget: 46.51 } });
  mockPeriod = termPeriod();
});

describe("a term cycle", () => {
  it("budgets from the cycle's allowance, not the income logged in it", async () => {
    await show();
    // $1,272.25 − $109.50, the same figure home shows. Reading the $2,200
    // top-up instead gave $2,090.50. It lands twice — the donut legend and the
    // breakdown tile — and both have to agree, which is the whole point.
    const shown = await screen.findAllByText("$1,162.75");
    expect(shown.length).toBe(2);
    expect(screen.queryByText("$2,090.50")).not.toBeInTheDocument();
  });

  it("calls itself a monthly tracker, because a cycle is a month", async () => {
    await show();
    expect(screen.getByText("Monthly Tracker")).toBeInTheDocument();
    // The date also captions the daily-spending card below.
    expect(screen.getAllByText("September 2026").length).toBeGreaterThan(0);
    expect(screen.queryByText("Period Tracker")).not.toBeInTheDocument();
  });

  it("lists what each month of the allowance gets", async () => {
    await show();
    // Priced months read as they were; the ones still to come can't be, so
    // they're shown at this month's rate.
    expect(screen.getByText("Jul")).toBeInTheDocument();
    expect(screen.getByText("$797.56")).toBeInTheDocument();
    expect(screen.getByText("$852.68")).toBeInTheDocument();
    // Sep + Oct/Nov/Dec in the grid, plus the donut card's total row — the
    // month's share is what its Unspent and Spent add up to.
    expect(screen.getAllByText("$1,272.25").length).toBe(5);
    expect(screen.getByText(/Dashed months are at this month/)).toBeInTheDocument();
  });

  it("tells a screen reader which month is current, not just a colour", async () => {
    await show();
    // The highlight carries it visually; this carries it to anyone listening.
    // Scoped to the marker itself: "Sep" also appears as the calendar's
    // month tag further down the page.
    const marker = screen.getByText("(this month)");
    expect(marker.parentElement.textContent).toContain("Sep");
  });

  it("drops the projection note once every month is priced", async () => {
    mockPeriod = {
      ...termPeriod(),
      history: [
        { start: "2026-09-01", end: "2026-09-30", funding: 1272.25 },
      ],
    };
    mockPeriod.current = { ...termPeriod().current, cycle: 1, cycles: 1 };
    await show();
    expect(screen.queryByText(/Dashed months are at/)).not.toBeInTheDocument();
  });

  it("shows where the whole allowance stands next to the month", async () => {
    await show();
    expect(screen.getByText("Your Allowance")).toBeInTheDocument();
    expect(screen.getByText("Month 3 of 6")).toBeInTheDocument();
    expect(screen.getByText("$4,979.49")).toBeInTheDocument();
    expect(screen.getByText(/left of \$6,985\.33/)).toBeInTheDocument();
  });

  it("keeps the term caption to one line", async () => {
    await show();
    // "with 3 months to go after this one" is what the "Month 3 of 6" chip
    // five lines above already says, and it was what wrapped the line.
    expect(screen.getByText("$2,005.84 spent since it started.")).toBeInTheDocument();
    expect(screen.queryByText(/months to go/)).not.toBeInTheDocument();
  });

  it("marks the last month on the chip the months-to-go line used to", async () => {
    mockPeriod = { ...termPeriod() };
    mockPeriod.current = { ...termPeriod().current, cycle: 6, cycles: 6 };
    await show();
    expect(screen.getByText(/Month 6 of 6 · last/)).toBeInTheDocument();
  });

  it("prints the denominator the ring and the tiles are percentages of", async () => {
    await show();
    // The ring reads "% Unspent" and the tiles read "% of allowance"; without
    // this row the month's share appeared nowhere on the card, and in term
    // mode nowhere else on the page either — the allowance card below covers
    // the whole term, not the month drawn from it.
    expect(screen.getByText("Allowance")).toBeInTheDocument();
    expect(screen.queryByText("Income")).not.toBeInTheDocument();
  });

  it("names the breakdown tiles for the window they cover", async () => {
    await show();
    // "Total Spent" over one month's figure, at the foot of a page whose
    // heading has long scrolled away, reads as everything ever spent.
    expect(screen.getByText("Unspent This Month")).toBeInTheDocument();
    expect(screen.getByText("Spent This Month")).toBeInTheDocument();
    expect(screen.queryByText("Total Spent")).not.toBeInTheDocument();
  });

  it("stops calling the denominator income", async () => {
    await show();
    expect(screen.getAllByText(/of allowance/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/of income/)).not.toBeInTheDocument();
  });
});

describe("outside term mode", () => {
  beforeEach(() => {
    mockPeriod = monthPeriod();
  });

  it("still budgets from logged income", async () => {
    await show();
    // $2,200 in, $109.50 out.
    expect((await screen.findAllByText("$2,090.50")).length).toBe(2);
  });

  it("shows no allowance card and keeps the income wording", async () => {
    await show();
    expect(screen.queryByText("Your Allowance")).not.toBeInTheDocument();
    expect(screen.getAllByText(/of income/).length).toBeGreaterThan(0);
  });

  it("still says Period Tracker in days mode", async () => {
    mockPeriod = { ...monthPeriod(), mode: "days", noun: "period" };
    await show();
    expect(screen.getByText("Period Tracker")).toBeInTheDocument();
    expect(screen.getByText("Spent This Period")).toBeInTheDocument();
  });
});
