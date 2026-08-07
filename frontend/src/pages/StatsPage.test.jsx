// The history page. Two things here are easy to get wrong and look like bugs:
// the all-time savings rate deliberately disagrees with the per-month average,
// and the calendar deliberately shows no budget verdicts.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-03-20",
}));

const fetchAllSummaries = vi.fn();
const fetchTransactions = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchAllSummaries: (...a) => fetchAllSummaries(...a),
  fetchTransactions: (...a) => fetchTransactions(...a),
}));
vi.mock("@/hooks/useChartColors", () => ({
  useChartColors: () => ({
    grid: "#eee", axis: "#888", cursor: "#eee", primary: "#0a0", spent: "#666",
    saved: "#0a0", over: "#c00", tooltipBg: "#fff", tooltipBorder: "#ddd",
    tooltipText: "#000",
  }),
}));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ getCategory: () => ({ color: "#666", icon: () => null }) }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

// The tiles count up from 0 over 1200ms. Framer's useReducedMotion reads the
// media query when it is first imported, so overriding matchMedia from a hook
// is already too late and the snap-to-final only sometimes wins — these
// assertions were racing the animation. The subject here is the arithmetic and
// the labelling, so take the animation out of it altogether.
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (value) => value }));

import StatsPage, { StatTile } from "@/pages/StatsPage";

const summary = (year, month, totalIncome, totalExpenses) => ({
  year,
  month,
  totalIncome,
  totalExpenses,
  totalSaved: totalIncome - totalExpenses,
  percentageSaved:
    totalIncome > 0
      ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)
      : 0,
});

const txn = (date, amount, category = "Food & Drinks") => ({
  _id: date + amount,
  date: `${date}T00:00:00.000Z`,
  type: "expense",
  amount,
  category,
  description: "x",
});

/** Render and wait for both fetches to settle. */
const show = async () => {
  render(<StatsPage />);
  return screen.findByRole("button", { name: /All time/ });
};

beforeEach(() => {
  fetchAllSummaries.mockReset().mockResolvedValue([]);
  fetchTransactions.mockReset().mockResolvedValue([]);
});

describe("the two savings rates", () => {
  // Jan: earned $100, kept $90 (90%). Feb: earned $2000, kept $200 (10%).
  // Mean of the months is 50%. Of every dollar earned, 13.8% was kept.
  const lumpy = [summary(2026, 0, 100, 10), summary(2026, 1, 2000, 1800)];

  it("reports the all-time rate by dollars earned, not by month", async () => {
    fetchAllSummaries.mockResolvedValue(lumpy);
    await show();

    // (2100 - 1810) / 2100 = 13.8% -> 14%
    expect(screen.getByText("Savings rate").previousSibling).toHaveTextContent("14%");
    expect(screen.getByText("Of everything earned")).toBeInTheDocument();
  });

  it("keeps the per-month average as its own, different figure", async () => {
    fetchAllSummaries.mockResolvedValue(lumpy);
    const user = userEvent.setup();
    await show();
    await user.click(screen.getByRole("button", { name: /Per month/ }));

    // The mean of 90% and 10%. A tiny month counts as much as a big one, which
    // is the whole reason this isn't the headline number.
    expect(screen.getByText("Average month").previousSibling).toHaveTextContent("50%");
    expect(screen.getByText("Each month counts once")).toBeInTheDocument();
  });

  it("swaps the tiles rather than showing both at once", async () => {
    fetchAllSummaries.mockResolvedValue(lumpy);
    const user = userEvent.setup();
    await show();

    expect(screen.getByText("Total earned")).toBeInTheDocument();
    expect(screen.queryByText("Months tracked")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Per month/ }));
    expect(screen.getByText("Months tracked")).toBeInTheDocument();
    expect(screen.queryByText("Total earned")).not.toBeInTheDocument();
  });

  it("doesn't divide by zero when nothing was ever earned", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 0, 0, 0)]);
    await show();
    expect(screen.getByText("Savings rate").previousSibling).toHaveTextContent("0%");
  });
});

describe("the daily calendar", () => {
  const threeMonths = [
    summary(2026, 0, 1000, 400),
    summary(2026, 1, 1000, 500),
    summary(2026, 2, 1000, 300),
  ];

  it("spans every month with activity, not just this one", async () => {
    fetchAllSummaries.mockResolvedValue(threeMonths);
    await show();

    expect(fetchTransactions).toHaveBeenCalledWith({
      start: "2026-01-01",
      end: "2026-03-20",
    });
  });

  it("shows what a day cost without passing judgement on it", async () => {
    fetchAllSummaries.mockResolvedValue(threeMonths);
    fetchTransactions.mockResolvedValue([txn("2026-03-04", 42)]);
    await show();

    const day = await screen.findByLabelText(/^4 Mar: spent \$42\.00/);
    // No "over budget" / "within budget" verdict, and none of the budget
    // chrome that would come with one.
    expect(day.getAttribute("aria-label")).not.toMatch(/budget/);
    expect(screen.queryByText(/Today's budget/)).not.toBeInTheDocument();
    expect(screen.queryByText("Within budget")).not.toBeInTheDocument();
    expect(screen.queryByText(/budget adapts daily/)).not.toBeInTheDocument();
  });

  it("pages by month, so a long history stays readable", async () => {
    fetchAllSummaries.mockResolvedValue(threeMonths);
    fetchTransactions.mockResolvedValue([txn("2026-01-06", 15), txn("2026-03-04", 42)]);
    await show();

    // Opens on the page holding today.
    expect(await screen.findByLabelText(/^4 Mar: spent/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^6 Jan: spent/)).not.toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByLabelText("Previous month"));
    await user.click(screen.getByLabelText("Previous month"));

    expect(screen.getByLabelText(/^6 Jan: spent \$15\.00/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^4 Mar: spent/)).not.toBeInTheDocument();
  });

  it("still opens a day's transactions", async () => {
    fetchAllSummaries.mockResolvedValue(threeMonths);
    fetchTransactions.mockResolvedValue([txn("2026-03-04", 42, "Transport")]);
    await show();

    const user = userEvent.setup();
    await user.click(await screen.findByLabelText(/^4 Mar: spent/));

    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText("Transport")).toBeInTheDocument();
  });

  it("survives the transactions request failing", async () => {
    fetchAllSummaries.mockResolvedValue(threeMonths);
    fetchTransactions.mockRejectedValue(new Error("nope"));
    await show();

    // The page still renders; only the calendar's detail is missing.
    expect(screen.getByText("Total earned")).toBeInTheDocument();
  });

  it("is left out entirely when there's no history", async () => {
    fetchAllSummaries.mockResolvedValue([]);
    render(<StatsPage />);
    expect(await screen.findByText(/No monthly data yet/)).toBeInTheDocument();
    expect(fetchTransactions).not.toHaveBeenCalled();
  });
});

describe("stat tiles", () => {
  // Two tiles share a 375px row, so a long total has to step down rather than
  // spill past the card. The step is driven by the rendered string, not the
  // magnitude, so "$1,000.00" and "1000%" are judged the same way.
  const sizeOf = (props) => {
    const { container } = render(<StatTile label="x" {...props} />);
    const value = container.querySelector("p");
    return [...value.classList].find((c) => c.startsWith("text-"));
  };

  it("keeps ordinary amounts at full size", () => {
    expect(sizeOf({ value: 4820.5, money: true })).toBe("text-2xl");
  });

  it("steps down as the number grows", () => {
    expect(sizeOf({ value: 14820.5, money: true })).toBe("text-xl");
    expect(sizeOf({ value: 148205.5, money: true })).toBe("text-lg");
    expect(sizeOf({ value: 1482055.5, money: true })).toBe("text-base");
  });

  it("counts the suffix, not just the digits", () => {
    expect(sizeOf({ value: 25, suffix: "%" })).toBe("text-2xl");
  });
});

describe("the calendar's 12-month cap", () => {
  // Today is 2026-03-20, so the window floor is 2025-04-01.
  const monthsBack = (n) =>
    Array.from({ length: n }, (_, i) => {
      const d = new Date(Date.UTC(2026, 2 - (n - 1 - i), 1));
      return summary(d.getUTCFullYear(), d.getUTCMonth(), 1000, 400);
    });

  it("asks for at most a year of transactions", async () => {
    fetchAllSummaries.mockResolvedValue(monthsBack(30));
    await show();

    expect(fetchTransactions).toHaveBeenCalledWith({
      start: "2025-04-01",
      end: "2026-03-20",
    });
  });

  it("says so, rather than claiming to show everything", async () => {
    fetchAllSummaries.mockResolvedValue(monthsBack(30));
    await show();
    expect(await screen.findByText("The last 12 months")).toBeInTheDocument();
  });

  it("leaves a shorter history alone", async () => {
    fetchAllSummaries.mockResolvedValue(monthsBack(3));
    await show();

    expect(fetchTransactions).toHaveBeenCalledWith({
      start: "2026-01-01",
      end: "2026-03-20",
    });
    expect(await screen.findByText("Every day you've tracked")).toBeInTheDocument();
  });

  it("still totals every month in the headline figures", async () => {
    // 30 months x $1000 earned. Capping the calendar must not cap the maths.
    fetchAllSummaries.mockResolvedValue(monthsBack(30));
    await show();
    expect(screen.getByText("Total earned").previousSibling).toHaveTextContent(
      "$30,000.00"
    );
  });
});
