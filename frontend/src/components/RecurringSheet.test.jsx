// Repeating entries: the rules that write transactions on their own.
//
// The thing worth guarding here is that the sheet describes what the rule will
// actually do. A rule can't reach into the past and a monthly one shifts in
// short months, and both are invisible until an entry appears — or doesn't.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), show: vi.fn() }),
}));
vi.mock("@/hooks/useDemoGuard", () => ({ useDemoGuard: () => () => false }));

let mockAccounts = [];
vi.mock("@/hooks/useAccounts", () => ({
  useAccounts: () => ({
    active: mockAccounts.filter((a) => !a.archived),
    hasAccounts: mockAccounts.filter((a) => !a.archived).length > 0,
    getAccount: (id) => mockAccounts.find((a) => a.id === id),
  }),
}));

vi.mock("@/hooks/useCategories", async () => {
  const { Tag } = await import("lucide-react");
  const cat = (name, type) => ({ name, type, color: "#888", icon: Tag });
  return {
    useCategories: () => ({
      categoriesByType: {
        expense: [cat("Shopping", "expense"), cat("Transport", "expense")],
        income: [cat("Allowance", "income")],
      },
    }),
  };
});

import RecurringSheet, { describeSchedule } from "@/components/RecurringSheet";

const rent = {
  id: "r1",
  description: "Rent",
  amount: 800,
  type: "expense",
  category: "Shopping",
  accountId: null,
  frequency: "monthly",
  dayOfMonth: 1,
  weekday: null,
  startKey: "2026-08-11",
  lastRunKey: "2026-08-11",
  paused: false,
};

const onAdd = vi.fn();
const onUpdate = vi.fn();
const onRemove = vi.fn();

const show = (rules = []) =>
  render(
    <RecurringSheet
      open
      onClose={vi.fn()}
      rules={rules}
      onAdd={onAdd}
      onUpdate={onUpdate}
      onRemove={onRemove}
    />
  );

/** Open the "new entry" form and hand back the dialog scope. */
const startNew = async (user, rules = []) => {
  show(rules);
  await user.click(screen.getByRole("button", { name: /New Repeating Entry/ }));
  return within(screen.getByRole("dialog"));
};

beforeEach(() => {
  mockAccounts = [];
  onAdd.mockReset().mockResolvedValue({});
  onUpdate.mockReset().mockResolvedValue({});
  onRemove.mockReset().mockResolvedValue({});
});

describe("describing a schedule", () => {
  it("reads as a sentence rather than a data dump", () => {
    expect(describeSchedule(rent)).toBe("Monthly on the 1st");
    expect(describeSchedule({ ...rent, dayOfMonth: 2 })).toBe("Monthly on the 2nd");
    expect(describeSchedule({ ...rent, dayOfMonth: 3 })).toBe("Monthly on the 3rd");
    expect(describeSchedule({ ...rent, dayOfMonth: 11 })).toBe("Monthly on the 11th");
    expect(describeSchedule({ ...rent, dayOfMonth: 22 })).toBe("Monthly on the 22nd");
    expect(describeSchedule({ frequency: "weekly", weekday: 2 })).toBe(
      "Weekly on Tuesday"
    );
  });
});

describe("adding a rule", () => {
  it("sends the schedule the form describes", async () => {
    const user = userEvent.setup();
    const sheet = await startNew(user);

    await user.click(sheet.getByRole("button", { name: "Shopping" }));
    await user.clear(sheet.getByLabelText("Amount"));
    await user.type(sheet.getByLabelText("Amount"), "800");
    await user.clear(sheet.getByLabelText("Day of the Month"));
    await user.type(sheet.getByLabelText("Day of the Month"), "1");
    await user.click(sheet.getByRole("button", { name: "Add Repeating Entry" }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({
        description: "Shopping",
        amount: 800,
        type: "expense",
        category: "Shopping",
        frequency: "monthly",
        dayOfMonth: 1,
      })
    );
    // A monthly rule carries no weekday to be misread later.
    expect(onAdd.mock.calls[0][0]).not.toHaveProperty("weekday");
  });

  it("swaps the day picker when the rule goes weekly", async () => {
    const user = userEvent.setup();
    const sheet = await startNew(user);

    await user.click(sheet.getByRole("button", { name: "weekly" }));
    expect(sheet.queryByLabelText("Day of the Month")).not.toBeInTheDocument();

    await user.click(sheet.getByRole("button", { name: "Shopping" }));
    await user.type(sheet.getByLabelText("Amount"), "15");
    await user.click(
      within(sheet.getByRole("group", { name: "Day of the week" })).getByRole(
        "button",
        { name: "Tue" }
      )
    );
    await user.click(sheet.getByRole("button", { name: "Add Repeating Entry" }));

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: "weekly", weekday: 2 })
    );
    expect(onAdd.mock.calls[0][0]).not.toHaveProperty("dayOfMonth");
  });

  it("warns that a late day shifts in short months, before it happens", async () => {
    const user = userEvent.setup();
    const sheet = await startNew(user);

    expect(sheet.queryByText(/Shorter months/)).not.toBeInTheDocument();
    await user.clear(sheet.getByLabelText("Day of the Month"));
    await user.type(sheet.getByLabelText("Day of the Month"), "31");

    expect(sheet.getByText("Shorter months use their last day.")).toBeInTheDocument();
  });

  it("won't offer a start date in the past", async () => {
    const user = userEvent.setup();
    const sheet = await startNew(user);

    // The server refuses one anyway; the date field shouldn't let it be
    // picked in the first place.
    const today = new Date();
    const ymd = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(sheet.getByLabelText("Starting From")).toHaveAttribute("min", ymd);
  });

  it("refuses to save without a category or an amount", async () => {
    const user = userEvent.setup();
    const sheet = await startNew(user);

    await user.click(sheet.getByRole("button", { name: "Add Repeating Entry" }));

    expect(sheet.getByText("Choose a category.")).toBeInTheDocument();
    expect(sheet.getByText("Enter an amount greater than $0.")).toBeInTheDocument();
    expect(onAdd).not.toHaveBeenCalled();
  });

  it("offers income categories once the entry is income", async () => {
    const user = userEvent.setup();
    const sheet = await startNew(user);

    await user.click(sheet.getByRole("button", { name: "income" }));

    expect(sheet.getByRole("button", { name: "Allowance" })).toBeInTheDocument();
    expect(sheet.queryByRole("button", { name: "Shopping" })).not.toBeInTheDocument();
  });
});

describe("managing rules", () => {
  it("says what a rule will do without opening it", async () => {
    show([rent]);

    expect(screen.getByText(/Monthly on the 1st/)).toBeInTheDocument();
    expect(screen.getByText("−$800.00")).toBeInTheDocument();
  });

  it("leaves the start date alone when editing an existing rule", async () => {
    const user = userEvent.setup();
    show([rent]);

    await user.click(screen.getByRole("button", { name: "Edit Rent" }));
    const sheet = within(screen.getByRole("dialog"));

    // Moving a running rule's start backwards would be a back-fill by another
    // name, so it simply isn't offered.
    expect(sheet.queryByLabelText("Starting From")).not.toBeInTheDocument();
    expect(sheet.getByLabelText("Amount")).toHaveValue(800);

    await user.clear(sheet.getByLabelText("Amount"));
    await user.type(sheet.getByLabelText("Amount"), "950");
    await user.click(sheet.getByRole("button", { name: "Save Changes" }));

    expect(onUpdate).toHaveBeenCalledWith("r1", expect.objectContaining({ amount: 950 }));
    expect(onUpdate.mock.calls[0][1]).not.toHaveProperty("startKey");
  });

  it("pauses and resumes from the list", async () => {
    const user = userEvent.setup();
    show([rent]);

    await user.click(screen.getByRole("button", { name: "Pause Rent" }));
    expect(onUpdate).toHaveBeenCalledWith("r1", { paused: true });

    show([{ ...rent, paused: true }]);
    await user.click(screen.getAllByRole("button", { name: "Resume Rent" })[0]);
    expect(onUpdate).toHaveBeenLastCalledWith("r1", { paused: false });
  });

  it("asks before removing one", async () => {
    const user = userEvent.setup();
    show([rent]);

    await user.click(screen.getByRole("button", { name: "Remove Rent" }));
    expect(onRemove).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Confirm removing Rent" }));
    expect(onRemove).toHaveBeenCalledWith("r1");
  });

  it("says the history survives, since the accounts list refuses for the opposite reason", async () => {
    show([rent]);

    expect(
      screen.getByText(/entries it has already added stay in your ledger/i)
    ).toBeInTheDocument();
  });

  it("explains itself when there's nothing set up yet", async () => {
    show([]);

    expect(screen.getByText(/Rent, a subscription, an allowance/)).toBeInTheDocument();
  });
});
