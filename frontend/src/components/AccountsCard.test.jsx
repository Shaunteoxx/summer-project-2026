// Account activity, on the Transactions page. Two things are worth pinning.
//
// First, In and Out are derived rather than served: the API reports income,
// spent and the two transfer directions separately, and the card folds them
// into two columns. Get that wrong and money silently vanishes from the card.
//
// Second, it still reconciles. Total In − Total Out − the savings reserve is
// the same "left to spend" the budget is built from — transfers cancel across
// accounts, so including them in the columns doesn't break the arithmetic.
//
// Third, the sentence under the Total is term mode's alone. Its job is to
// explain a "Total In $0.00" sitting above a month that still has money, which
// only happens when the money was banked in an earlier cycle. Everywhere else
// the columns need no explaining and Home already carries all three figures.
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
  period: { start: "2026-08-01", end: "2026-08-31", savings: 200, funding: null },
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

  it("totals what is on screen", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());

    expect(cellsFor("Total")).toEqual(["$800.00", "$448.00"]);
  });

  it("leaves the budget to Home when nothing needs reconciling", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Total")).toBeInTheDocument());

    // Total In is the income and Total Out the spending, so the columns speak
    // for themselves. The sentence that used to sit here restated the reserve
    // and left-to-spend, both of which Home already shows.
    expect(screen.queryByText(/for savings/)).not.toBeInTheDocument();
    expect(screen.queryByText(/left to spend/)).not.toBeInTheDocument();
    expect(screen.queryByText("$152.00")).not.toBeInTheDocument();
  });

  it("keeps untagged rows visible so the arithmetic still ties out", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({ unassigned: { income: 0, spent: 12, net: -12 } })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Not Assigned")).toBeInTheDocument());

    expect(cellsFor("Not Assigned")).toEqual(["—", "$12.00"]);
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

// Term mode: the cycle's money is a slice of a lump sum spread over several
// months. It must not become a row — in the month the money actually lands it
// is already sitting in an account, and a row would total it twice.
describe("a funded term cycle", () => {
  const funded = (over = {}) => ({
    period: { start: "2026-08-01", end: "2026-08-31", savings: 200, funding: 1000 },
    accounts: [
      account({ id: "a1", name: "Trust", spent: 448 }),
      account({ id: "a2", name: "DBS", color: "#1290CC" }),
    ],
    totals: { income: 0, spent: 448, funding: 1000, net: -448, reserved: 200, leftToSpend: 352 },
    ...over,
  });

  it("explains where the money came from", async () => {
    fetchAccountTotals.mockResolvedValue(funded());
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(screen.getByText(/of your allowance is this month's/)).toBeInTheDocument();
    expect(screen.getByText("$1,000.00")).toBeInTheDocument();
    expect(screen.getByText(/isn't in the In column/)).toBeInTheDocument();
  });

  it("states the whole subtraction, not two thirds of it", async () => {
    fetchAccountTotals.mockResolvedValue(funded());
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    // It used to narrate $1,000 less $200 and then announce $352, leaving the
    // reader to find the missing $448 in the Out column above.
    expect(
      screen.getByText(/Less \$200\.00 reserved and \$448\.00 spent/)
    ).toBeInTheDocument();
    expect(screen.getByText("$352.00")).toBeInTheDocument();
  });

  it("says how far past you are when the cycle is overspent", async () => {
    fetchAccountTotals.mockResolvedValue(
      funded({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 900 }),
          account({ id: "a2", name: "DBS", color: "#1290CC" }),
        ],
        totals: {
          income: 0,
          spent: 900,
          funding: 1000,
          net: -900,
          reserved: 200,
          leftToSpend: -100,
        },
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(screen.getByText(/past this month's budget/)).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
  });

  it("counts spending, not the Out column, when transfers moved money", async () => {
    // Out includes transfers between the user's own accounts. They cancel and
    // never touched the budget, so quoting the Out total here would announce a
    // subtraction that doesn't reach leftToSpend.
    fetchAccountTotals.mockResolvedValue(
      funded({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 448, transfersOut: 300 }),
          account({ id: "a2", name: "DBS", color: "#1290CC", transfersIn: 300 }),
        ],
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(cellsFor("Total")).toEqual(["$300.00", "$748.00"]);
    expect(screen.getByText(/and \$448\.00 spent/)).toBeInTheDocument();
  });

  it("keeps the Total equal to the account rows, not the allowance", async () => {
    fetchAccountTotals.mockResolvedValue(funded());
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    // Nothing came in through an account this month, so Total In is nil — the
    // allowance is explained underneath rather than counted as activity.
    expect(cellsFor("Total")).toEqual(["$0.00", "$448.00"]);
  });

  it("does not double-count the lump sum in the month it arrives", async () => {
    // Cycle one: the $6,000 really is in DBS, and $1,000 of it is this month's.
    fetchAccountTotals.mockResolvedValue(
      funded({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 448 }),
          account({ id: "a2", name: "DBS", color: "#1290CC", income: 6000 }),
        ],
        totals: {
          income: 6000, spent: 448, funding: 1000,
          net: 5552, reserved: 200, leftToSpend: 352,
        },
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    // $6,000, not $7,000.
    expect(cellsFor("Total")).toEqual(["$6,000.00", "$448.00"]);
  });

  it("doesn't claim the money arrived earlier in the month it arrived", async () => {
    // Cycle one is the exception: the lump sum is right there in the In
    // column, so "it isn't in the In column" would be a lie about a figure
    // the reader can see three rows above.
    fetchAccountTotals.mockResolvedValue(
      funded({
        accounts: [
          account({ id: "a1", name: "Trust", spent: 448 }),
          account({ id: "a2", name: "DBS", color: "#1290CC", income: 6000 }),
        ],
        totals: {
          income: 6000, spent: 448, funding: 1000,
          net: 5552, reserved: 200, leftToSpend: 352,
        },
      })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(
      screen.getByText(/of what came in is this month's share of your allowance/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/it arrived earlier/)).not.toBeInTheDocument();
    // The subtraction is the same either way.
    expect(
      screen.getByText(/Less \$200\.00 reserved and \$448\.00 spent/)
    ).toBeInTheDocument();
  });

  it("says nothing about an allowance outside term mode", async () => {
    fetchAccountTotals.mockResolvedValue(payload());
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());

    expect(screen.queryByText(/allowance/)).not.toBeInTheDocument();
  });
});

// The card is a set of sums over one window and used to name none of them.
describe("naming the window", () => {
  it("says which window the sums cover", async () => {
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());
    expect(screen.getByText("August 2026")).toBeInTheDocument();
  });

  it("names a part-month window by its dates", async () => {
    fetchAccountTotals.mockResolvedValue(
      payload({ period: { start: "2026-08-15", end: "2026-08-31", savings: 0, funding: null } })
    );
    render(<AccountsCard />);
    await waitFor(() => expect(screen.getByText("Trust")).toBeInTheDocument());
    expect(screen.getByText("15 – 31 Aug")).toBeInTheDocument();
  });
});
