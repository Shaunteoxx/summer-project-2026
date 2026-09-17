// Restores ("saves") scale with the length of the budget window: 3 per 30 days,
// rounded, never fewer than one. These pin the allowance itself, then check the
// streak actually lets a user spend that many — in days, month and term mode —
// so the number on the card is the number they really have.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeStreak } from "../controllers/streakController.js";
import {
  MAX_PERIOD_DAYS,
  MIN_PERIOD_DAYS,
  addDaysYmd,
  periodEnd,
  savesForPeriod,
  termEnd,
} from "../lib/period.js";

const txn = (date, type, amount) => ({ date: `${date}T00:00:00.000Z`, type, amount });
const period = (start, length) => ({
  _id: start,
  start,
  end: periodEnd(start, length),
  length,
  savingsTarget: 0,
});

describe("savesForPeriod", () => {
  const table = [
    [1, 1],
    [7, 1],
    [14, 1], // 1.4
    [15, 2], // 1.5 rounds up
    [28, 3], // February
    [30, 3],
    [31, 3],
    [45, 5], // 4.5 rounds up
    [60, 6],
    [90, 9],
    [151, 15],
    [365, 37], // 36.5 rounds up
    [366, 37],
  ];
  for (const [days, saves] of table) {
    it(`gives a ${days}-day period ${saves}`, () => {
      assert.equal(savesForPeriod(days), saves);
    });
  }

  it("stays within half a save of 3-per-30-days for every allowed length", () => {
    for (let days = MIN_PERIOD_DAYS; days <= MAX_PERIOD_DAYS; days++) {
      const saves = savesForPeriod(days);
      const exact = (3 * days) / 30;
      assert.ok(saves >= 1, `${days} days got ${saves}`);
      // The floor of one is the only place it may exceed the proportional share.
      if (exact >= 0.5) {
        assert.ok(Math.abs(saves - exact) <= 0.5, `${days} days got ${saves}, exact ${exact}`);
      }
    }
  });

  it("never gives a longer period fewer saves than a shorter one", () => {
    for (let days = MIN_PERIOD_DAYS + 1; days <= MAX_PERIOD_DAYS; days++) {
      assert.ok(savesForPeriod(days) >= savesForPeriod(days - 1), `${days} days`);
    }
  });
});

/**
 * Overspend every day from `start` up to yesterday and keep accepting the
 * restore offer until there isn't one. Returns how many restores went through,
 * plus the first and last streak results so callers can check what was shown.
 */
function spendAllRestores({ start, today, income, config }) {
  const transactions = [txn(start, "income", income)];
  for (let d = start; d < today; d = addDaysYmd(d, 1)) {
    transactions.push(txn(d, "expense", income)); // far past any daily budget
  }
  const restored = [];
  const first = computeStreak(transactions, restored, today, config);
  let result = first;
  while (result.restore) {
    // What the card and the popup promise must agree before each spend.
    assert.equal(result.restore.savesLeft, result.savesLeftThisPeriod);
    restored.push(result.restore.date);
    result = computeStreak(transactions, restored, today, config);
    assert.ok(restored.length <= MAX_PERIOD_DAYS, "restore offer never ran out");
  }
  return { used: restored.length, first, last: result };
}

describe("a user can spend exactly the saves the period shows", () => {
  for (const length of [1, 7, 14, 15, 30, 45, 90, 151, 366]) {
    it(`days mode, ${length}-day period`, () => {
      const start = "2026-01-01";
      // Late enough in the period that every save has a broken day to repair.
      const today = addDaysYmd(start, Math.min(length - 1, savesForPeriod(length) + 2));
      const { used, first, last } = spendAllRestores({
        start,
        today,
        income: 1000,
        config: { mode: "days", periods: [period(start, length)] },
      });
      if (length === 1) {
        // Nothing before today to break, so nothing to restore — but the
        // allowance is still there.
        assert.equal(first.period.savesTotal, 1);
        assert.equal(used, 0);
        return;
      }
      assert.equal(first.period.savesTotal, savesForPeriod(length));
      assert.equal(first.savesLeftThisPeriod, savesForPeriod(length));
      assert.equal(used, savesForPeriod(length));
      assert.equal(last.savesLeftThisPeriod, 0);
    });
  }

  it("month mode: February gets the same 3 as a 31-day month", () => {
    for (const [start, today, days] of [
      ["2026-02-01", "2026-02-10", 28],
      ["2026-03-01", "2026-03-10", 31],
    ]) {
      const { used, first } = spendAllRestores({
        start,
        today,
        income: 1000,
        config: { mode: "month", savingsByMonth: {} },
      });
      assert.equal(first.period.days, days);
      assert.equal(first.period.savesTotal, 3);
      assert.equal(used, 3);
    }
  });

  it("term mode: a clipped first cycle gets a share for its own length", () => {
    // Starts on the 25th, so the first cycle is 25–30 Sep: 6 days -> 1 save.
    const t = { _id: "t1", start: "2026-09-25", end: termEnd("2026-09-25", 4), months: 4 };
    const config = { mode: "term", savingsByMonth: {}, terms: [t] };
    const { used, first } = spendAllRestores({
      start: "2026-09-25",
      today: "2026-09-29",
      income: 4000,
      config,
    });
    assert.equal(first.period.days, 6);
    assert.equal(first.period.savesTotal, 1);
    assert.equal(used, 1);

    // A full cycle of the same term gets the full-month allowance.
    const october = computeStreak([txn("2026-09-25", "income", 4000)], [], "2026-10-05", config);
    assert.equal(october.period.days, 31);
    assert.equal(october.period.savesTotal, 3);
  });

  it("keeps each period's saves separate", () => {
    // A 15-day period (2 saves) then a 45-day one (5): spending the first
    // period's saves leaves the second's untouched.
    const periods = [period("2026-01-01", 15), period("2026-01-16", 45)];
    const transactions = [
      txn("2026-01-01", "income", 1000),
      txn("2026-01-16", "income", 1000),
      txn("2026-01-14", "expense", 1000),
      txn("2026-01-15", "expense", 1000),
    ];
    const result = computeStreak(
      transactions,
      ["2026-01-15", "2026-01-14"],
      "2026-01-20",
      { mode: "days", periods }
    );
    assert.equal(result.period.savesTotal, 5);
    assert.equal(result.savesLeftThisPeriod, 5);
  });
});
