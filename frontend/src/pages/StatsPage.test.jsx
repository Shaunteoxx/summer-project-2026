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

// The page joins each month against the budget period's cycle list, so that a
// month funded out of an earlier lump sum is judged against its share of it
// rather than against income it never took in. Month mode has no cycles and no
// funding, which is the default here.
let mockPeriod;
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => mockPeriod,
}));

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

const txn = (date, amount, category = "F & B") => ({
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
  return screen.findByRole("button", { name: /All Time/ });
};

beforeEach(() => {
  mockPeriod = { mode: "month", history: [] };
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
    expect(screen.getByText("Savings Rate").previousSibling).toHaveTextContent("14%");
  });

  it("keeps the per-month average as its own, different figure", async () => {
    fetchAllSummaries.mockResolvedValue(lumpy);
    const user = userEvent.setup();
    await show();
    await user.click(screen.getByRole("button", { name: /Per Month/ }));

    // The mean of 90% and 10%. A tiny month counts as much as a big one, which
    // is the whole reason this isn't the headline number.
    expect(screen.getByText("Average Month").previousSibling).toHaveTextContent("50%");
    expect(screen.getByText("Each month counts once")).toBeInTheDocument();
  });

  it("swaps the tiles rather than showing both at once", async () => {
    fetchAllSummaries.mockResolvedValue(lumpy);
    const user = userEvent.setup();
    await show();

    expect(screen.getByText("Total Earned")).toBeInTheDocument();
    expect(screen.queryByText("Months Tracked")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Per Month/ }));
    expect(screen.getByText("Months Tracked")).toBeInTheDocument();
    expect(screen.queryByText("Total Earned")).not.toBeInTheDocument();
  });

  it("doesn't divide by zero when nothing was ever earned", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 0, 0, 0)]);
    await show();
    expect(screen.getByText("Savings Rate").previousSibling).toHaveTextContent("0%");
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
    expect(screen.queryByText("Within Budget")).not.toBeInTheDocument();
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
    expect(screen.getByText("Total Earned")).toBeInTheDocument();
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
    expect(screen.getByText("Total Earned").previousSibling).toHaveTextContent(
      "$30,000.00"
    );
  });
});

// The breakdown lists the month that is still running alongside finished ones,
// and its percentage means something different: money not yet spent, not money
// saved. Home and Tracker were fixed for exactly this; the row here has to say
// which kind of figure it is rather than let the reader assume.
describe("the month still in progress", () => {
  // `localToday` is mocked to 2026-03-20 at the top of this file, so March
  // 2026 is the running month and February is a finished one.
  it("says 'unspent so far' for the running month, not 'saved'", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 2, 1000, 200)]);
    await show();
    expect(await screen.findByText("80% unspent so far")).toBeInTheDocument();
    expect(screen.queryByText("80% saved")).not.toBeInTheDocument();
  });

  it("still says 'saved' for a month that has finished", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 1, 1000, 200)]);
    await show();
    expect(await screen.findByText("80% saved")).toBeInTheDocument();
    expect(screen.queryByText("80% unspent so far")).not.toBeInTheDocument();
  });

  // The all-time totals sum the partial month in too. With one month tracked
  // that tile *is* the running month, so it needs the caveat most exactly when
  // the reader has least history to judge it against.
  it("says the all-time totals include a month still running", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 2, 1000, 200)]);
    await show();
    expect(
      await screen.findAllByText("Includes this month, still running")
    ).toHaveLength(2);
  });

  it("drops the caveat once every month has finished", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 1, 1000, 200)]);
    await show();
    expect(
      screen.queryByText("Includes this month, still running")
    ).not.toBeInTheDocument();
  });

  it("leaves the plain sums uncaveated — they aren't making a claim", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 2, 1000, 200)]);
    await show();
    // Earned and Spent are facts about a partial month, not flattery, so the
    // hint sits only on the two accent tiles.
    for (const label of ["Total Earned", "Total Spent"]) {
      const tile = screen.getByText(label).closest("div");
      expect(tile).not.toHaveTextContent("still running");
    }
  });
});

// These rows divide by the month's income, while Home, the tracker and the
// leaderboard divide by the window's budget. For a term cycle funded by a lump
// sum banked months earlier those are different numbers for the same month —
// September read 95% here and 91% everywhere else — so the denominator has to
// be on screen, and a month with no income at all can't claim to have saved
// none of it.
describe("saying what the percentages are of", () => {
  it("names the denominator once, not on every row", async () => {
    fetchAllSummaries.mockResolvedValue([
      summary(2026, 1, 1000, 200),
      summary(2026, 0, 800, 300),
    ]);
    await show();
    expect(
      await screen.findByText(
        "Percentages are of that month's income, or of its share of an allowance."
      )
    ).toBeInTheDocument();
  });

  it("reports a month with no income as such, not as 0% saved", async () => {
    // A month funded by an earlier lump sum: money out, nothing in.
    fetchAllSummaries.mockResolvedValue([summary(2026, 1, 0, 1374.4)]);
    await show();
    expect(await screen.findByText("No income logged")).toBeInTheDocument();
    expect(screen.queryByText("0% saved")).not.toBeInTheDocument();
  });

  it("keeps the percentage on a month that had income", async () => {
    fetchAllSummaries.mockResolvedValue([summary(2026, 1, 1000, 200)]);
    await show();
    expect(await screen.findByText("80% saved")).toBeInTheDocument();
    expect(screen.queryByText("No income logged")).not.toBeInTheDocument();
  });
});

// A term spends one lump sum across several months, so only the month it landed
// in has income of its own. Judged on /summary/all alone — which is
// transaction-only and has never heard of terms — February read "+$0.00 in ·
// −$800.00 out" and a red −$800.00, for a month that was funded all along, and
// January claimed a saving that was really five other months' worth. The page
// joins each month to its priced cycle so the figures match Home and Tracker.
describe("a month funded by an allowance", () => {
  // Jan–Jun 2026, $6,000 banked in January. Today is 20 March.
  const cycle = (start, end, funding) => ({ start, end, funding });
  const term = () => ({
    mode: "term",
    history: [
      cycle("2026-03-01", "2026-03-31", 1150),
      cycle("2026-02-01", "2026-02-28", 1100),
      cycle("2026-01-01", "2026-01-31", 1000),
    ],
  });
  const spending = [
    summary(2026, 0, 6000, 500),
    summary(2026, 1, 0, 800),
    summary(2026, 2, 0, 300),
  ];

  const showTerm = async () => {
    mockPeriod = term();
    fetchAllSummaries.mockResolvedValue(spending);
    return show();
  };

  it("names the month's share instead of the income it never took in", async () => {
    await showTerm();
    expect(await screen.findByText(/\$1,100\.00 allowance/)).toBeInTheDocument();
    expect(screen.queryByText(/\+\$0\.00 in/)).not.toBeInTheDocument();
  });

  it("stops reporting a funded month as a deficit", async () => {
    await showTerm();
    // $1,100 share less $800 spent. It used to read −$800.00 in red.
    expect(await screen.findByText("+$300.00")).toBeInTheDocument();
    expect(screen.queryByText("−$800.00")).not.toBeInTheDocument();
    expect(screen.getByText("27% saved")).toBeInTheDocument();
  });

  it("judges the month the money arrived by its own share too", async () => {
    await showTerm();
    // Not (6000 − 500) / 6000 = 92%: five of those dollars belong to the
    // months after it, which is the entire point of a term.
    expect(await screen.findByText("50% saved")).toBeInTheDocument();
    expect(screen.queryByText("92% saved")).not.toBeInTheDocument();
  });

  it("still says 'unspent so far' for the month in progress", async () => {
    await showTerm();
    expect(await screen.findByText("74% unspent so far")).toBeInTheDocument();
  });

  it("averages the months against their shares, not against income", async () => {
    const user = userEvent.setup();
    await showTerm();
    await user.click(screen.getByRole("button", { name: /Per Month/ }));

    // The mean of 50%, 27% and 74%. Read off income it was the mean of 92%
    // and two zeroes — 31% — because two of the three months had no income.
    expect(screen.getByText("Average Month").previousSibling).toHaveTextContent("50%");
  });

  it("leaves a mid-month first cycle to its own income", async () => {
    // A term starting on the 15th funds half of January, but the summary row
    // covers all of it — charging the share against the whole month's spending
    // would count purchases made before the term began.
    mockPeriod = { mode: "term", history: [cycle("2026-01-15", "2026-01-31", 520)] };
    fetchAllSummaries.mockResolvedValue([summary(2026, 0, 6000, 500)]);
    await show();
    expect(await screen.findByText(/\+\$6,000\.00 in/)).toBeInTheDocument();
    // Scoped to the row: the caption above the list names "allowance" too.
    expect(screen.queryByText(/\$520\.00 allowance/)).not.toBeInTheDocument();
  });

  it("calls an overspent month over, not negatively saved", async () => {
    // $852.68 share against $1,256.14 spent. Judging months against a share
    // rather than against income makes this an ordinary outcome instead of a
    // rarity, and "−47% saved" is not a quantity of saving.
    mockPeriod = {
      mode: "term",
      history: [cycle("2026-02-01", "2026-02-28", 852.68)],
    };
    fetchAllSummaries.mockResolvedValue([summary(2026, 1, 0, 1256.14)]);
    await show();
    expect(await screen.findByText("47% over")).toBeInTheDocument();
    expect(screen.queryByText(/-47% saved|−47% saved/)).not.toBeInTheDocument();
    // The figure itself still carries the sign and the colour.
    expect(screen.getByText("−$403.46")).toBeInTheDocument();
  });

  it("says what it knows about a month whose share was never priced", async () => {
    // Cycles of a finished term come back unpriced — only the term containing
    // today gets costed — so the share is unknown, not zero.
    mockPeriod = { mode: "term", history: [] };
    fetchAllSummaries.mockResolvedValue([summary(2025, 10, 0, 640)]);
    await show();
    expect(await screen.findByText("From your allowance")).toBeInTheDocument();
    expect(screen.queryByText("−$640.00")).not.toBeInTheDocument();
    expect(screen.queryByText("No income logged")).not.toBeInTheDocument();
  });

  it("still calls an unfunded month outside term mode a deficit", async () => {
    // Nothing paid for this one in advance: the red figure is the truth.
    mockPeriod = { mode: "month", history: [] };
    fetchAllSummaries.mockResolvedValue([summary(2026, 1, 0, 640)]);
    await show();
    expect(await screen.findByText("−$640.00")).toBeInTheDocument();
    expect(screen.getByText("No income logged")).toBeInTheDocument();
    expect(screen.queryByText("From your allowance")).not.toBeInTheDocument();
  });
});
