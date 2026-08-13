// Where custom categories are managed, now that the entry sheet only creates
// them. The load-bearing behaviour is the delete: it is the one irreversible
// action here, and it used to be a single unguarded tap.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const addCategory = vi.fn();
const removeCategory = vi.fn();
let mockCustom = [];

vi.mock("@/hooks/useCategories", () => ({
  useCategories: () => ({
    custom: mockCustom,
    addCategory: (...args) => addCategory(...args),
    removeCategory: (...args) => removeCategory(...args),
  }),
}));
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));

import CategoriesSheet from "@/components/CategoriesSheet";

const show = () => {
  render(<CategoriesSheet open onClose={() => {}} />);
  return within(screen.getByRole("dialog"));
};

beforeEach(() => {
  mockCustom = [
    { id: "c1", name: "Gym", type: "expense", color: "#888" },
    { id: "c2", name: "Side gig", type: "income", color: "#999" },
  ];
  addCategory.mockReset().mockResolvedValue({ name: "Coffee" });
  removeCategory.mockReset().mockResolvedValue({});
});

describe("managing your own categories", () => {
  it("lists only your own, split by the type they belong to", () => {
    const sheet = show();

    // The built-ins aren't here: there is nothing you can do to them.
    expect(sheet.getByText("Gym")).toBeInTheDocument();
    expect(sheet.queryByText("F & B")).not.toBeInTheDocument();
    // Income categories are a separate set, as they are in the entry sheet.
    expect(sheet.queryByText("Side gig")).not.toBeInTheDocument();
  });

  it("switches to the income set", async () => {
    const user = userEvent.setup();
    const sheet = show();

    await user.click(sheet.getByRole("button", { name: "Income" }));

    expect(sheet.getByText("Side gig")).toBeInTheDocument();
    expect(sheet.queryByText("Gym")).not.toBeInTheDocument();
  });

  it("takes two taps to delete, and the first one is not it", async () => {
    const user = userEvent.setup();
    const sheet = show();

    await user.click(sheet.getByRole("button", { name: "Remove Gym" }));
    expect(removeCategory).not.toHaveBeenCalled();

    await user.click(sheet.getByRole("button", { name: "Confirm removing Gym" }));
    expect(removeCategory).toHaveBeenCalledWith("c1");
  });

  it("lets you back out of a delete you didn't mean", async () => {
    const user = userEvent.setup();
    const sheet = show();

    await user.click(sheet.getByRole("button", { name: "Remove Gym" }));
    await user.click(sheet.getByRole("button", { name: "Keep Gym" }));

    expect(removeCategory).not.toHaveBeenCalled();
    // Back to the resting state, ready to arm again.
    expect(sheet.getByRole("button", { name: "Remove Gym" })).toBeInTheDocument();
  });

  it("adds one against the type currently being managed", async () => {
    const user = userEvent.setup();
    const sheet = show();

    await user.click(sheet.getByRole("button", { name: "Income" }));
    await user.type(sheet.getByLabelText("Category name"), "Freelance");
    await user.click(sheet.getByRole("button", { name: "Add category" }));

    expect(addCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Freelance", type: "income" })
    );
  });

  it("says so plainly when you have none of your own", () => {
    mockCustom = [];
    const sheet = show();

    expect(sheet.getByText(/No categories of your own yet/)).toBeInTheDocument();
  });
});
