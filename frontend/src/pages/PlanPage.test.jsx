// The Plan page's empty state, which three different situations reach through
// the same `income <= 0` door.
//
// It matters more here than on any other screen: the + button is deliberately
// hidden on Plan (see AddFab), so the button in this empty state is the only
// way to add anything. It used to navigate to /transactions with no state,
// which dropped the reader on the ledger with nothing open — a dead end
// dressed as an action.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-09-06",
}));

const fetchHomeStats = vi.fn();
const fetchStreak = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchHomeStats: (...a) => fetchHomeStats(...a),
  fetchStreak: (...a) => fetchStreak(...a),
}));

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/hooks/useCountUp", () => ({ useCountUp: (value) => value }));

let mockPeriod;
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => mockPeriod,
}));

import PlanPage from "@/pages/PlanPage";

const month = {
  id: "m",
  start: "2026-09-01",
  end: "2026-09-30",
  days: 30,
  daysLeft: 25,
};

const stats = (over = {}) => ({
  username: "sam",
  mode: "month",
  status: "active",
  period: month,
  periodIncome: 0,
  periodFunding: null,
  periodExpenses: 0,
  periodSavings: 0,
  leftToSpend: 0,
  totalSavings: 0,
  percentageSaved: 0,
  ...over,
});

const show = async (statsOver = {}, period) => {
  mockPeriod = period ?? {
    loading: false,
    mode: "month",
    noun: "month",
    status: "active",
    current: month,
    term: null,
    history: [],
  };
  fetchHomeStats.mockResolvedValue(stats(statsOver));
  fetchStreak.mockResolvedValue(null);
  render(
    <MemoryRouter>
      <PlanPage />
    </MemoryRouter>
  );
  return screen.findByText("Plan");
};

beforeEach(() => {
  navigate.mockReset();
  fetchHomeStats.mockReset();
  fetchStreak.mockReset();
});

describe("with nothing logged", () => {
  it("calls the next entry the first one", async () => {
    await show();
    expect(await screen.findByText("Nothing Logged Yet")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Add Your First Entry/ })
    ).toBeInTheDocument();
  });

  it("opens the sheet rather than dropping the reader on the ledger", async () => {
    const user = userEvent.setup();
    await show();
    await user.click(
      await screen.findByRole("button", { name: /Add Your First Entry/ })
    );
    // The whole point: /transactions on its own opens nothing, and there is no
    // + button on this page to fall back to.
    expect(navigate).toHaveBeenCalledWith("/transactions", {
      state: { openAdd: "income" },
    });
  });
});

describe("with expenses but no income", () => {
  it("doesn't call it a first entry, because it isn't one", async () => {
    await show({ periodExpenses: 148.2 });
    expect(await screen.findByText("No Income This Month")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Add Income/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add Your First Entry/ })
    ).not.toBeInTheDocument();
  });

  it("still opens the sheet on income", async () => {
    const user = userEvent.setup();
    await show({ periodExpenses: 148.2 });
    await user.click(await screen.findByRole("button", { name: /Add Income/ }));
    expect(navigate).toHaveBeenCalledWith("/transactions", {
      state: { openAdd: "income" },
    });
  });
});

// Income is 0 here because there is nowhere to put it. Offering to log some
// would send the reader off to do something that changes nothing.
describe("with no window running at all", () => {
  const noWindow = (mode) => ({
    loading: false,
    mode,
    noun: mode === "days" ? "period" : "month",
    status: "none",
    current: null,
    term: null,
    history: [],
  });

  it("points at the period, not at income", async () => {
    await show({ period: null }, noWindow("days"));
    expect(
      await screen.findByText("No Budget Period Running Yet")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up a Period" })).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Add (Income|Your First Entry)/ })
    ).not.toBeInTheDocument();
  });

  it("sends you to More, where windows are set up", async () => {
    const user = userEvent.setup();
    await show({ period: null }, noWindow("days"));
    await user.click(await screen.findByRole("button", { name: "Set Up a Period" }));
    expect(navigate).toHaveBeenCalledWith("/more", {
      state: { open: "period" },
    });
  });

  it("uses term mode's vocabulary, as Home and Tracker do", async () => {
    await show({ period: null }, noWindow("term"));
    expect(
      await screen.findByText("No Allowance Term Set Up Yet")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set Up a Term" })).toBeInTheDocument();
  });
});

describe("with income logged", () => {
  it("shows the planners instead of an empty state", async () => {
    await show({ periodIncome: 1200, periodExpenses: 300 });
    expect(await screen.findByText(/What if I buy/i)).toBeInTheDocument();
    expect(screen.queryByText("Nothing Logged Yet")).not.toBeInTheDocument();
  });
});
