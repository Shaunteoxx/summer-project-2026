// Streak + daily budget across budget periods.
//
// The most important test here is the equivalence suite: month mode must
// produce byte-identical results to the pre-periods implementation, which is
// kept verbatim in fixtures/legacyStreak.js. Everything else covers days mode
// and the untracked gaps only it can produce.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeStreak } from "../controllers/streakController.js";
import { computeStreak as legacyComputeStreak } from "./fixtures/legacyStreak.js";
import { periodEnd } from "../lib/period.js";

const txn = (date, type, amount) => ({ date: `${date}T00:00:00.000Z`, type, amount });
const period = (start, length, savingsTarget = 0) => ({
  _id: start,
  start,
  end: periodEnd(start, length),
  length,
  savingsTarget,
});
const daysMode = (periods) => ({ mode: "days", periods });

/** Legacy shape -> current shape, so the two can be compared field by field. */
const rename = (legacy) => {
  const { monthlySavings, savesLeftThisMonth, monthDays, ...rest } = legacy;
  return {
    ...rest,
    periodSavings: monthlySavings,
    savesLeftThisPeriod: savesLeftThisMonth,
    periodDays: monthDays,
  };
};

/** Drop the fields that only exist post-periods before comparing. */
const comparable = (current) => {
  const { period: _p, periodStatus: _s, overspentBy: _o, ...rest } = current;
  return rest;
};

describe("month mode matches the pre-periods implementation exactly", () => {
  const scenarios = [
    {
      name: "a clean month of small spends under budget",
      today: "2026-08-20",
      savings: { "2026-7": 0 },
      transactions: [
        txn("2026-08-01", "income", 900),
        txn("2026-08-03", "expense", 20),
        txn("2026-08-07", "expense", 15),
        txn("2026-08-14", "expense", 30),
        txn("2026-08-19", "expense", 25),
      ],
      restored: [],
    },
    {
      name: "a blown budget that breaks the streak",
      today: "2026-08-20",
      savings: { "2026-7": 200 },
      transactions: [
        txn("2026-08-01", "income", 600),
        txn("2026-08-05", "expense", 400),
        txn("2026-08-06", "expense", 10),
        txn("2026-08-18", "expense", 5),
      ],
      restored: [],
    },
    {
      name: "a restored day mid-month",
      today: "2026-08-20",
      savings: { "2026-7": 100 },
      transactions: [
        txn("2026-08-01", "income", 800),
        txn("2026-08-09", "expense", 500),
        txn("2026-08-12", "expense", 10),
      ],
      restored: ["2026-08-09"],
    },
    {
      name: "history spanning several months, including a short one",
      today: "2026-03-10",
      savings: { "2026-0": 50, "2026-1": 75 },
      transactions: [
        txn("2026-01-01", "income", 500),
        txn("2026-01-15", "expense", 40),
        txn("2026-02-01", "income", 500),
        txn("2026-02-27", "expense", 300),
        txn("2026-03-01", "income", 500),
        txn("2026-03-09", "expense", 12),
      ],
      restored: [],
    },
    {
      name: "a leap-year February",
      today: "2028-02-29",
      savings: { "2028-1": 0 },
      transactions: [
        txn("2028-02-01", "income", 580),
        txn("2028-02-14", "expense", 20),
        txn("2028-02-29", "expense", 15),
      ],
      restored: [],
    },
    {
      name: "no income logged yet",
      today: "2026-08-20",
      savings: {},
      transactions: [txn("2026-08-04", "expense", 12)],
      restored: [],
    },
    {
      name: "income arriving mid-month",
      today: "2026-08-20",
      savings: {},
      transactions: [
        txn("2026-08-02", "expense", 30),
        txn("2026-08-10", "income", 400),
        txn("2026-08-15", "expense", 20),
      ],
      restored: [],
    },
    {
      name: "savings target larger than income",
      today: "2026-08-10",
      savings: { "2026-7": 900 },
      transactions: [
        txn("2026-08-01", "income", 300),
        txn("2026-08-05", "expense", 10),
      ],
      restored: [],
    },
    {
      name: "over budget today, which must not break the streak yet",
      today: "2026-08-20",
      savings: {},
      transactions: [
        txn("2026-08-01", "income", 300),
        txn("2026-08-20", "expense", 290),
      ],
      restored: [],
    },
  ];

  for (const s of scenarios) {
    it(s.name, () => {
      const legacy = legacyComputeStreak(s.transactions, s.restored, s.today, s.savings);
      const current = computeStreak(s.transactions, s.restored, s.today, {
        mode: "month",
        savingsByMonth: s.savings,
      });
      assert.deepEqual(comparable(current), rename(legacy));
    });
  }

  it("has no empty-history difference either", () => {
    const legacy = legacyComputeStreak([], [], "2026-08-20", { "2026-7": 40 });
    const current = computeStreak([], [], "2026-08-20", {
      mode: "month",
      savingsByMonth: { "2026-7": 40 },
    });
    assert.deepEqual(comparable(current), rename(legacy));
  });
});

describe("days mode budget", () => {
  it("spreads income across the period's length, not the calendar month", () => {
    // $300 over a 15-day period is $20/day, where a monthly view of the same
    // income on Aug 1 would have said just under $10.
    const result = computeStreak(
      [txn("2026-08-01", "income", 300)],
      [],
      "2026-08-01",
      daysMode([period("2026-08-01", 15)])
    );
    assert.equal(result.today.budget, 20);
    assert.equal(result.period.days, 15);
    assert.equal(result.period.daysLeft, 15);
  });

  it("reserves the period's savings target first", () => {
    const result = computeStreak(
      [txn("2026-08-01", "income", 300)],
      [],
      "2026-08-01",
      daysMode([period("2026-08-01", 10, 100)])
    );
    assert.equal(result.today.budget, 20);
    assert.equal(result.periodSavings, 100);
  });

  it("rolls the unspent remainder into the days that are left", () => {
    // $300 / 10 days = $30/day. Spending $10 on day one leaves $290 over the
    // 9 remaining days.
    const result = computeStreak(
      [txn("2026-08-01", "income", 300), txn("2026-08-01", "expense", 10)],
      [],
      "2026-08-02",
      daysMode([period("2026-08-01", 10)])
    );
    assert.equal(Math.round(result.today.budget * 100) / 100, 32.22);
  });

  it("starts each period's budget fresh, ignoring the previous one's income", () => {
    const periods = [period("2026-08-01", 10), period("2026-08-11", 10)];
    const result = computeStreak(
      [
        txn("2026-08-01", "income", 300),
        txn("2026-08-11", "income", 500),
        txn("2026-08-02", "expense", 250),
      ],
      [],
      "2026-08-11",
      daysMode(periods)
    );
    // The overspend in the first period must not eat into the second.
    assert.equal(result.today.budget, 50);
  });

  it("handles a period that straddles a month boundary", () => {
    const result = computeStreak(
      [txn("2026-08-25", "income", 280)],
      [],
      "2026-09-01",
      daysMode([period("2026-08-25", 14)])
    );
    assert.equal(result.period.start, "2026-08-25");
    assert.equal(result.period.end, "2026-09-07");
    assert.equal(result.period.daysLeft, 7);
  });
});

describe("untracked days", () => {
  const periods = [period("2026-08-01", 5), period("2026-08-11", 5)];

  it("neither extend nor break a streak", () => {
    // Aug 6-10 sit in the gap. The streak should run straight through them:
    // 5 winning days in the first period + 2 in the second.
    const result = computeStreak(
      [
        txn("2026-08-01", "income", 500),
        txn("2026-08-11", "income", 500),
        txn("2026-08-02", "expense", 10),
      ],
      [],
      "2026-08-12",
      daysMode(periods)
    );
    assert.equal(result.currentStreak, 7);
  });

  it("are not judged even when money was spent in them", () => {
    // A blowout on a day with no budget must not register as a break.
    const result = computeStreak(
      [
        txn("2026-08-01", "income", 500),
        txn("2026-08-11", "income", 500),
        txn("2026-08-08", "expense", 5000),
      ],
      [],
      "2026-08-12",
      daysMode(periods)
    );
    assert.equal(result.restore, null);
    assert.equal(result.currentStreak, 7);
  });

  it("report no budget when today itself is untracked", () => {
    const result = computeStreak(
      [txn("2026-08-01", "income", 500), txn("2026-08-08", "expense", 40)],
      [],
      "2026-08-08",
      daysMode([period("2026-08-01", 5)])
    );
    assert.equal(result.periodStatus, "inactive");
    assert.equal(result.period, null);
    assert.equal(result.today.budget, 0);
    assert.equal(result.today.within, true, "an unbudgeted day cannot be over");
    assert.equal(result.hasIncome, false);
  });

  it("show up in the last-7 strip as untracked, not as losses", () => {
    const result = computeStreak(
      [txn("2026-08-01", "income", 500), txn("2026-08-02", "expense", 10)],
      [],
      "2026-08-07",
      daysMode([period("2026-08-01", 5)])
    );
    const statuses = Object.fromEntries(result.last7.map((d) => [d.date, d.status]));
    assert.equal(statuses["2026-08-03"], "win");
    assert.equal(statuses["2026-08-06"], "untracked");
    assert.equal(statuses["2026-08-07"], "untracked");
  });

  it("exclude income logged in a gap from every period's budget", () => {
    // Money that arrived while no period was running funds no daily budget;
    // the user has to start a period for it to count.
    const result = computeStreak(
      [txn("2026-08-08", "income", 900), txn("2026-08-11", "income", 100)],
      [],
      "2026-08-11",
      daysMode(periods)
    );
    assert.equal(result.today.budget, 20);
  });
});

describe("restore allowance scales with period length", () => {
  it("gives a 15-day period two saves", () => {
    const result = computeStreak(
      [txn("2026-08-01", "income", 150)],
      [],
      "2026-08-02",
      daysMode([period("2026-08-01", 15)])
    );
    assert.equal(result.period.savesTotal, 2);
    assert.equal(result.savesLeftThisPeriod, 2);
  });

  it("gives a 45-day period five", () => {
    const result = computeStreak(
      [txn("2026-08-01", "income", 150)],
      [],
      "2026-08-02",
      daysMode([period("2026-08-01", 45)])
    );
    assert.equal(result.savesLeftThisPeriod, 5);
  });

  it("counts saves against the period the restored day belongs to", () => {
    const periods = [period("2026-08-01", 15), period("2026-08-16", 15)];
    const result = computeStreak(
      [
        txn("2026-08-01", "income", 150),
        txn("2026-08-16", "income", 150),
        txn("2026-08-05", "expense", 140),
      ],
      ["2026-08-05"],
      "2026-08-20",
      daysMode(periods)
    );
    // The save was spent in the first period, so the current one is untouched.
    assert.equal(result.savesLeftThisPeriod, 2);
  });

  it("stops offering a restore once the period's saves are gone", () => {
    const p = [period("2026-08-01", 7)]; // 7 days -> 1 save
    const transactions = [
      txn("2026-08-01", "income", 70),
      txn("2026-08-02", "expense", 60),
      txn("2026-08-04", "expense", 60),
    ];
    const first = computeStreak(transactions, [], "2026-08-06", daysMode(p));
    assert.equal(first.restore?.date, "2026-08-04");

    const afterOneSave = computeStreak(
      transactions,
      ["2026-08-04"],
      "2026-08-06",
      daysMode(p)
    );
    assert.equal(afterOneSave.savesLeftThisPeriod, 0);
    assert.equal(afterOneSave.restore, null);
  });
});

describe("period day grid", () => {
  it("only covers the active period", () => {
    const periods = [period("2026-08-01", 5), period("2026-08-11", 5)];
    const result = computeStreak(
      [
        txn("2026-08-01", "income", 500),
        txn("2026-08-11", "income", 500),
        txn("2026-08-12", "expense", 30),
      ],
      [],
      "2026-08-13",
      daysMode(periods)
    );
    const dates = result.periodDays.map((d) => d.date);
    assert.deepEqual(dates, ["2026-08-11", "2026-08-12", "2026-08-13"]);
    assert.equal(result.periodDays[1].spent, 30);
  });

  it("is empty while no period is running", () => {
    const result = computeStreak(
      [txn("2026-08-01", "income", 500)],
      [],
      "2026-08-09",
      daysMode([period("2026-08-01", 5)])
    );
    assert.deepEqual(result.periodDays, []);
  });
});

describe("overspending a period", () => {
  const periods = [period("2026-04-01", 151, 150)];

  it("reports how far past the period's budget the user is", () => {
    // $1000 in, $150 set aside -> $850 to spend. $1200 spent is $350 past it.
    const result = computeStreak(
      [txn("2026-04-01", "income", 1000), txn("2026-04-05", "expense", 1200)],
      [],
      "2026-08-03",
      daysMode(periods)
    );
    assert.equal(result.overspentBy, 350);
    assert.equal(result.today.budget, 0, "the clamped budget stays 0 for the bar");
  });

  it("is zero while still inside the budget", () => {
    const result = computeStreak(
      [txn("2026-04-01", "income", 1000), txn("2026-04-05", "expense", 200)],
      [],
      "2026-08-03",
      daysMode(periods)
    );
    assert.equal(result.overspentBy, 0);
    assert.ok(result.today.budget > 0);
  });

  it("counts the savings target as spent-for-this-purpose", () => {
    // Exactly at the line: $850 spent of $850 spendable is not yet over.
    const exact = computeStreak(
      [txn("2026-04-01", "income", 1000), txn("2026-04-05", "expense", 850)],
      [],
      "2026-08-03",
      daysMode(periods)
    );
    assert.equal(exact.overspentBy, 0);

    const over = computeStreak(
      [txn("2026-04-01", "income", 1000), txn("2026-04-05", "expense", 850.01)],
      [],
      "2026-08-03",
      daysMode(periods)
    );
    assert.equal(over.overspentBy, 0.01);
  });

  it("recovers when fresh income lands mid-period", () => {
    const result = computeStreak(
      [
        txn("2026-04-01", "income", 1000),
        txn("2026-04-05", "expense", 1200),
        txn("2026-05-01", "income", 500),
      ],
      [],
      "2026-08-03",
      daysMode(periods)
    );
    assert.equal(result.overspentBy, 0, "$1500 in, $150 aside, $1200 out");
    assert.ok(result.today.budget > 0, "the daily budget comes back");
  });

  it("does not break the streak on a no-spend day", () => {
    // Being over the period budget is a warning, not a verdict on today —
    // spending nothing must still count as a win.
    const result = computeStreak(
      [txn("2026-04-01", "income", 1000), txn("2026-04-05", "expense", 1200)],
      [],
      "2026-08-03",
      daysMode(periods)
    );
    assert.equal(result.today.within, true);
    assert.ok(result.currentStreak > 0);
  });

  it("is zero when no period is running", () => {
    const result = computeStreak(
      [txn("2026-04-01", "income", 100), txn("2026-04-02", "expense", 900)],
      [],
      "2026-09-30",
      daysMode([period("2026-04-01", 10)])
    );
    assert.equal(result.periodStatus, "inactive");
    assert.equal(result.overspentBy, 0);
  });
});
