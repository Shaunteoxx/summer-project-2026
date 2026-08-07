// The add-entry sheet's fast path. Typing is the slowest step in this form, so
// the description is optional and the sheet hands you from field to field —
// both are easy to break without noticing, because the form still *works*
// afterwards, it just costs more taps or saves a blank-looking row.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addTransaction = vi.fn();
const addCategory = vi.fn();

vi.mock("@/api/endpoints", () => ({
  fetchTransactions: () => Promise.resolve([]),
  addTransaction: (...args) => addTransaction(...args),
  removeTransaction: vi.fn(),
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { savingsByMonth: {} } }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));
vi.mock("@/hooks/useBudgetPeriod", () => ({
  useBudgetPeriod: () => ({ loading: false, mode: "month", current: null }),
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

import TransactionsPage from "@/pages/TransactionsPage";

/** Open the expense sheet and hand back its scope. */
const openExpenseSheet = async (user) => {
  render(<TransactionsPage />);
  await user.click(screen.getByRole("button", { name: /^Expense$/ }));
  return within(screen.getByRole("dialog"));
};

const submitted = () => addTransaction.mock.calls.at(-1)[0];

beforeEach(() => {
  coarse = true;
  addTransaction.mockReset().mockImplementation((payload) =>
    Promise.resolve({ ...payload, _id: "t1", date: `${payload.date}T00:00:00.000Z` })
  );
  addCategory.mockReset();
});

describe("optional description", () => {
  it("saves the category name when the description is left blank", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet(user);

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
    const sheet = await openExpenseSheet(user);

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
    const sheet = await openExpenseSheet(user);

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
    const sheet = await openExpenseSheet(user);

    await user.click(screen.getByRole("button", { name: "Add expense" }));
    expect(sheet.getByText("Choose a category.")).toBeInTheDocument();
    expect(addTransaction).not.toHaveBeenCalled();
  });
});

describe("moving between fields", () => {
  it("hands over to the description when a category is picked", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet(user);

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    expect(sheet.getByLabelText("Description")).toHaveFocus();
  });

  it("doesn't grab focus back when a category is corrected later on", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet(user);

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
    const sheet = await openExpenseSheet(user);

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice{Enter}");

    expect(screen.getByRole("button", { name: /^Use/ })).toBeInTheDocument();
    expect(addTransaction).not.toHaveBeenCalled();
  });

  it("moves to the amount field instead when there's a real keyboard", async () => {
    coarse = false;
    const user = userEvent.setup();
    const sheet = await openExpenseSheet(user);

    await user.click(sheet.getByRole("button", { name: /Food & Drinks/ }));
    await user.type(sheet.getByLabelText("Description"), "Chicken rice{Enter}");

    expect(sheet.getByLabelText("Amount")).toHaveFocus();
    expect(addTransaction).not.toHaveBeenCalled();
  });
});

describe("adding a category", () => {
  it("offers New on the label line rather than as a tile in the grid", async () => {
    const user = userEvent.setup();
    const sheet = await openExpenseSheet(user);

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
    const sheet = await openExpenseSheet(user);

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
