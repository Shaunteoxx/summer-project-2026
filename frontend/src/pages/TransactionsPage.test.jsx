// The add-entry sheet's fast path. Typing is the slowest step in this form, so
// the description is optional and the amount, category, date and account are
// each one press — all easy to break without noticing, because the form still
// *works* afterwards, it just costs more taps or saves a blank-looking row.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addTransaction = vi.fn();
const updateTransaction = vi.fn();
const addCategory = vi.fn();

let mockTransactions = [];
let mockTransfers = [];
const removeTransfer = vi.fn();
vi.mock("@/api/endpoints", () => ({
  fetchTransactions: () => Promise.resolve(mockTransactions),
  addTransaction: (...args) => addTransaction(...args),
  updateTransaction: (...args) => updateTransaction(...args),
  removeTransaction: vi.fn(),
  fetchTransfers: () => Promise.resolve(mockTransfers),
  removeTransfer: (...args) => removeTransfer(...args),
  // Account activity sits above the list on this page. It has its own suite;
  // here it just needs to resolve, and with no accounts created it renders
  // nothing anyway.
  fetchAccountTotals: () => Promise.resolve({ period: null, accounts: [], totals: {} }),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { savingsByMonth: {} } }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));
// Accounts are opt-in: with none created, every piece of account UI hides and
// the form behaves exactly as it did before the feature. Overridden per-test
// below where the picker itself is under test.
let mockAccounts = [];
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({
    accounts: mockAccounts,
    active: mockAccounts.filter((a) => !a.archived),
    hasAccounts: mockAccounts.filter((a) => !a.archived).length > 0,
    getAccount: (id) => mockAccounts.find((a) => a.id === id),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    removeAccount: vi.fn(),
    defaultAccountId: () => mockAccounts.filter((a) => !a.archived)[0]?.id ?? "",
    rememberAccount: vi.fn(),
  }),
}));

const addRule = vi.fn();
vi.mock("@/hooks/useRecurring", () => ({
  useRecurring: () => ({
    rules: [],
    addRule: (...args) => addRule(...args),
    updateRule: vi.fn(),
    removeRule: vi.fn(),
  }),
}));

// A running period, so the ledger has a window and transfers get fetched.
// The object is hoisted, not rebuilt per call: `current` feeds a useCallback
// dependency, and a fresh identity each render would spin the load effect
// forever. The real provider keeps it in state, so it is stable there too.
const mockPeriod = {
  loading: false,
  mode: "month",
  noun: "month",
  current: { start: "2026-08-01", end: "2026-08-31", savings: 0 },
};
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => mockPeriod,
}));

// The entry sheet no longer branches on pointer type — the amount is the same
// keypad hero everywhere. The transfer sheet still reads this, so the mock
// stays; nothing here flips it.
vi.mock("@/hooks/useCoarsePointer", () => ({ useCoarsePointer: () => true }));

// The picker changes shape with the number of categories, and the delete list
// only exists once you have your own, so both are per-test knobs.
let mockExpenseCategories = ["F & B", "Transport"];
let mockCustom = [];
vi.mock("@/hooks/useCategories", async () => {
  const { Tag } = await import("lucide-react");
  const cat = (name) => ({ name, type: "expense", color: "#888", icon: Tag });
  return {
    useCategories: () => ({
      categoriesByType: {
        expense: mockExpenseCategories.map(cat),
        income: [cat("Allowance")],
      },
      getCategory: (name) => cat(name),
      addCategory: (...args) => addCategory(...args),
      removeCategory: vi.fn(),
      custom: mockCustom,
    }),
  };
});

import { MemoryRouter, useLocation } from "react-router-dom";

import TransactionsPage from "@/pages/TransactionsPage";

// The page reads router state so the app-shell add button can ask it to open
// the sheet. Rendering it bare would throw, so give it the Router it has in
// the real app. `initialEntries` lets a test arrive "via the + button".
const renderPage = (state) =>
  render(
    <MemoryRouter initialEntries={[{ pathname: "/transactions", state }]}>
      <TransactionsPage />
    </MemoryRouter>
  );

/** Reports the router state back to the test, so it can be asserted on. */
function LocationProbe({ onState }) {
  onState(useLocation().state);
  return null;
}

/** Open the expense sheet and hand back its scope. */
const openExpenseSheet = async () => {
  renderPage({ openAdd: "expense" });
  return within(await screen.findByRole("dialog"));
};

const submitted = () => addTransaction.mock.calls.at(-1)[0];

/**
 * Type an amount into the sheet.
 *
 * The amount is one control on every device now — the 44px hero opens the
 * keypad, and the keypad takes digits, operators and Enter from a hardware
 * keyboard, so there is no plain input left to type into on desktop.
 */
const enterAmount = async (user, sheet, keys) => {
  await user.click(sheet.getByLabelText(/^Amount/));
  for (const key of String(keys)) {
    await user.click(
      screen.getByRole("button", { name: key === "." ? "Decimal point" : key })
    );
  }
  await user.click(screen.getByRole("button", { name: /^Use/ }));
};

/** The account field in the entry sheet, which reads as its current value. */
const accountField = (sheet) =>
  sheet.getByRole("button", { name: /^Paid (from|into):/ });

/**
 * Open the entry sheet's account chips and tag the entry to one. Scoped to the
 * chip group: the field above it names the same account, so an unscoped query
 * matches both.
 */
const tagAccount = async (user, sheet, name) => {
  await user.click(accountField(sheet));
  const chips = within(sheet.getByRole("group", { name: /^Paid (from|into)$/ }));
  await user.click(chips.getByRole("button", { name }));
};

/** The account filter trigger, whose label changes with the selection. */
const accountButton = () =>
  screen.getByRole("button", { name: /^Filter(ing)? by/ });

/** Open the account filter sheet and choose one. */
const pickAccount = async (user, name) => {
  await user.click(accountButton());
  const sheet = within(screen.getByRole("dialog"));
  await user.click(sheet.getByRole("button", { name }));
};

beforeEach(() => {
  mockExpenseCategories = ["F & B", "Transport"];
  mockCustom = [];
  mockAccounts = [];
  mockTransactions = [];
  mockTransfers = [];
  removeTransfer.mockReset().mockResolvedValue({});
  addTransaction.mockReset().mockImplementation((payload) =>
    Promise.resolve({ ...payload, _id: "t1", date: `${payload.date}T00:00:00.000Z` })
  );
  // The API answers a PATCH with the whole row, not just the patch, so the
  // page can swap it straight into the ledger.
  updateTransaction.mockReset().mockImplementation((id, patch) =>
    Promise.resolve({ ...mockTransactions.find((t) => t._id === id), ...patch })
  );
  addCategory.mockReset();
  addRule.mockReset().mockResolvedValue({});
});

describe("optional description", () => {
  it("saves the category name when the description is left blank", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.click(sheet.getByLabelText(/^Amount/));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /^Use/ }));
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    expect(submitted()).toMatchObject({
      description: "F & B",
      category: "F & B",
      amount: 4,
    });
  });

  it("shows the fallback in the placeholder, so it isn't a surprise", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    expect(sheet.getByLabelText("Description")).toHaveAttribute(
      "placeholder",
      "e.g. Lunch"
    );
    await user.click(sheet.getByRole("button", { name: /Transport/ }));
    expect(sheet.getByLabelText("Description")).toHaveAttribute(
      "placeholder",
      "Transport"
    );
  });

  it("prefers what you typed over the fallback", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice");
    await user.click(sheet.getByLabelText(/^Amount/));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /^Use/ }));
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    expect(submitted().description).toBe("Chicken rice");
  });

  // The row you just saved is the one you most want to read back, and it used
  // to land mid-entrance — mounted at opacity 0 and left there, so the ledger
  // grew a row-shaped blank that only a reload filled in. Nothing about a new
  // row is animated now, so there is no frame in which it can be invisible.
  it("shows a new row's details the moment it lands", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice");
    await user.click(sheet.getByLabelText(/^Amount/));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /^Use/ }));
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    const row = await screen.findByRole("listitem");
    expect(within(row).getByText("Chicken rice")).toBeInTheDocument();
    expect(within(row).getByText("−$4.00")).toBeInTheDocument();
    // The entrance animation this guards against showed up here as an inline
    // `opacity: 0` that nothing ever cleared.
    expect(row.style.opacity).toBe("");
  });

  it("still refuses a submit with no category", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(screen.getByRole("button", { name: "Add Expense" }));
    expect(sheet.getByText("Choose a category.")).toBeInTheDocument();
    expect(addTransaction).not.toHaveBeenCalled();
  });
});

// The sheet used to drive focus down the form for you — category tap jumped to
// the description, the description's return key opened the keypad. Each jump
// saved a tap and cost a keyboard flying up over the sheet mid-scroll, which is
// what made adding an entry feel like a fight. Every field below is one press;
// the user makes those presses. What's left to protect is that nothing moves on
// its own, and that Enter still can't submit a half-filled form.
describe("moving between fields", () => {
  it("leaves focus alone when a category is picked", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    const food = sheet.getByRole("button", { name: /F & B/ });
    await user.click(food);

    expect(sheet.getByLabelText("Description")).not.toHaveFocus();
    expect(food).toHaveFocus();
  });

  it("keeps what you typed when a category is corrected later on", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice");
    const transport = sheet.getByRole("button", { name: /Transport/ });
    await user.click(transport);

    // Picking the wrong tile first is common. Fixing it keeps what you typed,
    // and focus stays on the tile you just tapped.
    expect(sheet.getByLabelText("Description")).toHaveValue("Chicken rice");
    expect(transport).toHaveFocus();
  });

  it("puts the keyboard away on the description's return key, and submits nothing", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice{Enter}");

    // Return must not fall through to the form's implicit submit: the amount
    // isn't filled in yet, so that would only ever bounce back with errors.
    expect(addTransaction).not.toHaveBeenCalled();
    expect(sheet.getByLabelText("Description")).not.toHaveFocus();
    // And it doesn't open the keypad for you either — that's the one button
    // sitting right there under Amount.
    expect(screen.queryByRole("button", { name: /^Use/ })).not.toBeInTheDocument();
  });

  it("does the same with a real keyboard, without jumping to the amount", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice{Enter}");

    expect(sheet.getByLabelText(/^Amount/)).not.toHaveFocus();
    expect(addTransaction).not.toHaveBeenCalled();
  });
});

// With nothing logged, the search box and the type filter are hidden — there
// is nothing to narrow — so the old copy's "add income or an expense above"
// pointed at controls that weren't on screen. The empty state carries the
// action itself now.
describe("an empty ledger", () => {
  it("offers the entry sheet from the empty state, without leaving the page", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nothing Logged Yet");

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add Your First Entry/ }));

    expect(await screen.findByRole("dialog", { name: "New Entry" })).toBeInTheDocument();
  });
});

describe("the page subtitle", () => {
  it("says the window is empty rather than leaving the tail off", async () => {
    renderPage();
    expect(await screen.findByText(/no entries yet/)).toBeInTheDocument();
    // The window itself stays: "nothing logged" means nothing logged in this
    // period, and in days mode that could be a fortnight.
    expect(screen.getByText(/August 2026/)).toBeInTheDocument();
  });

  it("counts them once there are any", async () => {
    mockTransactions = [
      {
        _id: "t1",
        date: "2026-08-05T00:00:00.000Z",
        type: "expense",
        amount: 12,
        category: "F & B",
        description: "Lunch",
      },
    ];
    renderPage();
    expect(await screen.findByText(/1 entry$/)).toBeInTheDocument();
  });
});

describe("adding a category", () => {
  // Six across, so twelve is two full rows. A third row is 81px the sheet
  // does not have on a short phone — with eight custom categories the old
  // grid pushed it to 1113px inside an 844px viewport, and the top ran off
  // the screen where nothing could scroll it back.
  describe("when there are more categories than the grid can hold", () => {
    const many = (n) => Array.from({ length: n }, (_, i) => `Category ${i + 1}`);

    it("keeps the grid at twelve", async () => {
      mockExpenseCategories = many(12);
      const sheet = await openExpenseSheet();

      expect(sheet.getByRole("button", { name: "Category 12" })).toBeInTheDocument();
      expect(
        sheet.queryByRole("button", { name: /Choose a category/ })
      ).not.toBeInTheDocument();
    });

    it("collapses to a field and a list at thirteen", async () => {
      mockExpenseCategories = many(13);
      const user = userEvent.setup();
      const sheet = await openExpenseSheet();

      // Nothing is on screen until you ask for it — that is the whole point.
      expect(sheet.queryByRole("button", { name: "Category 13" })).not.toBeInTheDocument();
      const field = sheet.getByRole("button", { name: /Choose a category/ });

      await user.click(field);
      await user.click(sheet.getByRole("button", { name: "Category 13" }));

      // The field reads back what was picked, and the list closes behind it.
      expect(sheet.getByRole("button", { name: /Category 13/ })).toBeInTheDocument();
      expect(sheet.queryByRole("button", { name: "Category 12" })).not.toBeInTheDocument();
    });

    it("still saves the category the list chose", async () => {
      mockExpenseCategories = many(13);
      const user = userEvent.setup();
      const sheet = await openExpenseSheet();

      await user.click(sheet.getByRole("button", { name: /Choose a category/ }));
      await user.click(sheet.getByRole("button", { name: "Category 7" }));
      await enterAmount(user, sheet, "4");
      await user.click(screen.getByRole("button", { name: "Add Expense" }));

      expect(submitted()).toMatchObject({ category: "Category 7" });
    });
  });

  it("offers New on the Category label line", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    // Not a tile in the grid: past twelve categories the grid becomes a list,
    // and a create affordance shaped like a category tile has nowhere to go.
    // On the label line it reads the same in both modes.
    const newButton = sheet.getByRole("button", { name: "New" });
    expect(newButton).toHaveAttribute("aria-expanded", "false");

    await user.click(newButton);
    expect(newButton).toHaveAttribute("aria-expanded", "true");
    expect(sheet.getByPlaceholderText("Category name")).toBeInTheDocument();
  });

  // Managing categories is a different job from using them, and it is not this
  // sheet's job at all. Deleting lives on More → Categories, beside Bank
  // accounts and Repeating entries. It briefly lived in this panel, which meant
  // pressing a button labelled "New" in order to remove something.
  it("creates categories but never deletes them", async () => {
    mockCustom = [{ id: "c1", name: "Gym", type: "expense", color: "#888" }];
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: "New" }));

    expect(sheet.getByPlaceholderText("Category name")).toBeInTheDocument();
    expect(sheet.queryByText("Your categories")).not.toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: "Remove Gym" })).not.toBeInTheDocument();
  });

  it("selects a newly created category, the same as tapping an existing tile", async () => {
    addCategory.mockResolvedValue({ name: "Groceries", type: "expense", color: "#888" });
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: "New" }));
    await user.type(sheet.getByPlaceholderText("Category name"), "Groceries");
    await user.click(sheet.getByRole("button", { name: "Create" }));

    // Selected, not merely created — you've just chosen a category either way.
    // The placeholder is what proves it: it becomes the name that will be
    // saved if the description is left blank.
    expect(sheet.getByLabelText("Description")).toHaveAttribute(
      "placeholder",
      "Groceries"
    );
  });
});

describe("tagging entries with an account", () => {
  const twoAccounts = [
    { id: "a1", name: "Trust", color: "#c26b6b", archived: false },
    { id: "a2", name: "DBS", color: "#7cb37c", archived: false },
  ];

  const fillAmount = async (user) => {
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /^Use/ }));
  };

  it("shows no account UI at all before you make one", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    expect(sheet.queryByRole("button", { name: /^Paid from:/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by Account")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Move money between accounts/ })
    ).not.toBeInTheDocument();
  });

  it("sends the chosen account with the transaction", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await tagAccount(user, sheet, /DBS/);
    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.click(sheet.getByLabelText(/^Amount/));
    await fillAmount(user);
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    expect(submitted().accountId).toBe("a2");
  });

  // The field reads as its value, so the preselection is visible without
  // opening anything — which is the whole point of remembering it.
  it("preselects the first account so it costs no extra tap", async () => {
    mockAccounts = twoAccounts;
    await openExpenseSheet();

    expect(accountField(screen)).toHaveAccessibleName(/Paid from: Trust/);
  });

  it("asks where income landed rather than where it came from", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    // Arrive as the + button does — on Expense — then flip the sheet's own
    // toggle, which is the only route to income now the page buttons are gone.
    renderPage({ openAdd: "expense" });
    const sheet = within(await screen.findByRole("dialog"));
    expect(accountField(sheet)).toHaveAccessibleName(/^Paid from:/);

    await user.click(sheet.getByRole("button", { name: "Income" }));

    expect(accountField(sheet)).toHaveAccessibleName(/^Paid into:/);
  });

  // "offers the transfer action only with two accounts" moved to
  // AccountsCard.test.jsx — the button now lives in the Account activity card,
  // beside the accounts it moves between, and that card is stubbed out here.

  // Router state lives in history.state, which survives a reload. Left in
  // place, the request the + button wrote there is re-read on every refresh of
  // /transactions and the sheet opens again over the ledger, hours after the
  // tap that asked for it.
  it("consumes the open-add request, so a refresh doesn't reopen the sheet", async () => {
    let state;
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/transactions", state: { openAdd: "expense" } }]}
      >
        <TransactionsPage />
        <LocationProbe onState={(s) => (state = s)} />
      </MemoryRouter>
    );

    await screen.findByRole("dialog");
    expect(state).toBeNull();
  });
});

describe("transfers in the ledger", () => {
  const twoAccounts = [
    { id: "a1", name: "Trust", color: "#c26b6b", archived: false },
    { id: "a2", name: "DBS", color: "#7cb37c", archived: false },
  ];
  const expense = {
    _id: "t1",
    date: "2026-08-05T00:00:00.000Z",
    type: "expense",
    amount: 12,
    category: "F & B",
    description: "Lunch",
    accountId: "a1",
  };
  const move = {
    _id: "m1",
    date: "2026-08-06T00:00:00.000Z",
    from: "a2",
    to: "a1",
    amount: 50,
  };

  const show = async () => {
    renderPage();
    return screen.findByText("Lunch");
  };

  it("leaves a record of the move rather than swallowing it", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    mockTransfers = [move];
    await show();

    expect(screen.getByText(/DBS/, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText("$50.00")).toBeInTheDocument();
  });

  it("signs it neither way, because it moved no money in or out", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    mockTransfers = [move];
    await show();

    // The expense is signed; the transfer deliberately isn't. Each day now
    // carries its own net in the group header, so an amount string can appear
    // twice on the page — scope the signed check to the entry rows.
    const rows = screen.getAllByRole("listitem");
    expect(rows.some((r) => within(r).queryByText(/^−\$12\.00$/))).toBe(true);
    expect(screen.getByText("$50.00")).toBeInTheDocument();
  });

  it("hides transfers under the Expenses and Income filters", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    mockTransfers = [move];
    const user = userEvent.setup();
    await show();

    expect(screen.getByText("$50.00")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("group", { name: "Filter by type" })).getByRole(
        "button",
        { name: "Expenses" }
      )
    );
    expect(screen.queryByText("$50.00")).not.toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  // The transfer is the only entry on 6 Aug, so narrowing past it has to take
  // its date header with it. The presence boundary used to sit around the days
  // rather than inside them, which kept a filtered-out day mounted for as long
  // as its rows took to fade — every keystroke of a search left a row of
  // headers with nothing under them.
  it("takes the day header with it when a day stops matching", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    mockTransfers = [move];
    const user = userEvent.setup();
    await show();

    expect(screen.getByText("6 Aug")).toBeInTheDocument();
    await user.type(
      screen.getByRole("searchbox", { name: "Search transactions" }),
      "Lunch"
    );

    expect(screen.queryByText("6 Aug")).not.toBeInTheDocument();
    expect(screen.getByText("5 Aug")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("keeps a transfer visible from either account's filter", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [];
    mockTransfers = [move];
    const user = userEvent.setup();
    renderPage();
    await screen.findByText("$50.00");

    // The money left DBS and arrived in Trust, so it belongs to both.
    await pickAccount(user, "Trust");
    expect(screen.getByText("$50.00")).toBeInTheDocument();
    await pickAccount(user, "DBS");
    expect(screen.getByText("$50.00")).toBeInTheDocument();
  });

  it("deletes one and puts it back if the server refuses", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    mockTransfers = [move];
    removeTransfer.mockRejectedValue(new Error("nope"));
    const user = userEvent.setup();
    await show();

    await user.click(screen.getByRole("button", { name: /Delete transfer of/ }));
    expect(removeTransfer).toHaveBeenCalledWith("m1");
    expect(await screen.findByText("$50.00")).toBeInTheDocument();
  });

  it("keeps every type filter on screen without scrolling", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    await show();

    // Scoped to the group: "Income" is also the name of the add button above.
    const group = screen.getByRole("group", { name: "Filter by type" });
    for (const label of ["All", "Expenses", "Income"]) {
      expect(within(group).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("lists every account at once in the picker, however many there are", async () => {
    // Four accounts is where a chip row starts scrolling and the later ones
    // become invisible. A sheet shows all of them whatever the count.
    mockAccounts = [
      ...twoAccounts,
      { id: "a3", name: "Revolut", color: "#8a93a6", archived: false },
      { id: "a4", name: "Cash", color: "#9ca85b", archived: false },
    ];
    mockTransactions = [expense];
    const user = userEvent.setup();
    await show();

    await user.click(accountButton());
    const sheet = within(screen.getByRole("dialog"));
    for (const label of ["All Accounts", "Trust", "DBS", "Revolut", "Cash"]) {
      expect(sheet.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("keeps deleting a deliberate button of its own, not a tap on the row", async () => {
    // The row opens the editor, so delete has to stay separate — one stray tap
    // must never be able to destroy an entry.
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    await show();

    expect(screen.getByRole("button", { name: "Edit Lunch" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete Lunch" })).toBeInTheDocument();
  });

  it("shows which account is being filtered on the button itself", async () => {
    mockAccounts = twoAccounts;
    mockTransactions = [expense];
    const user = userEvent.setup();
    await show();

    expect(accountButton()).toHaveAccessibleName("Filter by Account");
    await pickAccount(user, "DBS");
    expect(accountButton()).toHaveAccessibleName(/Filtering by DBS/);
  });
});

// Correcting an entry, rather than deleting and retyping it. The sheet is the
// same one used for adding, so the risk isn't that editing fails loudly — it's
// that opening the editor quietly rewrites fields nobody touched.
describe("editing an entry", () => {
  const twoAccounts = [
    { id: "a1", name: "Trust", color: "#c26b6b", archived: false },
    { id: "a2", name: "DBS", color: "#7cb37c", archived: false },
  ];
  const expense = {
    _id: "t1",
    date: "2026-08-05T00:00:00.000Z",
    type: "expense",
    amount: 12,
    category: "F & B",
    description: "Lunch",
    accountId: null,
  };

  /** Tap the row and hand back the editor's scope. */
  const openEditor = async (user, row = expense) => {
    mockTransactions = [row];
    renderPage();
    await user.click(
      await screen.findByRole("button", { name: `Edit ${row.description}` })
    );
    return within(screen.getByRole("dialog"));
  };

  const save = (user) =>
    user.click(screen.getByRole("button", { name: "Save Changes" }));

  it("opens on the entry as it stands", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openEditor(user, { ...expense, accountId: "a2" });

    expect(screen.getByRole("dialog", { name: "Edit Expense" })).toBeInTheDocument();
    expect(sheet.getByLabelText("Description")).toHaveValue("Lunch");
    // The hero reads the figure back signed, the way the ledger row will.
    expect(sheet.getByLabelText(/^Amount/)).toHaveTextContent("−$12.00");
    expect(sheet.getByLabelText("Date")).toHaveValue("2026-08-05");
    expect(sheet.getByRole("button", { name: /F & B/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(accountField(sheet)).toHaveAccessibleName(/Paid from: DBS/);
  });

  it("sends only the field that changed", async () => {
    const user = userEvent.setup();
    const sheet = await openEditor(user);

    await enterAmount(user, sheet, "8.5");
    await save(user);

    // Exact, not a subset: an edit that resends untouched fields is an edit
    // that can overwrite them with a stale copy.
    expect(updateTransaction).toHaveBeenCalledWith("t1", { amount: 8.5 });
  });

  it("costs no request at all when nothing was touched", async () => {
    const user = userEvent.setup();
    await openEditor(user);

    await save(user);

    expect(updateTransaction).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
  });

  it("tags a row logged before accounts existed", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openEditor(user);

    // Nothing is preselected — an untagged row stays untagged unless you say
    // otherwise, or opening the editor would silently tag your whole history.
    expect(accountField(sheet)).toHaveAccessibleName(/Paid from: no account/);

    await tagAccount(user, sheet, /DBS/);
    await save(user);

    expect(updateTransaction).toHaveBeenCalledWith("t1", { accountId: "a2" });
  });

  it("clears a tag out loud rather than by omission", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openEditor(user, { ...expense, accountId: "a2" });

    await tagAccount(user, sheet, /DBS/);
    await save(user);

    // Tapping the selected account deselects it. null, not undefined: an
    // absent key would leave the old tag in place.
    expect(updateTransaction).toHaveBeenCalledWith("t1", { accountId: null });
  });

  // The Categories sheet promises that entries filed under a deleted category
  // keep their label, and the ledger honours it. The editor used to contradict
  // it: the name was gone from the picker, so the row read as uncategorised.
  it("still shows a category you've since deleted", async () => {
    mockExpenseCategories = ["F & B", "Transport"];
    const user = userEvent.setup();
    const sheet = await openEditor(user, { ...expense, category: "Gym" });

    expect(sheet.getByRole("button", { name: "Gym" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    // And leaving it alone still sends nothing about it.
    await user.clear(sheet.getByLabelText("Description"));
    await user.type(sheet.getByLabelText("Description"), "Dinner");
    await save(user);
    expect(updateTransaction).toHaveBeenCalledWith("t1", { description: "Dinner" });
  });

  it("still shows a tag pointing at an account you've since archived", async () => {
    mockAccounts = [
      twoAccounts[0],
      { id: "a9", name: "Closed", color: "#8a93a6", archived: true },
    ];
    const user = userEvent.setup();
    const sheet = await openEditor(user, { ...expense, accountId: "a9" });

    // It can't be chosen for anything new, but the row is tagged to it and
    // hiding that would read as untagged.
    expect(accountField(sheet)).toHaveAccessibleName(/Paid from: Closed/);

    await user.clear(sheet.getByLabelText("Description"));
    await user.type(sheet.getByLabelText("Description"), "Dinner");
    await save(user);

    expect(updateTransaction).toHaveBeenCalledWith("t1", { description: "Dinner" });
  });

  it("drops the row from the ledger when it's re-dated out of the period", async () => {
    const user = userEvent.setup();
    const sheet = await openEditor(user);

    fireEvent.change(sheet.getByLabelText("Date"), {
      target: { value: "2026-07-20" },
    });
    await save(user);

    expect(updateTransaction).toHaveBeenCalledWith("t1", { date: "2026-07-20" });
    // The ledger lists one period. Leaving the row on screen under a period it
    // no longer belongs to would be a lie about where the money went.
    await waitFor(() => expect(screen.queryByText("Lunch")).not.toBeInTheDocument());
  });

  it("shows the corrected figures without a reload", async () => {
    const user = userEvent.setup();
    const sheet = await openEditor(user);

    await enterAmount(user, sheet, "8.5");
    await save(user);

    // The row and its day header both carry the corrected figure now.
    await screen.findAllByText(/^−\$8\.50$/);
    const rows = screen.getAllByRole("listitem");
    expect(rows.some((r) => within(r).queryByText(/^−\$8\.50$/))).toBe(true);
    // The balance summary above the ledger reads from the same list.
    expect(screen.getByText("Lunch")).toBeInTheDocument();
  });

  it("lets go of the row it was editing when the sheet closes", async () => {
    // The page used to carry its own Expense button, so this checked that
    // pressing it after an edit gave a blank form rather than the last row.
    // Adding now starts from the app-shell button, so what's left to pin is
    // the half that lives here: closing must drop `editing`, or the next open
    // would inherit it.
    const user = userEvent.setup();
    await openEditor(user);
    expect(screen.getByRole("dialog", { name: "Edit Expense" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    // A fresh arrival is an add, with nothing carried over.
    const sheet = await openExpenseSheet();
    expect(screen.getByRole("dialog", { name: "New Entry" })).toBeInTheDocument();
    expect(sheet.getByLabelText("Description")).toHaveValue("");
    // The hero shows an unset amount as a muted $0.00, with no sign on it.
    expect(sheet.getByLabelText(/^Amount/)).toHaveTextContent(/^\$0\.00$/);
  });
});

// Setting an entry to repeat, from the moment you realise it does. The trap
// here is double-posting: the entry being saved is this month's, so the rule
// must never also fire for the same day.
describe("repeating an entry as you add it", () => {
  const fillExpense = async (user, sheet) => {
    await user.click(sheet.getByRole("button", { name: /F & B/ }));
    await user.type(sheet.getByLabelText("Description"), "Rent");
    await enterAmount(user, sheet, "850");
  };

  // Dated from today rather than a fixed calendar date. This used to pin
  // "2026-08-15" against an expected start of "2026-08-16", which only held
  // while the suite ran on or before the 16th — after that `repeatPlan` clamps
  // the start to today (a rule can't reach into days already lived through)
  // and the assertion failed for reasons that had nothing to do with the code.
  it("starts the rule after this entry, so the month isn't logged twice", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    const ymd = (d) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
        d.getDate()
      ).padStart(2, "0")}`;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    await fillExpense(user, sheet);
    fireEvent.change(sheet.getByLabelText("Date"), {
      target: { value: ymd(today) },
    });
    await user.click(sheet.getByRole("switch", { name: /Repeat Monthly/ }));
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    expect(addRule).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Rent",
        amount: 850,
        type: "expense",
        frequency: "monthly",
        dayOfMonth: today.getDate(),
        // Tomorrow, not today: today's entry is already in the ledger, and a
        // rule that also fired today would post it twice.
        startKey: ymd(tomorrow),
      })
    );
  });

  it("says which day and which month before you commit to it", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    fireEvent.change(sheet.getByLabelText("Date"), {
      target: { value: "2026-08-15" },
    });
    await user.click(sheet.getByRole("switch", { name: /Repeat Monthly/ }));

    expect(
      sheet.getByText("Adds this again on the 15th of each month, from September.")
    ).toBeInTheDocument();
  });

  it("warns about short months only when the day is late enough to shift", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("switch", { name: /Repeat Monthly/ }));
    fireEvent.change(sheet.getByLabelText("Date"), {
      target: { value: "2026-08-15" },
    });
    expect(sheet.queryByText(/Shorter months/)).not.toBeInTheDocument();

    fireEvent.change(sheet.getByLabelText("Date"), {
      target: { value: "2026-08-31" },
    });
    expect(sheet.getByText(/Shorter months use their last day/)).toBeInTheDocument();
  });

  it("adds the entry and nothing else when the box is left alone", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await fillExpense(user, sheet);
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    expect(addTransaction).toHaveBeenCalled();
    expect(addRule).not.toHaveBeenCalled();
  });

  it("keeps the entry when the rule can't be saved", async () => {
    addRule.mockRejectedValue({ response: { data: { message: "nope" } } });
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await fillExpense(user, sheet);
    await user.click(sheet.getByRole("switch", { name: /Repeat Monthly/ }));
    await user.click(screen.getByRole("button", { name: "Add Expense" }));

    // The expense was what was asked for; the repeat was a convenience on top.
    expect(addTransaction).toHaveBeenCalled();
    expect(await screen.findByText("Rent")).toBeInTheDocument();
  });

  it("isn't offered when correcting an entry that has already happened", async () => {
    mockTransactions = [
      {
        _id: "t1",
        date: "2026-08-05T00:00:00.000Z",
        type: "expense",
        amount: 12,
        category: "F & B",
        description: "Lunch",
        accountId: null,
      },
    ];
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Lunch" }));

    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.queryByRole("switch", { name: /Repeat Monthly/ })).not.toBeInTheDocument();
  });
});
