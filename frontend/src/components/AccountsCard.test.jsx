// The homepage account strip. The thing worth pinning is that it reconciles:
// per-account nets sum to income − spent, and subtracting the savings reserve
// gives the same "left to spend" the budget card is built from. Without the
// reserve line on screen those two look like they disagree.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-08-07",
}));

const fetchAccountTotals = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchAccountTotals: (...a) => fetchAccountTotals(...a),
}));

let mockHasAccounts = true;
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({ hasAccounts: mockHasAccounts }),
}));

import AccountsCard from "@/components/AccountsCard";

const payload = (over = {}) => ({
  period: { start: "2026-08-01", end: "2026-08-31", savings: 200 },
  accounts: [
    { id: "a1", name: "Trust", color: "#c26b6b", archived: false, net: 12 },
    { id: "a2", name: "DBS", color: "#7cb37c", archived: false, net: 340 },
  ],
  totals: { income: 800, spent: 448, net: 352, reserved: 200, leftToSpend: 152 },
  ...over,
});

/** The amount rendered on the row whose label matches. */
const amountFor = (label) =>
  screen.getByText(label).closest("li").lastElementChild.textContent;

beforeEach(() => {
  mockHasAccounts = true;
  fetchAccountTotals.mockReset().mockResolvedValue(payload());
});

describe("the account strip", () => {
  it("lists each account's share of the period", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(amountFor("Trust")).toBe("$12.00");
    expect(amountFor("DBS")).toBe("$340.00");
  });

  it("shows the reserve, so the total and left-to-spend reconcile", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());

    // 12 + 340 = 352, less the 200 reserve, leaves 152.
    expect(amountFor("Total")).toBe("$352.00");
    expect(amountFor("Reserved for savings")).toBe("−$200.00");
    expect(amountFor("Left to spend")).toBe("$152.00");
  });

  it("hides the reserve line when nothing is being set aside", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({
        totals: { income: 800, spent: 448, net: 352, reserved: 0, leftToSpend: 352 },
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());

    expect(screen.queryByText("Reserved for savings")).not.toBeInTheDocument();
  });

  it("shows a negative account plainly rather than flooring it at zero", async () => {
    // Spending from an account before any money reached it. Shouldn't normally
    // happen — you'd transfer first — but a back-dated entry can produce it,
    // and hiding it would hide a real gap in the data.
    fetchAccountTotals.mockResolvedValue(
      payload({
        accounts: [
          { id: "a1", name: "Trust", color: "#c26b6b", archived: false, net: -40 },
          { id: "a2", name: "DBS", color: "#7cb37c", archived: false, net: 392 },
        ],
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(amountFor("Trust")).toBe("−$40.00");
  });

  it("surfaces untagged entries instead of quietly losing them", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({ unassigned: { income: 0, spent: 12, net: -12 } })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Not assigned")).toBeInTheDocument());

    expect(amountFor("Not assigned")).toBe("−$12.00");
  });

  it("renders nothing until the user has made an account", () => {
    mockHasAccounts = false;
    const { container } = render(<AccountsCard />);
    expect(container).toBeEmptyDOMElement();
    expect(fetchAccountTotals).not.toHaveBeenCalled();
  });

  it("stays out of the way when no period is running", async () => {
    fetchAccountTotals.mockResolvedValue({
      period: null,
      accounts: [],
      totals: { income: 0, spent: 0, net: 0, reserved: 0, leftToSpend: 0 },
    });
    const { container } = render(<AccountsCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("costs the card, not the page, when the request fails", async () => {
    fetchAccountTotals.mockRejectedValue(new Error("nope"));
    const { container } = render(<AccountsCard />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says the figures are scoped to the period", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());
    expect(screen.getByText("Amount for this period.")).toBeInTheDocument();
  });
});
