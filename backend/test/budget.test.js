// lib/budget.js is the one definition of a window's money that Home, the
// accounts card and the streak all report. These pin down its rules directly;
// the API suites check that the three screens agree.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { grossOf, leftToSpendOf, sumEntries } from "../lib/budget.js";

describe("sumEntries", () => {
  it("counts bills net of what came back, and anything past the bill as income", () => {
    const totals = sumEntries([
      { type: "income", amount: 500 },
      { type: "expense", amount: 12.8, paidBack: 5.9 },
      { type: "expense", amount: 30, paidBack: 30 },
      { type: "expense", amount: 10, paidBack: 16 },
    ]);
    assert.deepEqual(totals, { income: 506, spent: 6.9 });
  });

  it("is zero for nothing", () => {
    assert.deepEqual(sumEntries([]), { income: 0, spent: 0 });
  });
});

describe("grossOf", () => {
  it("is the income when there is no term", () => {
    assert.equal(grossOf({ income: 1200, funding: null }), 1200);
  });

  it("takes a term cycle's funding in place of its income, not on top", () => {
    // The lump sum landed this month: it's in the income and in the pot.
    assert.equal(grossOf({ income: 6000, funding: 1000 }), 1000);
    // A later month: nothing came in, but there is still money to spend.
    assert.equal(grossOf({ income: 0, funding: 1000 }), 1000);
  });
});

describe("leftToSpendOf", () => {
  it("takes the spending and the savings target off the window's money", () => {
    assert.equal(leftToSpendOf({ income: 1240, funding: null, spent: 287.4, savings: 300 }), 652.6);
  });

  it("goes negative once overspent", () => {
    assert.equal(leftToSpendOf({ income: 0, funding: 1000, spent: 900, savings: 200 }), -100);
  });

  it("rounds to the cent", () => {
    assert.equal(leftToSpendOf({ income: 0.3, funding: null, spent: 0.1, savings: 0 }), 0.2);
  });
});
