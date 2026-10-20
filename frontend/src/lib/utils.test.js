// The money helpers every list and total on screen goes through. They mirror
// the server's lib/entryFields.js and lib/budget.js, so the two agree on what a
// shared bill costs and what money paid back past it brings in.
import { describe, it, expect } from "vitest";

import { countedAmount, extraPaidBack, rowAmount, sumEntries } from "@/lib/utils";

// A $12.80 dinner, as it might come back from friends.
const dinner = (paidBack) => ({ type: "expense", amount: 12.8, paidBack });

describe("countedAmount", () => {
  it("is the bill less what came back, never below zero", () => {
    expect(countedAmount(dinner(0))).toBe(12.8);
    expect(countedAmount(dinner(5.9))).toBeCloseTo(6.9);
    expect(countedAmount(dinner(12.8))).toBe(0);
    expect(countedAmount(dinner(20))).toBe(0);
  });
});

describe("extraPaidBack", () => {
  it("is only what came back past the bill", () => {
    expect(extraPaidBack(dinner(5.9))).toBe(0);
    expect(extraPaidBack(dinner(20))).toBeCloseTo(7.2);
  });

  it("is nothing on income", () => {
    expect(extraPaidBack({ type: "income", amount: 50, paidBack: 80 })).toBe(0);
  });
});

describe("rowAmount", () => {
  it("shows income and an over-repaid bill as gains, and a bill as its cost", () => {
    expect(rowAmount({ type: "income", amount: 1200 })).toEqual({ gain: true, value: 1200 });
    expect(rowAmount(dinner(20))).toEqual({ gain: true, value: expect.closeTo(7.2) });
    expect(rowAmount(dinner(5.9))).toEqual({ gain: false, value: expect.closeTo(6.9) });
  });
});

describe("sumEntries", () => {
  it("counts the extra on a bill as income", () => {
    const { income, spent } = sumEntries([
      { type: "income", amount: 500 },
      dinner(5.9),
      dinner(20),
    ]);
    expect(income).toBeCloseTo(507.2);
    expect(spent).toBeCloseTo(6.9);
  });
});
