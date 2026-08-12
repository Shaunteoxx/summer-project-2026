// Account activity, on the Transactions page. Two things are worth pinning.
//
// First, In and Out are derived rather than served: the API reports income,
// spent and the two transfer directions separately, and the card folds them
// into two columns. Get that wrong and money silently vanishes from the card.
//
// Second, it still reconciles. Total In − Total Out − the savings reserve is
// the same "left to spend" the budget is built from — transfers cancel across
// accounts, so including them in the columns doesn't break the arithmetic.
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

const account = (over = {}) => ({
  id: "a1",
  name: "Trust",
  color: "#CC624E",
  archived: false,
  income: 0,
  spent: 0,
  transfersIn: 0,
  transfersOut: 0,
  ...over,
});

const payload = (over = {}) => ({
  period: { start: "2026-08-01", end: "2026-08-31", savings: 200 },
  accounts: [
    account({ id: "a1", name: "Trust", spent: 448 }),
    account({ id: "a2", name: "DBS", color: "#1290CC", income: 800 }),
  ],
  totals: { income: 800, spent: 448, net: 352, reserved: 200, leftToSpend: 152 },
  ...over,
});

/** The [in, out] cells of the row whose label matches. */
const cellsFor = (label) => {
  const row = screen.getByText(label).closest("li, div");
  const kids = [...row.children];
  return kids.slice(-2).map((n) => n.textContent);
};

beforeEach(() => {
  mockHasAccounts = true;
  fetchAccountTotals.mockReset().mockResolvedValue(payload());
});

describe("account activity", () => {
  it("splits each account into what came in and what went out", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(cellsFor("Trust")).toEqual(["—", "$448.00"]);
    expect(cellsFor("DBS")).toEqual(["$800.00", "—"]);
  });

  it("shows an em-dash, not $0.00, where a direction is unused", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    // A column of zeroes reads as data; a column of dashes reads as
    // "not applicable", which is what it is.
    expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  });

  it("folds transfers into the columns they moved through", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 448, transfersIn: 400 }),
          account({ id: "a2", name: "DBS", income: 800, transfersOut: 400 }),
        ],
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(cellsFor("Trust")).toEqual(["$400.00", "$448.00"]);
    expect(cellsFor("DBS")).toEqual(["$800.00", "$400.00"]);
    // Transfers cancel, so the totals are unmoved by them.
    expect(cellsFor("Total")).toEqual(["$1,200.00", "$848.00"]);
  });

  it("totals what is on screen, and reconciles to left-to-spend", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());

    expect(cellsFor("Total")).toEqual(["$800.00", "$448.00"]);
    // 800 − 448 = 352, less the 200 reserve, leaves 152.
    expect(screen.getByText(/Less \$200\.00 reserved for savings/)).toBeInTheDocument();
    expect(screen.getByText("$152.00")).toBeInTheDocument();
  });

  it("says how far past you are when the period is overspent", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 700 }),
          account({ id: "a2", name: "DBS", income: 800 }),
        ],
        totals: { income: 800, spent: 700, net: 100, reserved: 200, leftToSpend: -100 },
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());

    expect(screen.getByText(/past this period's budget/)).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  it("keeps untagged rows visible so the arithmetic still ties out", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({ unassigned: { income: 0, spent: 12, net: -12 } })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Not assigned")).toBeInTheDocument());

    expect(cellsFor("Not assigned")).toEqual(["—", "$12.00"]);
    expect(cellsFor("Total")).toEqual(["$800.00", "$460.00"]);
  });

  it("drops an archived account once nothing moved through it", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 448 }),
          account({ id: "a2", name: "Old card", archived: true }),
        ],
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(screen.queryByText("Old card")).not.toBeInTheDocument();
  });

  it("keeps an archived account that still has movement in the period", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 448 }),
          account({ id: "a2", name: "Old card", archived: true, spent: 30 }),
        ],
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Old card")).toBeInTheDocument());
  });

  it("offers a transfer only when there is somewhere to transfer to", async () => {
    // The page decides: it passes a handler only with two or more accounts,
    // since moving money to yourself isn't a thing.
    const { unmount } = render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Transfer" })).not.toBeInTheDocument();
    unmount();

    render(<AccountsCard onTransfer={() => {}} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Transfer" })).toBeInTheDocument()
    );
  });

  it("renders nothing at all until the user has made an account", async () => {
    mockHasAccounts = false;
    const { container } = render(<AccountsCard />);

    expect(container).toBeEmptyDOMElement();
    expect(fetchAccountTotals).not.toHaveBeenCalled();
  });

  it("stays out of the way between periods in days mode", async () => {
    fetchAccountTotals.mockResolvedValue({ period: null, accounts: [], totals: {} });
    const { container } = render(<AccountsCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("costs itself, not the page, when the request fails", async () => {
    fetchAccountTotals.mockRejectedValue(new Error("nope"));
    const { container } = render(<AccountsCard />);

    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });
});
