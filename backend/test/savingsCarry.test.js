// Carrying a savings target into a new month. No database here — the helper
// only needs a document-shaped object, and the case that actually matters is
// the one a read-time fallback would get wrong: past months must come out of
// this completely untouched.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { ensureCurrentMonthSavings, monthKeyOf } from "../lib/savingsCarry.js";
import { computeStreak } from "../controllers/streakController.js";

/** Minimal stand-in for a User document: a real Map plus a counting save(). */
const fakeUser = ({ savings = {}, ...overrides } = {}) => {
  const user = {
    repeatSavings: true,
    isDemo: false,
    budgetMode: "month",
    savingsByMonth: new Map(Object.entries(savings)),
    saves: 0,
    save() {
      user.saves += 1;
      return Promise.resolve(user);
    },
    ...overrides,
  };
  return user;
};

const asObject = (user) => Object.fromEntries(user.savingsByMonth);

describe("month keys", () => {
  it("uses the 0-based month the savings map has always been keyed by", () => {
    assert.equal(monthKeyOf("2026-01-15"), "2026-0");
    assert.equal(monthKeyOf("2026-08-06"), "2026-7");
    assert.equal(monthKeyOf("2026-12-31"), "2026-11");
  });
});

describe("carrying the target forward", () => {
  it("fills an unset month from the one before", async () => {
    const user = fakeUser({ savings: { "2026-6": 400 } });
    assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), true);
    assert.deepEqual(asObject(user), { "2026-6": 400, "2026-7": 400 });
    assert.equal(user.saves, 1);
  });

  it("resumes the most recent target after months of not opening the app", async () => {
    const user = fakeUser({ savings: { "2026-0": 250 } });
    await ensureCurrentMonthSavings(user, "2026-08-06");
    assert.equal(user.savingsByMonth.get("2026-7"), 250);
    // The skipped months stay skipped — they were never budgeted, and saying
    // otherwise now would rewrite what those months looked like.
    assert.deepEqual(Object.keys(asObject(user)).sort(), ["2026-0", "2026-7"]);
  });

  it("carries across a year boundary", async () => {
    const user = fakeUser({ savings: { "2025-11": 180 } });
    await ensureCurrentMonthSavings(user, "2026-01-03");
    assert.equal(user.savingsByMonth.get("2026-0"), 180);
  });

  it("carries an explicit zero, which is a target like any other", async () => {
    const user = fakeUser({ savings: { "2026-5": 300, "2026-6": 0 } });
    await ensureCurrentMonthSavings(user, "2026-08-06");
    assert.equal(user.savingsByMonth.get("2026-7"), 0);
  });

  it("is idempotent, so two requests racing on app open agree", async () => {
    const user = fakeUser({ savings: { "2026-6": 400 } });
    assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), true);
    assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), false);
    assert.equal(user.saves, 1);
  });
});

describe("when it must not write", () => {
  const cases = [
    ["the user hasn't asked for it", { repeatSavings: false }],
    ["it's the read-only demo account", { isDemo: true }],
    ["days mode keeps its target on the period row", { budgetMode: "days" }],
  ];

  for (const [name, overrides] of cases) {
    it(name, async () => {
      const user = fakeUser({ savings: { "2026-6": 400 }, ...overrides });
      assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), false);
      assert.deepEqual(asObject(user), { "2026-6": 400 });
      assert.equal(user.saves, 0);
    });
  }

  it("this month already has a target", async () => {
    const user = fakeUser({ savings: { "2026-6": 400, "2026-7": 50 } });
    assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), false);
    assert.equal(user.savingsByMonth.get("2026-7"), 50);
  });

  it("this month is deliberately set to zero", async () => {
    // The whole reason setSavings stores 0 instead of deleting the key: without
    // that, "I'm saving nothing this month" would be silently overwritten here.
    const user = fakeUser({ savings: { "2026-6": 400, "2026-7": 0 } });
    assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), false);
    assert.equal(user.savingsByMonth.get("2026-7"), 0);
    assert.equal(user.saves, 0);
  });

  it("there is no earlier month to copy", async () => {
    const user = fakeUser({ savings: {} });
    assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), false);
    assert.equal(user.saves, 0);
  });

  it("the only other months are in the future", async () => {
    const user = fakeUser({ savings: { "2026-9": 400 } });
    assert.equal(await ensureCurrentMonthSavings(user, "2026-08-06"), false);
  });

  it("the document isn't the caller's to write to", async () => {
    // What a friend's partially-selected doc looks like: no repeatSavings, no
    // save(). The leaderboard resolves periods for these.
    const friend = {
      budgetMode: "month",
      savingsByMonth: new Map([["2026-6", 400]]),
    };
    assert.equal(await ensureCurrentMonthSavings(friend, "2026-08-06"), false);
  });

  it("today is unparseable", async () => {
    const user = fakeUser({ savings: { "2026-6": 400 } });
    assert.equal(await ensureCurrentMonthSavings(user, "not-a-date"), false);
    assert.equal(user.saves, 0);
  });
});

describe("history is not rewritten", () => {
  // April has a target, May never did, and the user opens the app in June.
  // A read-time fallback would give May April's target retroactively, shrinking
  // every May daily budget and turning days the user genuinely won into breaks.
  const tx = (date, type, amount) => ({
    date: new Date(`${date}T00:00:00.000Z`),
    type,
    amount,
    category: type === "income" ? "Allowance" : "F & B",
  });

  // May's spending sits between the two budgets it could be judged against:
  // comfortably inside $900 spread over the month, over the line once $300 is
  // wrongly reserved. So a fallback doesn't just move a number, it turns won
  // days into breaks and halves the streak.
  const transactions = [
    tx("2026-04-01", "income", 1000),
    tx("2026-04-10", "expense", 200),
    tx("2026-05-01", "income", 900),
    tx("2026-05-05", "expense", 25),
    tx("2026-05-12", "expense", 25),
    tx("2026-05-20", "expense", 25),
  ];

  it("leaves an earlier evaluation byte-identical after a later month is filled", async () => {
    const user = fakeUser({ savings: { "2026-3": 300 } });
    const config = (u) => ({
      mode: "month",
      savingsByMonth: Object.fromEntries(u.savingsByMonth),
      periods: [],
    });

    const before = computeStreak(transactions, [], "2026-05-31", config(user));
    assert.equal(await ensureCurrentMonthSavings(user, "2026-06-15"), true);
    const after = computeStreak(transactions, [], "2026-05-31", config(user));

    assert.deepEqual(after, before);
    // Spelled out, so a future regression names what it cost rather than
    // dumping two large objects: this is the streak the user earned.
    assert.equal(after.longestStreak, 51);
    assert.equal(after.periodDays.find((d) => d.date === "2026-05-05").status, "win");
  });

  it("fills only the current month, never the gap behind it", async () => {
    const user = fakeUser({ savings: { "2026-3": 300 } });
    await ensureCurrentMonthSavings(user, "2026-06-15");

    assert.equal(user.savingsByMonth.get("2026-5"), 300, "June was filled");
    assert.equal(user.savingsByMonth.has("2026-4"), false, "May stays unbudgeted");
    assert.equal(user.savingsByMonth.get("2026-3"), 300, "April is unchanged");
  });

  it("May's daily budgets are the ones the user actually lived", async () => {
    // Pins the consequence rather than the mechanism: with May unset, its
    // budget spreads the full $900. Inheriting April's $300 would drop it to
    // $600 and this number would move.
    const user = fakeUser({ savings: { "2026-3": 300 } });
    await ensureCurrentMonthSavings(user, "2026-06-15");

    const may = computeStreak(transactions, [], "2026-05-31", {
      mode: "month",
      savingsByMonth: Object.fromEntries(user.savingsByMonth),
      periods: [],
    });
    assert.equal(may.periodSavings, 0);
    assert.equal(may.period.start, "2026-05-01");
  });
});
