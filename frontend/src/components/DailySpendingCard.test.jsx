// Calendar/chart paging for long budget periods.
//
// A 151-day period is 22 grid rows and 151 bars if it isn't split, so it pages
// by calendar month above a threshold. Both views share one page so switching
// between them keeps your place.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Deterministic "today" — the component reads it to decide which page opens
// and which days are still in the future.
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-09-15",
}));
// These only supply colours and category icons; neither is under test here,
// and mocking them keeps the component out of the app's provider tree.
vi.mock("@/hooks/useChartColors", () => ({
  useChartColors: () => ({
    grid: "#eee", axis: "#888", cursor: "#eee", primary: "#0a0", spent: "#666",
    over: "#c00", tooltipBg: "#fff", tooltipBorder: "#ddd", tooltipText: "#000",
  }),
}));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ getCategory: () => ({ color: "#666", icon: () => null }) }),
}));

import DailySpendingCard from "@/components/DailySpendingCard";
import { periodDayList, periodEnd } from "@/lib/period";

const makePeriod = (start, days) => ({ start, end: periodEnd(start, days), days });

/** One `spent` entry per elapsed day, as the streak endpoint supplies. */
const makePeriodDays = (period, spendByDay = {}) =>
  periodDayList(period)
    .filter((d) => d <= "2026-09-15")
    .map((date) => ({ date, spent: spendByDay[date] ?? 0, budget: 20, status: "win" }));

const renderCard = (period, spendByDay = {}) =>
  render(
    <DailySpendingCard
      transactions={[]}
      income={3000}
      period={period}
      periodDays={makePeriodDays(period, spendByDay)}
      todayBudget={20}
    />
  );

const pager = () => screen.queryByLabelText("Previous month")?.closest("div")?.parentElement;
const pageLabel = () => screen.getByLabelText("Previous month").parentElement.querySelector("p").textContent;
const pageMeta = () =>
  screen.getByLabelText("Previous month").parentElement.querySelectorAll("p")[1].textContent;
const dayButtons = () =>
  screen.getAllByRole("button").filter((b) => /^\d+ \w{3}/.test(b.getAttribute("aria-label") ?? ""));

beforeEach(() => localStorage.clear());

describe("short periods", () => {
  it("show no pager, even when they straddle a month", () => {
    // 34 days is only ~6 rows; seeing the whole thing at once beats paging it.
    renderCard(makePeriod("2026-08-25", 34), { "2026-09-01": 12 });
    expect(screen.queryByLabelText("Previous month")).not.toBeInTheDocument();
  });

  it("render the whole period in one grid", () => {
    renderCard(makePeriod("2026-09-01", 20), { "2026-09-02": 12 });
    expect(dayButtons()).toHaveLength(20);
  });
});

describe("long periods", () => {
  // 1 Aug -> 29 Dec, 151 days: Aug, Sep, Oct, Nov, Dec.
  const long = makePeriod("2026-08-01", 151);
  const spend = { "2026-08-04": 25, "2026-09-02": 40, "2026-09-10": 15 };

  it("page by calendar month", () => {
    renderCard(long, spend);
    expect(pageMeta()).toMatch(/of 5$/);
  });

  it("open on the page containing today, not the first page", () => {
    renderCard(long, spend);
    expect(pageLabel()).toBe("September 2026");
    expect(pageMeta()).toMatch(/^\$55\.00 · 2 of 5/);
  });

  it("show only that month's days", () => {
    renderCard(long, spend);
    expect(dayButtons()).toHaveLength(30); // September
  });

  it("step backwards and forwards", async () => {
    renderCard(long, spend);
    await userEvent.click(screen.getByLabelText("Previous month"));
    expect(pageLabel()).toBe("August 2026");
    expect(dayButtons()).toHaveLength(31);
    expect(pageMeta()).toMatch(/^\$25\.00 · 1 of 5/);

    await userEvent.click(screen.getByLabelText("Next month"));
    await userEvent.click(screen.getByLabelText("Next month"));
    expect(pageLabel()).toBe("October 2026");
    expect(dayButtons()).toHaveLength(31);
  });

  it("disable the arrows at each end", async () => {
    renderCard(long, spend);
    await userEvent.click(screen.getByLabelText("Previous month"));
    expect(screen.getByLabelText("Previous month")).toBeDisabled();
    expect(screen.getByLabelText("Next month")).toBeEnabled();

    for (let i = 0; i < 4; i++) await userEvent.click(screen.getByLabelText("Next month"));
    expect(pageLabel()).toBe("December 2026");
    expect(screen.getByLabelText("Next month")).toBeDisabled();
  });

  it("total per page, while the header keeps the whole period's total", () => {
    renderCard(long, spend);
    // Page total is September's $55; the card header still reports all $80.
    expect(pageMeta()).toMatch(/^\$55\.00/);
    expect(screen.getByText("$80.00")).toBeInTheDocument();
  });

  it("keep the page when switching to the chart and back", async () => {
    renderCard(long, spend);
    await userEvent.click(screen.getByLabelText("Previous month"));
    expect(pageLabel()).toBe("August 2026");

    await userEvent.click(screen.getByLabelText("Chart view"));
    expect(pageLabel()).toBe("August 2026");
    expect(dayButtons()).toHaveLength(0); // grid is gone, pager remains

    await userEvent.click(screen.getByLabelText("Calendar view"));
    expect(pageLabel()).toBe("August 2026");
    expect(dayButtons()).toHaveLength(31);
  });

  it("drop the in-cell month tags once paging names the month", () => {
    renderCard(long, spend);
    expect(screen.queryByText("Sep")).not.toBeInTheDocument();
    expect(pageLabel()).toBe("September 2026");
  });

  it("mark days after today as future on the current page", () => {
    renderCard(long, spend);
    // Today is 15 Sep, so 16-30 Sep are future and not tappable.
    const disabled = dayButtons().filter((b) => b.hasAttribute("disabled"));
    expect(disabled).toHaveLength(15);
  });
});

describe("period boundaries", () => {
  it("counts a partial trailing month as its own page", () => {
    // 1 Aug + 100 days -> 8 Nov, so November contributes only 8 days.
    renderCard(makePeriod("2026-08-01", 100), { "2026-09-02": 10 });
    expect(pageMeta()).toMatch(/of 4$/);
  });

  it("pages a period that starts mid-month", () => {
    renderCard(makePeriod("2026-08-20", 60), { "2026-09-02": 10 });
    expect(pageLabel()).toBe("September 2026");
    // August contributes 20-31 only.
    expect(dayButtons()).toHaveLength(30);
  });
});

describe("income", () => {
  // A month with an allowance on the 1st, lunch the same day, and a refund
  // on the 3rd with no spending.
  const period = makePeriod("2026-09-01", 30);
  const transactions = [
    { _id: "a", type: "income", amount: 1200, date: "2026-09-01T00:00:00.000Z", description: "Allowance", category: "Pocket money" },
    { _id: "b", type: "expense", amount: 8.5, date: "2026-09-01T00:00:00.000Z", description: "Lunch", category: "Food" },
    { _id: "c", type: "income", amount: 30, date: "2026-09-03T00:00:00.000Z", description: "Refund", category: "Other" },
  ];

  // Stats' shape: no budgets, so day amounts come from the transactions.
  const renderStats = () =>
    render(<DailySpendingCard transactions={transactions} period={period} />);

  it("stays out of the spending totals", () => {
    renderStats();
    // Header total and the day's own figure are the $8.50 lunch only.
    expect(screen.getAllByText("$8.50").length).toBeGreaterThan(0);
    expect(screen.queryByText("$1,208.50")).not.toBeInTheDocument();
    expect(
      screen.getByLabelText("1 Sep: spent $8.50, income $1,200.00")
    ).toBeInTheDocument();
  });

  it("adds a legend entry for the marker in calendar view only", async () => {
    renderStats();
    expect(screen.getByText("Income Logged")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Chart view"));
    expect(screen.queryByText("Income Logged")).not.toBeInTheDocument();
  });

  it("lists the day's income under the spending in its sheet", async () => {
    renderStats();
    await userEvent.click(screen.getByLabelText(/^1 Sep:/));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("Lunch")).toBeInTheDocument();
    expect(within(sheet).getByText("Income")).toBeInTheDocument();
    expect(within(sheet).getByText("Allowance")).toBeInTheDocument();
    expect(within(sheet).getByText("+$1,200.00")).toHaveClass("text-positive");
    // The Spent figure at the top is still spending only.
    expect(within(sheet).getByText("Spent").nextSibling).toHaveTextContent("$8.50");
  });

  it("opens an income-only day with no spending and its income listed", async () => {
    renderStats();
    await userEvent.click(screen.getByLabelText("3 Sep: spent $0.00, income $30.00"));

    const sheet = screen.getByRole("dialog");
    expect(within(sheet).getByText("No spending logged this day.")).toBeInTheDocument();
    expect(within(sheet).getByText("+$30.00")).toBeInTheDocument();
  });

  it("doesn't mark a day without income", () => {
    renderStats();
    expect(screen.getByLabelText("2 Sep: spent $0.00")).toBeInTheDocument();
  });
});
