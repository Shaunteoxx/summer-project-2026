// The dock. What's worth pinning is what the glass can't show in a test DOM:
// which tab it says you're on, and that the + is there on every page, since
// the dock's width is what keeps the tabs from moving under your finger.
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";

import BottomNav from "@/components/BottomNav";

function Where() {
  const { pathname, state } = useLocation();
  return (
    <p data-testid="where">
      {pathname}
      {state?.openAdd ? ` ${state.openAdd}` : ""}
    </p>
  );
}

const show = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <BottomNav />
      <Where />
    </MemoryRouter>
  );

const current = () =>
  screen
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.textContent);

describe("the tab bar", () => {
  it("lights the tab you're on, and only that one", () => {
    show("/transactions");
    expect(current()).toEqual(["Transactions"]);
  });

  it("lights Home only on Home itself", () => {
    show("/");
    expect(current()).toEqual(["Home"]);
  });

  it("keeps Tracker lit on History, its other face", () => {
    show("/stats");
    expect(current()).toEqual(["Tracker"]);
  });

  it("lights nothing on a page outside the four, rather than the wrong one", () => {
    show("/plan");
    expect(current()).toEqual([]);
  });
});

describe("the add button", () => {
  it.each(["/", "/transactions", "/tracker", "/plan", "/more", "/friends"])(
    "is in the dock on %s",
    (path) => {
      show(path);
      expect(screen.getByRole("button", { name: "Add a transaction" })).toBeInTheDocument();
    }
  );

  it("opens the add sheet on Expense, from a page that has no ledger", async () => {
    const user = userEvent.setup();
    show("/more");

    await user.click(screen.getByRole("button", { name: "Add a transaction" }));

    expect(screen.getByTestId("where")).toHaveTextContent("/transactions expense");
  });
});
