// Wording of the morning budget notification. It must say what the home
// screen's streak card says, from the same payload.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { morningBudgetMessage } from "../jobs/morningBudget.js";

const streak = (overrides = {}) => ({
  periodStatus: "active",
  hasIncome: true,
  overspentBy: 0,
  period: { daysLeft: 15 },
  today: { spent: 0, budget: 42.5, remaining: 42.5, within: true },
  ...overrides,
});
const logged = { mode: "month", loggedYesterday: true };

describe("morningBudgetMessage", () => {
  it("leads with what's left to spend today", () => {
    assert.deepEqual(morningBudgetMessage(streak(), logged), {
      type: "morningBudget",
      title: "$42.50 to spend today",
      body: "15 days left in this month.",
      url: "/",
      tag: "morning-budget",
    });
  });

  it("formats thousands and uses the period noun in days mode", () => {
    const message = morningBudgetMessage(
      streak({ period: { daysLeft: 1 }, today: { spent: 0, budget: 1234.5, remaining: 1234.5, within: true } }),
      { mode: "days", loggedYesterday: true }
    );
    assert.equal(message.title, "$1,234.50 to spend today");
    assert.equal(message.body, "1 day left in this period.");
  });

  it("reports the period overspend ahead of today's figure", () => {
    const message = morningBudgetMessage(streak({ overspentBy: 80 }), logged);
    assert.equal(message.title, "$80.00 past this month's budget");
  });

  it("reports today already over, e.g. after rent lands", () => {
    const message = morningBudgetMessage(
      streak({ today: { spent: 60, budget: 42.5, remaining: -17.5, within: false } }),
      logged
    );
    assert.equal(message.title, "$17.50 over today's budget");
  });

  it("asks for yesterday's spending when none was logged", () => {
    const message = morningBudgetMessage(streak(), { mode: "month", loggedYesterday: false });
    assert.equal(
      message.body,
      "15 days left in this month. Nothing was logged yesterday; add anything you spent and this will update."
    );
  });

  it("has nothing to say without an active, funded budget", () => {
    assert.equal(morningBudgetMessage(streak({ periodStatus: "inactive" }), logged), null);
    assert.equal(morningBudgetMessage(streak({ hasIncome: false }), logged), null);
  });
});
