// The streak card's states. The one that matters most is overspending: the
// daily budget is clamped to $0 there, which used to render as a calm green
// "$0.00 left to spend today" while the user was hundreds past their budget.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const fetchStreak = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchStreak: (...args) => fetchStreak(...args),
  restoreStreak: vi.fn(),
}));
vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => ({ noun: "period", mode: "days" }),
}));
vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-09-15",
}));

import StreakCard from "@/components/StreakCard";

const streak = (over = {}) => ({
  hasData: true,
  hasIncome: true,
  overspentBy: 0,
  // $40/day was spread over the 106 days left, and $10 of today is gone.
  leftToSpend: 4230,
  periodSavings: 150,
  periodStatus: "active",
  period: { start: "2026-08-01", end: "2026-12-29", days: 151, daysLeft: 106, savesTotal: 15 },
  currentStreak: 5,
  longestStreak: 20,
  today: { spent: 10, budget: 40, remaining: 30, within: true },
  savesLeftThisPeriod: 15,
  restore: null,
  last7: [],
  periodDays: [],
  ...over,
});

beforeEach(() => fetchStreak.mockReset());

describe("within budget", () => {
  it("shows what is left to spend today", async () => {
    fetchStreak.mockResolvedValue(streak());
    render(<StreakCard />);

    expect(await screen.findByText("$30.00 left to spend today")).toBeInTheDocument();
    expect(
      screen.getByText(/\$40\.29\/day for the 105 days after today/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/past this period's budget/)).not.toBeInTheDocument();
  });

  it("recalculates the daily budget once today's spending is counted", async () => {
    // The point of the caption: spending today should visibly move the rate
    // the rest of the period runs at, without a trip to the Plan page.
    fetchStreak.mockResolvedValue(
      streak({
        leftToSpend: 4200,
        today: { spent: 40, budget: 40, remaining: 0, within: true },
      })
    );
    render(<StreakCard />);
    expect(
      await screen.findByText("$40.00/day for the 105 days after today.")
    ).toBeInTheDocument();
  });

  it("names the last day instead of dividing by zero days", async () => {
    fetchStreak.mockResolvedValue(
      streak({ period: { ...streak().period, daysLeft: 1 } })
    );
    render(<StreakCard />);
    expect(await screen.findByText(/Last day of this period/)).toBeInTheDocument();
    expect(screen.queryByText(/\/day for the/)).not.toBeInTheDocument();
  });

  it("shows the overshoot when only today is over", async () => {
    fetchStreak.mockResolvedValue(
      streak({ today: { spent: 55, budget: 40, remaining: -15, within: false } })
    );
    render(<StreakCard />);
    expect(await screen.findByText("$15.00 over today's budget")).toBeInTheDocument();
  });
});

describe("past the period's budget", () => {
  const overspent = streak({
    overspentBy: 350,
    today: { spent: 0, budget: 0, remaining: 0, within: true },
  });

  it("says how far past, instead of a calm $0.00 left", async () => {
    fetchStreak.mockResolvedValue(overspent);
    render(<StreakCard />);

    expect(await screen.findByText("$350.00 past this period's budget")).toBeInTheDocument();
    // The misleading line this replaced.
    expect(screen.queryByText(/left to spend today/)).not.toBeInTheDocument();
  });

  it("explains that there is no daily budget and when it resets", async () => {
    fetchStreak.mockResolvedValue(overspent);
    render(<StreakCard />);

    const warning = await screen.findByText(/no\s+daily budget left/);
    expect(warning).toHaveTextContent("29 Dec");
    expect(warning).toHaveTextContent("106 days away");
    expect(warning).toHaveTextContent("Logging new income brings it back");
  });

  it("still counts a no-spend day as on track", async () => {
    // Being over the period budget is a warning, not a verdict on today.
    fetchStreak.mockResolvedValue(overspent);
    render(<StreakCard />);
    expect(await screen.findByText("5")).toBeInTheDocument();
  });

  it("drops the per-day caption, which would read as $0.00/day", async () => {
    fetchStreak.mockResolvedValue(overspent);
    render(<StreakCard />);
    await screen.findByText(/past this period's budget/);
    expect(screen.queryByText(/\/day for the/)).not.toBeInTheDocument();
  });
});

describe("restores", () => {
  it("draws one shield per restore for a short period", async () => {
    fetchStreak.mockResolvedValue(
      streak({
        savesLeftThisPeriod: 1,
        period: { ...streak().period, days: 15, savesTotal: 2 },
      })
    );
    render(<StreakCard />);
    expect(await screen.findByLabelText("1 of 2 restores left")).toBeInTheDocument();
    expect(screen.queryByText("/ 2")).not.toBeInTheDocument();
  });

  it("falls back to a count when a long period has too many to draw", async () => {
    fetchStreak.mockResolvedValue(streak());
    render(<StreakCard />);
    expect(await screen.findByLabelText("15 of 15 restores left")).toBeInTheDocument();
    expect(screen.getByText("/ 15")).toBeInTheDocument();
  });
});

describe("no period running", () => {
  it("points at settings rather than the ledger", async () => {
    fetchStreak.mockResolvedValue(
      streak({ periodStatus: "inactive", period: null, hasIncome: false })
    );
    render(<StreakCard />);

    expect(await screen.findByText("No Budget Period Running")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start a Period" })).toBeInTheDocument();
  });

  it("asks for income when a period is running but empty", async () => {
    fetchStreak.mockResolvedValue(streak({ hasIncome: false }));
    render(<StreakCard />);

    expect(await screen.findByText("Start a Spending Streak")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add Income" })).toBeInTheDocument();
  });
});
