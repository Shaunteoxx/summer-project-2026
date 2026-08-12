// The add-entry sheet's fast path. Typing is the slowest step in this form, so
// the description is optional and the sheet hands you from field to field —
// both are easy to break without noticing, because the form still *works*
// afterwards, it just costs more taps or saves a blank-looking row.
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
  waitForElementToBeRemoved,
} from "@testing-library/react";
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

// Coarse pointer = phone, where the amount is a keypad button rather than a
// typeable field. Flipped per-test to cover both.
let coarse = true;
vi.mock("@/hooks/useCoarsePointer", () => ({ useCoarsePointer: () => coarse }));

vi.mock("@/hooks/useCategories", async () => {
  const { Tag } = await import("lucide-react");
  const cat = (name) => ({ name, type: "expense", color: "#888", icon: Tag });
  return {
    useCategories: () => ({
      categoriesByType: {
        expense: [cat("Food & Drinks"), cat("Transport")],
        income: [cat("Allowance")],
      },
      getCategory: (name) => cat(name),
      addCategory: (...args) => addCategory(...args),
      removeCategory: vi.fn(),
      custom: [],
    }),
  };
});

import { MemoryRouter } from "react-router-dom";

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

/** Open the expense sheet and hand back its scope. */
const openExpenseSheet = async () => {
  renderPage({ openAdd: "expense" });
  return within(await screen.findByRole("dialog"));
};

const submitted = () => addTransaction.mock.calls.at(-1)[0];

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
  coarse = true;
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

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.click(sheet.getByLabelText(/^Amount/));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /^Use/ }));
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(submitted()).toMatchObject({
      description: "Food & Drinks",
      category: "Food & Drinks",
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

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice");
    await user.click(sheet.getByLabelText(/^Amount/));
    await user.click(screen.getByRole("button", { name: "4" }));
    await user.click(screen.getByRole("button", { name: /^Use/ }));
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(submitted().description).toBe("Chicken rice");
  });

  it("still refuses a submit with no category", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(sheet.getByText("Choose a category.")).toBeInTheDocument();
    expect(addTransaction).not.toHaveBeenCalled();
  });
});

describe("moving between fields", () => {
  it("hands over to the description when a category is picked", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    expect(sheet.getByLabelText("Description")).toHaveFocus();
  });

  it("doesn't grab focus back when a category is corrected later on", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice");
    const transport = sheet.getByRole("button", { name: /Transport/ });
    await user.click(transport);

    // Picking the wrong tile first is common. Fixing it keeps what you typed,
    // and focus stays on the tile you just tapped rather than jumping back to
    // the description and re-raising the keyboard over a finished field.
    expect(sheet.getByLabelText("Description")).toHaveValue("Chicken rice");
    expect(transport).toHaveFocus();
  });

  it("opens the keypad from the description's return key on a phone", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice{Enter}");

    expect(screen.getByRole("button", { name: /^Use/ })).toBeInTheDocument();
    expect(addTransaction).not.toHaveBeenCalled();
  });

  it("moves to the amount field instead when there's a real keyboard", async () => {
    coarse = false;
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice{Enter}");

    expect(sheet.getByLabelText("Amount")).toHaveFocus();
    expect(addTransaction).not.toHaveBeenCalled();
  });
});

describe("adding a category", () => {
  it("offers New on the label line rather than as a tile in the grid", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    // As a tile it claimed a whole row whenever the category count was already
    // a multiple of three, which is what this guards against.
    const newButton = sheet.getByRole("button", { name: "New" });
    expect(newButton).toHaveAttribute("aria-expanded", "false");

    await user.click(newButton);
    expect(newButton).toHaveAttribute("aria-expanded", "true");
    expect(sheet.getByPlaceholderText("Category name")).toBeInTheDocument();
  });

  it("hands a newly created category over to the description too", async () => {
    addCategory.mockResolvedValue({ name: "Groceries", type: "expense", color: "#888" });
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: "New" }));
    await user.type(sheet.getByPlaceholderText("Category name"), "Groceries");
    await user.click(sheet.getByRole("button", { name: "Add category" }));

    expect(sheet.getByLabelText("Description")).toHaveFocus();
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

    expect(sheet.queryByText("Paid from")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Filter by account")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Move money between accounts/ })
    ).not.toBeInTheDocument();
  });

  it("sends the chosen account with the transaction", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("button", { name: /DBS/ }));
    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.click(sheet.getByLabelText(/^Amount/));
    await fillAmount(user);
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(submitted().accountId).toBe("a2");
  });

  it("preselects the first account so it costs no extra tap", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    expect(sheet.getByRole("button", { name: /Trust/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("asks where income landed rather than where it came from", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    // Arrive as the + button does — on Expense — then flip the sheet's own
    // toggle, which is the only route to income now the page buttons are gone.
    renderPage({ openAdd: "expense" });
    const sheet = within(await screen.findByRole("dialog"));
    expect(sheet.getByText("Paid from")).toBeInTheDocument();

    await user.click(sheet.getByRole("button", { name: "Income" }));

    expect(sheet.getByText("Paid into")).toBeInTheDocument();
    expect(sheet.queryByText("Paid from")).not.toBeInTheDocument();
  });

  // "offers the transfer action only with two accounts" moved to
  // AccountsCard.test.jsx — the button now lives in the Account activity card,
  // beside the accounts it moves between, and that card is stubbed out here.
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
    category: "Food & Drinks",
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
    // AnimatePresence keeps the row mounted through its exit animation, so
    // wait it out rather than asserting on the frame after the click.
    await waitForElementToBeRemoved(() => screen.queryByText("$50.00"));
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
    for (const label of ["All accounts", "Trust", "DBS", "Revolut", "Cash"]) {
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

    expect(accountButton()).toHaveAccessibleName("Filter by account");
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
    category: "Food & Drinks",
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
    user.click(screen.getByRole("button", { name: "Save changes" }));

  beforeEach(() => {
    // A real keyboard, so the amount is a typeable field rather than the keypad.
    coarse = false;
  });

  it("opens on the entry as it stands", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openEditor(user, { ...expense, accountId: "a2" });

    expect(screen.getByRole("dialog", { name: "Edit expense" })).toBeInTheDocument();
    expect(sheet.getByLabelText("Description")).toHaveValue("Lunch");
    expect(sheet.getByLabelText("Amount")).toHaveValue(12);
    expect(sheet.getByLabelText("Date")).toHaveValue("2026-08-05");
    expect(sheet.getByRole("button", { name: /Food & Drinks/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(sheet.getByRole("button", { name: /DBS/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("sends only the field that changed", async () => {
    const user = userEvent.setup();
    const sheet = await openEditor(user);

    await user.clear(sheet.getByLabelText("Amount"));
    await user.type(sheet.getByLabelText("Amount"), "8.5");
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
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
  });

  it("tags a row logged before accounts existed", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openEditor(user);

    // Nothing is preselected — an untagged row stays untagged unless you say
    // otherwise, or opening the editor would silently tag your whole history.
    expect(sheet.getByRole("button", { name: /Trust/ })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    await user.click(sheet.getByRole("button", { name: /DBS/ }));
    await save(user);

    expect(updateTransaction).toHaveBeenCalledWith("t1", { accountId: "a2" });
  });

  it("clears a tag out loud rather than by omission", async () => {
    mockAccounts = twoAccounts;
    const user = userEvent.setup();
    const sheet = await openEditor(user, { ...expense, accountId: "a2" });

    await user.click(sheet.getByRole("button", { name: /DBS/ }));
    await save(user);

    // Tapping the selected account deselects it. null, not undefined: an
    // absent key would leave the old tag in place.
    expect(updateTransaction).toHaveBeenCalledWith("t1", { accountId: null });
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
    expect(sheet.getByRole("button", { name: /Closed/ })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

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

    await user.clear(sheet.getByLabelText("Amount"));
    await user.type(sheet.getByLabelText("Amount"), "8.5");
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
    expect(screen.getByRole("dialog", { name: "Edit expense" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Close dialog" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    );
    // A fresh arrival is an add, with nothing carried over.
    const sheet = await openExpenseSheet();
    expect(screen.getByRole("dialog", { name: "New entry" })).toBeInTheDocument();
    expect(sheet.getByLabelText("Description")).toHaveValue("");
    expect(sheet.getByLabelText("Amount")).toHaveValue(null);
  });
});

// Setting an entry to repeat, from the moment you realise it does. The trap
// here is double-posting: the entry being saved is this month's, so the rule
// must never also fire for the same day.
describe("repeating an entry as you add it", () => {
  const fillExpense = async (user, sheet) => {
    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.type(sheet.getByLabelText("Description"), "Rent");
    await user.clear(sheet.getByLabelText("Amount"));
    await user.type(sheet.getByLabelText("Amount"), "850");
  };

  beforeEach(() => {
    coarse = false;
  });

  it("starts the rule after this entry, so the month isn't logged twice", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await fillExpense(user, sheet);
    fireEvent.change(sheet.getByLabelText("Date"), {
      target: { value: "2026-08-15" },
    });
    await user.click(sheet.getByRole("checkbox", { name: /Repeat monthly/ }));
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(addRule).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Rent",
        amount: 850,
        type: "expense",
        frequency: "monthly",
        dayOfMonth: 15,
        // The 16th, not the 15th: today's entry is already in the ledger.
        startKey: "2026-08-16",
      })
    );
  });

  it("says which day and which month before you commit to it", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    fireEvent.change(sheet.getByLabelText("Date"), {
      target: { value: "2026-08-15" },
    });
    await user.click(sheet.getByRole("checkbox", { name: /Repeat monthly/ }));

    expect(
      sheet.getByText("Adds this again on the 15th of each month, from September.")
    ).toBeInTheDocument();
  });

  it("warns about short months only when the day is late enough to shift", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await user.click(sheet.getByRole("checkbox", { name: /Repeat monthly/ }));
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
    await user.click(screen.getByRole("button", { name: "Add expense" }));

    expect(addTransaction).toHaveBeenCalled();
    expect(addRule).not.toHaveBeenCalled();
  });

  it("keeps the entry when the rule can't be saved", async () => {
    addRule.mockRejectedValue({ response: { data: { message: "nope" } } });
    const user = userEvent.setup();
    const sheet = await openExpenseSheet();

    await fillExpense(user, sheet);
    await user.click(sheet.getByRole("checkbox", { name: /Repeat monthly/ }));
    await user.click(screen.getByRole("button", { name: "Add expense" }));

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
        category: "Food & Drinks",
        description: "Lunch",
        accountId: null,
      },
    ];
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Edit Lunch" }));

    const sheet = within(screen.getByRole("dialog"));
    expect(sheet.queryByRole("checkbox", { name: /Repeat monthly/ })).not.toBeInTheDocument();
  });
});
