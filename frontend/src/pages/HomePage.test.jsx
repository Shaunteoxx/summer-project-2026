// The hero's pace bar. Two labels track moving points on the bar and a third
// links away, which is a lot of derived positioning for something with no test
// behind it — a component referenced but never defined shipped here once,
// because `vite build` doesn't check identifiers and nothing rendered this page.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-08-12",
}));

const fetchHomeStats = vi.fn();
const fetchTransactions = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchHomeStats: (...a) => fetchHomeStats(...a),
  fetchTransactions: (...a) => fetchTransactions(...a),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({ getCategory: () => ({ color: "#666", icon: () => null }) }),
}));
// Overridden per-test where the absence of a period is the subject.
let mockPeriod = { current: null, noun: "month", status: "active" };
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => mockPeriod,
}));
// The streak card fetches on its own, so it's stubbed — but it has to keep
// saying the thing it really says when no period is running, or the test that
// this page doesn't repeat itself would pass without proving anything.
vi.mock("@/components/StreakCard", () => ({
  default: () => <div>No budget period running</div>,
}));
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (value) => value }));

import HomePage from "@/pages/HomePage";

// $1,240 in, $300 reserved => $940 to spend. $287.40 out on day 12 of 31.
const stats = {
  username: "shaunteo",
  leftToSpend: 652.6,
  periodIncome: 1240,
  periodExpenses: 287.4,
  periodSavings: 300,
  totalSavings: 0,
  // No `percentageSaved`: the page deliberately doesn't read it. The tile is
  // derived from the pace bar instead — see "the unspent tile" below.
  period: { start: "2026-08-01", end: "2026-08-31", days: 31, daysLeft: 20 },
};

// One logged entry, because the figures above only exist if something was
// logged — an empty ledger puts the page into its "nothing logged yet" state,
// where there is no pace bar to test.
const entry = {
  _id: "t1",
  date: "2026-08-11T00:00:00.000Z",
  type: "expense",
  amount: 4.5,
  category: "F & B",
  description: "Chicken rice",
};

const show = async (overrides = {}, transactions = [entry]) => {
  fetchHomeStats.mockResolvedValue({ ...stats, ...overrides });
  fetchTransactions.mockResolvedValue(transactions);
  render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
  await screen.findByText(/Welcome back/);
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPeriod = { current: null, noun: "month", status: "active" };
});

describe("the pace bar", () => {
  it("renders the page at all", async () => {
    await show();
    expect(screen.getByText("Welcome back, shaunteo")).toBeInTheDocument();
  });

  it("labels each mark with its own percentage", async () => {
    await show();
    // 287.40 of 940 spent; 11 of 31 days elapsed at the start of day 12.
    expect(await screen.findByText("31% spent")).toBeInTheDocument();
    expect(screen.getByText(/35% of the month passed/)).toBeInTheDocument();
  });

  // The tile under the bar used to read the API's `percentageSaved`, which
  // divides by income: (1240 - 287.40) / 1240 = 77%, printed beneath a bar
  // reading 31% spent. Those don't complement, and 100 - 31 = 69 says so. It
  // now comes off the bar, so the two always sum to 100.
  it("shows the unspent share of the budget, not of income", async () => {
    await show();
    expect(await screen.findByText("Unspent So Far")).toBeInTheDocument();
    // The figure counts up, so wait for it to land rather than reading 0.
    expect(await screen.findByText("69%")).toBeInTheDocument();
    expect(screen.queryByText("77%")).not.toBeInTheDocument();
  });

  it("has nothing unspent once the budget is gone", async () => {
    await show({ periodExpenses: 1100, leftToSpend: -160 });
    expect(await screen.findByText("100% spent")).toBeInTheDocument();
    expect(await screen.findByText("0%")).toBeInTheDocument();
  });

  // The overspent state names the way out, so it has to be tappable: this is
  // the screen where someone most needs the next step, and it used to be prose.
  describe("the overspent state", () => {
    const overspend = () => show({ periodExpenses: 1100, leftToSpend: -160 });

    it("offers both ways back, not just a description of them", async () => {
      await overspend();
      expect(
        await screen.findByRole("button", { name: "Add Income" })
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Lower Target" })).toBeInTheDocument();
    });

    it("sends 'Add Income' to the income sheet", async () => {
      const user = (await import("@testing-library/user-event")).default.setup();
      await overspend();
      await user.click(await screen.findByRole("button", { name: "Add Income" }));
      expect(navigate).toHaveBeenCalledWith("/transactions", {
        state: { openAdd: "income" },
      });
    });

    it("sends 'Lower Target' to where the target is set", async () => {
      const user = (await import("@testing-library/user-event")).default.setup();
      await overspend();
      await user.click(await screen.findByRole("button", { name: "Lower Target" }));
      expect(navigate).toHaveBeenCalledWith("/more");
    });

    it("shows neither button while the budget still holds", async () => {
      await show();
      expect(await screen.findByText("31% spent")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Add Income" })).not.toBeInTheDocument();
    });
  });

  it("calls spending under the elapsed share 'ahead of pace'", async () => {
    await show();
    expect(screen.getByRole("button", { name: /Ahead of pace/ })).toBeInTheDocument();
  });

  it("calls spending over the elapsed share 'behind pace'", async () => {
    await show({ periodExpenses: 700, leftToSpend: 240 });
    expect(screen.getByRole("button", { name: /Behind pace/ })).toBeInTheDocument();
  });

  // The verdict reads the spent figure, so it shares that figure's line rather
  // than sitting three rows below the number it's interpreting. They can share
  // it because the spent label's clamp is told how wide the verdict is and
  // stops short of it — the collision that kept them apart before.
  it("puts the verdict on the same line as the spent figure", async () => {
    await show();
    const spent = await screen.findByText("31% spent");
    const verdict = screen.getByRole("button", { name: /Ahead of pace/ });

    // One row holding both, and nothing else — the verdict no longer has a
    // row of its own below the bar.
    const row = verdict.parentElement;
    expect(spent.parentElement).toBe(row);
    expect(row.children).toHaveLength(2);
  });

  it("sends the verdict to the plan page, at its pace card", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    await show();
    await user.click(screen.getByRole("button", { name: /Ahead of pace/ }));
    expect(navigate).toHaveBeenCalledWith("/plan", { state: { focus: "pace" } });
  });

  it("reports being past the budget rather than a pace, when overspent", async () => {
    await show({ leftToSpend: -86.4, periodExpenses: 1026.4 });
    expect(screen.getByText("100% spent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /past/ })).toBeInTheDocument();
  });
});

// Days mode with nothing running. Every figure below the greeting depends on
// a period, so there is nothing to show and something to do instead.
describe("with no budget period running", () => {
  const showNoPeriod = async (status = "active") => {
    mockPeriod = { current: null, noun: "month", status };
    fetchHomeStats.mockResolvedValue({ ...stats, period: null });
    fetchTransactions.mockResolvedValue([entry]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await screen.findByText(/Welcome back/);
  };

  it("names the gap and offers the one thing that closes it", async () => {
    await showNoPeriod();
    expect(screen.getByText("No Budget Period Running Yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Set Up a Period" })
    ).toBeInTheDocument();
    // No hero, because there is no budget to put in it.
    expect(screen.queryByText(/% spent/)).not.toBeInTheDocument();
  });

  it("says so differently once a period has been and gone", async () => {
    await showNoPeriod("lapsed");
    expect(
      screen.getByText("Your Last Budget Period Has Ended")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start Next Period" })
    ).toBeInTheDocument();
  });

  // The streak card carries its own "No Budget Period Running" empty state,
  // with its own button. Rendered under this one it asked the same question
  // twice, three lines apart.
  it("doesn't ask twice", async () => {
    await showNoPeriod();
    expect(screen.getAllByText(/No Budget Period Running/)).toHaveLength(1);
  });

  it("sends you to More, where periods are set up", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    await showNoPeriod();
    await user.click(screen.getByRole("button", { name: "Set Up a Period" }));
    expect(navigate).toHaveBeenCalledWith("/more");
  });
});

// Every figure on this page is derived from the ledger. With an empty ledger
// they all read zero, which states something false — that you have no money —
// rather than the true thing, which is that nothing has been logged yet.
describe("with nothing logged yet", () => {
  const showEmpty = async () => {
    fetchHomeStats.mockResolvedValue({
      ...stats,
      leftToSpend: 0,
      periodIncome: 0,
      periodExpenses: 0,
      periodSavings: 0,
    });
    fetchTransactions.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    );
    await screen.findByText("Nothing Logged Yet");
  };

  it("names the gap instead of showing a page of zeroes", async () => {
    await showEmpty();

    expect(screen.queryByText(/% spent/)).not.toBeInTheDocument();
    expect(screen.queryByText("Recent")).not.toBeInTheDocument();
    expect(screen.queryByText(/Left to spend/)).not.toBeInTheDocument();
  });

  it("greets a first-time visitor without welcoming them back", async () => {
    await showEmpty();
    expect(screen.getByText("Welcome, shaunteo")).toBeInTheDocument();
  });

  it("opens the sheet on income, which is what has to be logged first", async () => {
    const user = (await import("@testing-library/user-event")).default.setup();
    await showEmpty();

    await user.click(screen.getByRole("button", { name: /Add Your First Entry/ }));
    expect(navigate).toHaveBeenCalledWith("/transactions", {
      state: { openAdd: "income" },
    });
  });
});
