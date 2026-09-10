// MorePage is the app's most complex screen and had no test. These cover the
// page-level logic added recently that nothing else exercises: the budget-mode
// switch is a two-step commit (tapping a mode must not change it), sheets can be
// opened by name from another page via navigation state (and that state is
// consumed so a reload won't re-open them), and a sheet reached that way returns
// the reader to where they came from when it closes.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";

const navigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal()),
  useNavigate: () => navigate,
}));

const setPeriodMode = vi.fn(() => Promise.resolve());
vi.mock("@/api/endpoints", () => ({
  updateProfile: vi.fn(() => Promise.resolve()),
  deleteAccount: vi.fn(() => Promise.resolve()),
  setMonthlySavings: vi.fn(() => Promise.resolve()),
  setPeriodMode: (...a) => setPeriodMode(...a),
  startPeriod: vi.fn(() => Promise.resolve()),
  updatePeriod: vi.fn(() => Promise.resolve()),
  deletePeriod: vi.fn(() => Promise.resolve()),
  startTerm: vi.fn(() => Promise.resolve()),
  updateTerm: vi.fn(() => Promise.resolve()),
  deleteTerm: vi.fn(() => Promise.resolve()),
}));

const refresh = vi.fn(() => Promise.resolve());
const periodRefresh = vi.fn(() => Promise.resolve());
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { username: "shaun", savingsByMonth: {}, repeatSavings: false },
    refresh,
    logout: vi.fn(),
    clearSession: vi.fn(),
  }),
}));

let mockPeriod;
vi.mock("@/hooks/useBudgetPeriod", () => ({ useBudgetPeriod: () => mockPeriod }));
vi.mock("@/hooks/useTheme", () => ({
  useTheme: () => ({ isDark: true, setTheme: vi.fn() }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));
vi.mock("@/hooks/useAccounts", () => ({ useAccounts: () => ({ active: [] }) }));
vi.mock("@/hooks/useCategories", () => ({ useCategories: () => ({ custom: [] }) }));
vi.mock("@/hooks/useRecurring", () => ({
  useRecurring: () => ({
    rules: [],
    addRule: vi.fn(),
    updateRule: vi.fn(),
    removeRule: vi.fn(),
  }),
}));
// The account/category/recurring sheets have their own tests; stub them so this
// file exercises only MorePage's own logic.
vi.mock("@/components/AccountsSheet", () => ({ default: () => null }));
vi.mock("@/components/CategoriesSheet", () => ({ default: () => null }));
vi.mock("@/components/RecurringSheet", () => ({ default: () => null }));

import MorePage from "@/pages/MorePage";

const monthPeriod = () => ({
  mode: "month",
  noun: "month",
  status: "active",
  current: {
    id: "m",
    start: "2026-09-01",
    end: "2026-09-30",
    days: 30,
    daysLeft: 21,
    savings: 0,
    savesTotal: 3,
  },
  previous: null,
  history: [],
  term: null,
  refresh: periodRefresh,
});

const renderAt = (entry = "/more") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <MorePage />
    </MemoryRouter>
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockPeriod = monthPeriod();
});

describe("switching budget mode", () => {
  it("proposes on tap and only commits on an explicit confirm", async () => {
    const user = userEvent.setup();
    renderAt("/more");
    await user.click(screen.getByRole("button", { name: /Budget Period/ }));

    // Tapping a different mode must not change anything on its own — that was
    // the bug: one tap fired the PUT and re-scored the streak.
    await user.click(await screen.findByRole("button", { name: "Days" }));
    expect(setPeriodMode).not.toHaveBeenCalled();

    // A confirm step appears; confirming is what commits.
    await user.click(screen.getByRole("button", { name: "Switch" }));
    expect(setPeriodMode).toHaveBeenCalledWith("days");
  });

  it("drops the pending switch on cancel", async () => {
    const user = userEvent.setup();
    renderAt("/more");
    await user.click(screen.getByRole("button", { name: /Budget Period/ }));
    await user.click(await screen.findByRole("button", { name: "Days" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("button", { name: "Switch" })).not.toBeInTheDocument();
    expect(setPeriodMode).not.toHaveBeenCalled();
  });
});

describe("deep-linked sheets", () => {
  it("opens the sheet named in navigation state and consumes the state", async () => {
    renderAt({ pathname: "/more", state: { open: "period" } });

    expect(await screen.findByRole("dialog")).toHaveTextContent("Budget Period");
    // Consumed off the history entry so a reload won't silently re-open it.
    expect(navigate).toHaveBeenCalledWith("/more", { replace: true, state: null });
  });

  it("returns to the origin when a deep-linked sheet is closed", async () => {
    const user = userEvent.setup();
    renderAt({ pathname: "/more", state: { open: "period" } });
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    // navigate(-1) hands the reader back to the page whose CTA sent them here.
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(-1));
  });

  it("stays put when a sheet opened from the menu itself is closed", async () => {
    const user = userEvent.setup();
    renderAt("/more");
    await user.click(screen.getByRole("button", { name: /Budget Period/ }));
    await screen.findByRole("dialog");

    await user.click(screen.getByRole("button", { name: "Close dialog" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    // No deep link, so no auto-return.
    expect(navigate).not.toHaveBeenCalledWith(-1);
  });
});
