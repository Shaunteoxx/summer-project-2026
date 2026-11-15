// Black-box API tests: the rolling daily budget, the streak, savings targets
// and the monthly history — in month mode, the app's default.
//
// The model under test (README, "One budget model everywhere"):
//   budget for a day = (income − savings target − spent on EARLIER days)
//                      ÷ days left in the period, counting that day.
// A day is a win when its spending is within its budget.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { boot, near } from "./_harness.js";

const NOW = "2026-03-10T04:00:00.000Z"; // 10 March, 31-day month → 22 days left
const TODAY = "2026-03-10";

let api;
before(async () => { api = await boot("bbbudget", { now: NOW }); });
after(async () => { await api.stop(); });

const streakOf = async (token, today = TODAY) => (await api.call(`/api/streak?today=${today}`, token)).body;
const homeOf = async (token, today = TODAY) => (await api.call(`/api/auth/home?today=${today}`, token)).body;
const dayOf = (streak, date) => streak.periodDays.find((d) => d.date === date);
const setSavings = (token, key, amount, extra = {}) => api.call("/api/auth/savings", token, "PUT", { key, amount, ...extra });

describe("a brand-new account", () => {
  it("has no budget, no streak and nothing to spend", async () => {
    const { token } = await api.makeUser();
    const s = await streakOf(token);
    assert.equal(s.hasIncome, false);
    assert.equal(s.currentStreak, 0);
    assert.equal(s.longestStreak, 0);
    assert.equal(s.overspentBy, 0);
    const h = await homeOf(token);
    assert.equal(h.periodIncome, 0);
    assert.equal(h.periodExpenses, 0);
    assert.equal(h.leftToSpend, 0);
    assert.equal(h.mode, "month");
    assert.equal(h.period.start, "2026-03-01");
    assert.equal(h.period.end, "2026-03-31");
  });

  it("expenses with no income give no daily budget, and no negative one", async () => {
    const { token } = await api.makeUser();
    await api.expense(token, "2026-03-05", 20);
    const s = await streakOf(token);
    assert.equal(s.hasIncome, false);
    assert.ok(s.today.budget >= 0);
  });
});

describe("the rolling daily budget", () => {
  it("divides what is left by the days left, counting today", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    const s = await streakOf(token);
    assert.equal(s.hasIncome, true);
    assert.equal(s.period.days, 31);
    assert.equal(s.period.daysLeft, 22);
    near(s.today.budget, 900 / 22);
    near(s.today.remaining, 900 / 22);
    assert.equal(s.today.spent, 0);
    assert.equal(s.today.within, true);
  });

  it("gives every day of the period its own budget", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    const s = await streakOf(token);
    assert.deepEqual(s.periodDays.map((d) => d.date), [
      "2026-03-01", "2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05",
      "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10",
    ]);
    s.periodDays.forEach((d, i) => near(d.budget, 900 / (31 - i)));
  });

  it("lowers later days after spending, and leaves earlier days alone", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    await api.expense(token, "2026-03-05", 90);
    const s = await streakOf(token);
    near(dayOf(s, "2026-03-04").budget, 900 / 28);
    near(dayOf(s, "2026-03-05").budget, 900 / 27); // the day's own spending is not deducted
    assert.equal(dayOf(s, "2026-03-05").spent, 90);
    near(dayOf(s, "2026-03-06").budget, 810 / 26);
    near(s.today.budget, 810 / 22);
  });

  it("today's budget does not move when today's spending is logged", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    const before = await streakOf(token);
    await api.expense(token, TODAY, 10);
    const s = await streakOf(token);
    near(s.today.budget, before.today.budget);
    assert.equal(s.today.spent, 10);
    near(s.today.remaining, before.today.budget - 10);
    assert.equal(s.today.within, true);
  });

  it("says so when today has gone over", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    await api.expense(token, TODAY, 100);
    const s = await streakOf(token);
    assert.equal(s.today.within, false);
    assert.equal(s.today.spent, 100);
  });

  it("uses the whole period's income, whenever in the period it was logged", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 310);
    await api.income(token, "2026-03-06", 260);
    const s = await streakOf(token);
    near(dayOf(s, "2026-03-05").budget, 570 / 27);
    near(dayOf(s, "2026-03-06").budget, 570 / 26);
    near(s.today.budget, 570 / 22);
  });

  it("counts income logged later today in today's budget", async () => {
    const { token } = await api.makeUser();
    await api.income(token, TODAY, 220);
    near((await streakOf(token)).today.budget, 10);
  });

  it("keys days by UTC date — an entry lands on the day it was dated", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    await api.expense(token, "2026-03-07", 4);
    const s = await streakOf(token);
    assert.equal(dayOf(s, "2026-03-07").spent, 4);
    assert.equal(dayOf(s, "2026-03-06").spent, 0);
    assert.equal(dayOf(s, "2026-03-08").spent, 0);
  });
});

describe("the savings target is reserved before the budget", () => {
  it("comes off the top", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    assert.equal((await setSavings(token, "2026-2", 200)).status, 200);
    const s = await streakOf(token);
    near(s.today.budget, 700 / 22);
    assert.equal(s.periodSavings, 200);
    const h = await homeOf(token);
    assert.equal(h.periodSavings, 200);
    assert.equal(h.leftToSpend, 700);
  });

  it("another month's target does not touch this month", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    await setSavings(token, "2026-1", 500); // February
    await setSavings(token, "2026-3", 500); // April
    const s = await streakOf(token);
    near(s.today.budget, 900 / 22);
    assert.equal((await homeOf(token)).periodSavings, 0);
  });

  it("a zero target is stored as zero rather than removed", async () => {
    const { token } = await api.makeUser();
    await setSavings(token, "2026-2", 120);
    const r = await setSavings(token, "2026-2", 0);
    assert.equal(r.status, 200);
    assert.equal(r.body.savingsByMonth["2026-2"], 0);
    assert.equal((await api.call("/api/auth/me", token)).body.savingsByMonth["2026-2"], 0);
  });

  it("refuses negative, non-numeric and absurd targets", async () => {
    const { token } = await api.makeUser();
    for (const amount of [-1, "abc", 1e12]) {
      const r = await setSavings(token, "2026-2", amount);
      assert.equal(r.status, 400, `amount ${JSON.stringify(amount)} → ${r.status}`);
    }
  });

  it("refuses a malformed month key", async () => {
    const { token } = await api.makeUser();
    for (const key of ["junk", "2026-12", "2026--1", "2026", "", "1999-13", "__proto__", "$where"]) {
      const r = await setSavings(token, key, 50);
      assert.equal(r.status, 400, `key ${JSON.stringify(key)} → ${r.status}`);
    }
    assert.deepEqual((await api.call("/api/auth/me", token)).body.savingsByMonth, {});
  });

  it("a target with no income reads as a negative amount left, honestly", async () => {
    const { token } = await api.makeUser();
    await setSavings(token, "2026-2", 150);
    assert.equal((await homeOf(token)).leftToSpend, -150);
  });
});

describe("a repeating savings target", () => {
  // Sets a February target with repeat on, then opens the app in March.
  const intoMarch = async (amount = 150) => {
    const { user } = await api.makeUser();
    api.setNow("2026-02-10T04:00:00.000Z");
    const r = await setSavings(api.signToken(user), "2026-1", amount, { repeat: true });
    assert.equal(r.status, 200);
    assert.equal(r.body.repeatSavings, true);
    api.setNow(NOW);
    const token = api.signToken(user);
    await api.income(token, "2026-03-01", 900);
    return token;
  };
  const me = async (token) => (await api.call("/api/auth/me", token)).body;

  it("is written into the new month, and never into one already lived through", async () => {
    const token = await intoMarch();
    const saved = (await me(token)).savingsByMonth;
    assert.equal(saved["2026-2"], 150);
    assert.equal(saved["2026-1"], 150);
    assert.ok(!("2026-0" in saved), "January was given a target after the fact");
  });

  // Whichever page the user lands on first in a new month has to show the
  // carried target — each of these is the FIRST request of March.
  it("the streak's first answer of the month already reserves it", async () => {
    const s = await streakOf(await intoMarch());
    assert.equal(s.periodSavings, 150);
    near(s.today.budget, 750 / 22);
  });

  it("the period's first answer of the month already reserves it", async () => {
    const r = await api.call(`/api/period?today=${TODAY}`, await intoMarch());
    assert.equal(r.body.current.savings, 150);
  });

  it("the accounts card's first answer of the month already reserves it", async () => {
    const r = await api.call(`/api/accounts?today=${TODAY}`, await intoMarch());
    assert.equal(r.body.totals.reserved, 150);
    assert.equal(r.body.totals.leftToSpend, 750);
  });

  it("the homepage's first answer of the month already reserves it", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const h = await homeOf(await intoMarch());
    assert.equal(h.periodSavings, 150, "Home did not reserve the carried target");
    assert.equal(h.leftToSpend, 750);
  });

  it("the homepage and the streak agree on the first load of a new month", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const token = await intoMarch();
    const [h, s] = await Promise.all([homeOf(token), streakOf(token)]);
    assert.equal(h.periodSavings, s.periodSavings);
    near(h.leftToSpend, s.leftToSpend);
  });

  it("does nothing when repeat is off", async () => {
    const { user } = await api.makeUser();
    api.setNow("2026-02-10T04:00:00.000Z");
    await setSavings(api.signToken(user), "2026-1", 150);
    api.setNow(NOW);
    const mar = api.signToken(user);
    assert.equal((await streakOf(mar)).periodSavings, 0);
    assert.ok(!("2026-2" in (await me(mar)).savingsByMonth));
  });

  it("never overwrites a target the user set for the new month, even $0", async () => {
    const { user } = await api.makeUser();
    api.setNow("2026-02-10T04:00:00.000Z");
    const feb = api.signToken(user);
    await setSavings(feb, "2026-1", 150, { repeat: true });
    await setSavings(feb, "2026-2", 0, { repeat: true });
    api.setNow(NOW);
    const mar = api.signToken(user);
    assert.equal((await streakOf(mar)).periodSavings, 0);
    assert.equal((await me(mar)).savingsByMonth["2026-2"], 0);
  });

  it("carries across a month nobody opened the app in, without back-filling it", async () => {
    const { user } = await api.makeUser();
    api.setNow("2026-01-10T04:00:00.000Z");
    await setSavings(api.signToken(user), "2026-0", 80, { repeat: true });
    api.setNow(NOW);
    const mar = api.signToken(user);
    assert.equal((await streakOf(mar)).periodSavings, 80);
    assert.ok(!("2026-1" in (await me(mar)).savingsByMonth), "February was back-filled");
  });

  it("looking at a friend's numbers never writes a target into their account", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    api.setNow("2026-02-10T04:00:00.000Z");
    await setSavings(api.signToken(b.user), "2026-1", 150, { repeat: true });
    const aFeb = api.signToken(a.user);
    await api.call(`/api/friends/request/${b.id}`, aFeb, "POST", {});
    await api.call(`/api/friends/accept/${a.id}`, api.signToken(b.user), "POST", {});
    api.setNow(NOW);
    await api.call(`/api/friends/comparison?today=${TODAY}`, api.signToken(a.user));
    const stored = await api.models.User.findById(b.id).lean();
    assert.ok(!("2026-2" in (stored.savingsByMonth || {})), "a read of someone else's data wrote to it");
  });
});

describe("the streak", () => {
  it("counts every day within budget since the first entry, today included", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    const s = await streakOf(token);
    assert.equal(s.currentStreak, 10);
    assert.equal(s.longestStreak, 10);
    s.periodDays.forEach((d) => assert.equal(d.status, "win", d.date));
  });

  it("does not count days before the account's first entry", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-07", 900);
    const s = await streakOf(token);
    assert.equal(s.currentStreak, 4);
    assert.equal(s.periodDays[0].date, "2026-03-07");
  });

  it("spending exactly the day's budget is still a win", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    await api.expense(token, "2026-03-02", 30); // 900 ÷ 30 days left = exactly 30
    const s = await streakOf(token);
    near(dayOf(s, "2026-03-02").budget, 30);
    assert.equal(dayOf(s, "2026-03-02").status, "win");
    assert.equal(s.currentStreak, 10);
  });

  it("one cent over the day's budget breaks it", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    await api.expense(token, "2026-03-02", 30.01);
    const s = await streakOf(token);
    assert.notEqual(dayOf(s, "2026-03-02").status, "win");
    assert.equal(s.currentStreak, 8); // the 3rd to the 10th
    assert.equal(s.longestStreak, 8);
  });

  it("a break ends the run; the longest run is remembered", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    await api.expense(token, "2026-03-08", 200);
    const s = await streakOf(token);
    assert.equal(s.currentStreak, 2); // the 9th and 10th
    assert.equal(s.longestStreak, 7); // the 1st to the 7th
  });

  it("runs across a month boundary", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-02-01", 500);
    await api.income(token, "2026-03-01", 500);
    const s = await streakOf(token);
    assert.equal(s.currentStreak, 28 + 10);
  });

  it("a month with spending but no income breaks the streak that month", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-02-01", 500);
    await api.expense(token, "2026-03-03", 5); // March has no income, so no budget to be within
    const s = await streakOf(token);
    assert.ok(s.currentStreak < 38, `streak ${s.currentStreak} ignored unfunded spending`);
  });

  it("deleting the entry that broke a day un-breaks it", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    const bad = await api.expense(token, "2026-03-05", 500);
    assert.ok((await streakOf(token)).currentStreak < 10);
    await api.call(`/api/transactions/${bad.body._id}`, token, "DELETE");
    assert.equal((await streakOf(token)).currentStreak, 10);
  });

  it("last7 is the seven days ending today, in order", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    const s = await streakOf(token);
    assert.deepEqual(s.last7.map((d) => d.date), ["2026-03-04", "2026-03-05", "2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09", "2026-03-10"]);
    assert.equal(s.last7.at(-1).status, "today");
  });
});

describe("restoring a broken day", () => {
  const broken = async () => {
    const u = await api.makeUser();
    await api.income(u.token, "2026-03-01", 900);
    await api.expense(u.token, "2026-03-05", 90);
    return u;
  };
  const restore = (token, date, today = TODAY) => api.call("/api/streak/restore", token, "POST", { date, today });

  it("a 31-day month comes with three restores", async () => {
    const { token } = await broken();
    const s = await streakOf(token);
    assert.equal(s.period.savesTotal, 3);
    assert.equal(s.savesLeftThisPeriod, 3);
    assert.equal(s.currentStreak, 5);
  });

  it("repairs the breaking day and spends one restore", async () => {
    const { token } = await broken();
    const r = await restore(token, "2026-03-05");
    assert.equal(r.status, 200);
    const s = await streakOf(token);
    assert.equal(s.currentStreak, 10);
    assert.equal(s.savesLeftThisPeriod, 2);
    assert.equal(dayOf(s, "2026-03-05").status, "saved");
  });

  it("cannot restore the same day twice", async () => {
    const { token } = await broken();
    await restore(token, "2026-03-05");
    assert.equal((await restore(token, "2026-03-05")).status, 400);
    assert.equal((await streakOf(token)).savesLeftThisPeriod, 2);
  });

  it("cannot restore a day that was never broken, or a day yet to come", async () => {
    const { token } = await broken();
    assert.equal((await restore(token, "2026-03-04")).status, 400);
    assert.equal((await restore(token, "2026-03-11")).status, 400);
    assert.equal((await streakOf(token)).savesLeftThisPeriod, 3);
  });

  it("refuses a malformed date", async () => {
    const { token } = await broken();
    for (const date of ["junk", "", null, "2026-02-30", { $gt: "" }]) {
      const r = await restore(token, date);
      assert.equal(r.status, 400, `date ${JSON.stringify(date)} → ${r.status}`);
    }
  });

  it("runs out after three", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    for (const day of ["2026-03-03", "2026-03-05", "2026-03-07", "2026-03-09"]) await api.expense(token, day, 200);
    let ok = 0;
    for (const day of ["2026-03-09", "2026-03-07", "2026-03-05", "2026-03-03"]) {
      const r = await restore(token, day);
      if (r.status === 200) ok += 1;
    }
    assert.equal(ok, 3);
    assert.equal((await streakOf(token)).savesLeftThisPeriod, 0);
  });

  it("cannot reach back into a period that has ended", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-02-01", 500);
    await api.income(token, "2026-03-01", 500);
    await api.expense(token, "2026-02-20", 400);
    assert.equal((await restore(token, "2026-02-20")).status, 400);
    assert.equal((await streakOf(token)).savesLeftThisPeriod, 3);
  });

  it("one user's restore does nothing to another's streak", async () => {
    const a = await broken();
    const b = await broken();
    await restore(a.token, "2026-03-05");
    assert.equal((await streakOf(b.token)).currentStreak, 5);
  });
});

describe("overspending the whole period", () => {
  it("reports how far past the budget, with a zero daily budget and not a negative one", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 100);
    await api.expense(token, "2026-03-02", 150);
    const s = await streakOf(token);
    assert.equal(s.overspentBy, 50);
    assert.equal(s.today.budget, 0);
    assert.equal((await homeOf(token)).leftToSpend, -50);
  });

  it("counts the savings target as part of what was overspent", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 100);
    await setSavings(token, "2026-2", 30);
    await api.expense(token, "2026-03-02", 90);
    assert.equal((await streakOf(token)).overspentBy, 20);
  });

  it("is zero when the money is merely all spent", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 100);
    await api.expense(token, "2026-03-02", 100);
    const s = await streakOf(token);
    assert.equal(s.overspentBy, 0);
    assert.equal(s.today.budget, 0);
  });
});

describe("every surface shows the same numbers", () => {
  it("home, the streak and the accounts card agree on what is left", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 724.74);
    await api.expense(token, "2026-03-04", 33.59);
    await api.expense(token, "2026-03-08", 12.1, { paidBack: 2.1 });
    await setSavings(token, "2026-2", 150);
    const h = await homeOf(token);
    const s = await streakOf(token);
    const a = (await api.call(`/api/accounts?today=${TODAY}`, token)).body;
    near(h.leftToSpend, 724.74 - 33.59 - 10 - 150);
    near(s.leftToSpend, h.leftToSpend);
    near(a.totals.leftToSpend, h.leftToSpend);
    near(a.totals.income, h.periodIncome);
    near(a.totals.spent, h.periodExpenses);
    near(a.totals.reserved, h.periodSavings);
    assert.equal(h.period.daysLeft, s.period.daysLeft);
  });

  it("money figures come back rounded to cents", async () => {
    const { token } = await api.makeUser();
    for (let i = 0; i < 10; i += 1) await api.income(token, "2026-03-01", 0.1);
    await api.expense(token, "2026-03-02", 0.3);
    const h = await homeOf(token);
    assert.equal(h.periodIncome, 1);
    assert.equal(h.periodExpenses, 0.3);
    assert.equal(h.leftToSpend, 0.7);
  });
});

describe("the client's own date", () => {
  it("is honoured a day either side of the server's", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 900);
    assert.equal((await streakOf(token, "2026-03-09")).period.daysLeft, 23);
    assert.equal((await streakOf(token, "2026-03-11")).period.daysLeft, 21);
  });

  it("cannot be used to move the clock", async () => {
    const { token } = await api.makeUser();
    for (const path of ["/api/streak", "/api/auth/home", "/api/period", "/api/accounts", "/api/summary/lifetime"]) {
      for (const bad of ["2020-01-01", "2030-01-01", "junk"]) {
        const r = await api.call(`${path}?today=${bad}`, token);
        assert.equal(r.status, 400, `${path}?today=${bad} → ${r.status}`);
      }
    }
  });

  it("falls back to the server's date when the client sends none", async () => {
    const { token } = await api.makeUser();
    const r = await api.call("/api/auth/home", token);
    assert.equal(r.status, 200);
    assert.equal(r.body.period.daysLeft, 22);
  });

  it("a Singapore user just past midnight on the 1st is already in the new month", async () => {
    // 01:00 on 1 April in Singapore is still 31 March in UTC.
    const { user } = await api.makeUser();
    api.setNow("2026-03-31T17:00:00.000Z");
    const token = api.signToken(user);
    await api.income(token, "2026-03-01", 900);
    await api.income(token, "2026-04-01", 600);
    const h = await homeOf(token, "2026-04-01");
    assert.equal(h.period.start, "2026-04-01");
    assert.equal(h.period.end, "2026-04-30");
    assert.equal(h.periodIncome, 600);
    assert.equal(h.period.daysLeft, 30);
    near((await streakOf(token, "2026-04-01")).today.budget, 20);
    api.setNow(NOW);
  });
});

describe("monthly history (/api/summary)", () => {
  let token;
  before(async () => {
    ({ token } = await api.makeUser());
    await api.income(token, "2026-01-05", 1000);
    await api.expense(token, "2026-01-20", 250);
    await api.income(token, "2026-02-05", 800);
    await api.expense(token, "2026-02-10", 600);
    await api.expense(token, "2026-02-28", 100);
    await api.income(token, "2026-03-01", 500);
    await api.expense(token, "2026-03-02", 50);
  });

  const month = (rows, m) => rows.find((r) => r.month === m && r.year === 2026);

  it("has one row per calendar month, each totalled on its own", async () => {
    const { status, body } = await api.call("/api/summary/all", token);
    assert.equal(status, 200);
    assert.equal(body.length, 3);
    assert.equal(month(body, 0).totalIncome, 1000);
    assert.equal(month(body, 0).totalExpenses, 250);
    assert.equal(month(body, 0).totalSaved, 750);
    assert.equal(month(body, 1).totalIncome, 800);
    assert.equal(month(body, 1).totalExpenses, 700);
    assert.equal(month(body, 1).totalSaved, 100);
  });

  it("puts the last day of a month in that month, not the next", async () => {
    const { body } = await api.call("/api/summary/all", token);
    assert.equal(month(body, 1).totalExpenses, 700); // includes 28 Feb
    assert.equal(month(body, 2).totalExpenses, 50);
  });

  it("percentages are of that month's income and add up to 100", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const { body } = await api.call("/api/summary/all", token);
    assert.equal(month(body, 0).percentageSaved, 75);
    assert.equal(month(body, 0).percentageSpent, 25);
    body.forEach((r) => assert.equal(r.percentageSaved + r.percentageSpent, 100, `month ${r.month}`));
  });

  it("a single month can be asked for", async () => {
    const { status, body } = await api.call("/api/summary?month=0&year=2026", token);
    assert.equal(status, 200);
    assert.equal(body.totalIncome, 1000);
    assert.equal(body.totalExpenses, 250);
  });

  it("a month with nothing in it is all zeroes, not an error", async () => {
    const { status, body } = await api.call("/api/summary?month=5&year=2025", token);
    assert.equal(status, 200);
    assert.equal(body.totalIncome, 0);
    assert.equal(body.totalExpenses, 0);
    assert.equal(body.percentageSaved, 0);
  });

  it("a month that spent more than it earned does not report a saving", async () => {
    const u = await api.makeUser();
    await api.income(u.token, "2026-02-05", 100);
    await api.expense(u.token, "2026-02-10", 250);
    const row = month((await api.call("/api/summary/all", u.token)).body, 1);
    assert.equal(row.totalSaved, -150);
    assert.ok(row.percentageSaved <= 0, `percentageSaved ${row.percentageSaved}`);
  });

  it("a month with spending and no income does not divide by zero", async () => {
    const u = await api.makeUser();
    await api.expense(u.token, "2026-02-10", 40);
    const row = month((await api.call("/api/summary/all", u.token)).body, 1);
    assert.equal(row.totalIncome, 0);
    assert.equal(row.totalExpenses, 40);
    assert.ok(Number.isFinite(row.percentageSaved));
    assert.ok(Number.isFinite(row.percentageSpent));
  });

  it("refuses a malformed month", async () => {
    assert.equal((await api.call("/api/summary?month=12&year=2026", token)).status, 400);
    assert.equal((await api.call("/api/summary?month=abc&year=2026", token)).status, 400);
  });

  it("is each user's own", async () => {
    const other = await api.makeUser();
    assert.deepEqual((await api.call("/api/summary/all", other.token)).body, []);
  });
});

describe("all-time savings stop at the window still being lived in", () => {
  it("counts finished months only, and says where it stops", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-01-05", 1000);
    await api.expense(token, "2026-01-20", 250);
    await api.income(token, "2026-02-05", 800);
    await api.expense(token, "2026-02-10", 700);
    await api.income(token, "2026-03-01", 5000); // the running month
    await api.expense(token, "2026-03-02", 1);
    const { status, body } = await api.call(`/api/summary/lifetime?today=${TODAY}`, token);
    assert.equal(status, 200);
    assert.equal(body.through, "2026-02-28");
    assert.equal(body.earned, 1800);
    assert.equal(body.spent, 950);
    assert.equal(body.saved, 850);
    assert.equal(body.rate, Math.round((850 / 1800) * 100));
  });

  it("is all zeroes in an account's first month", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 5000);
    const { body } = await api.call(`/api/summary/lifetime?today=${TODAY}`, token);
    assert.equal(body.earned, 0);
    assert.equal(body.saved, 0);
    assert.equal(body.rate, 0);
  });

  it("an entry on the last day before the running window counts", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-02-28", 100);
    await api.income(token, "2026-03-01", 100);
    assert.equal((await api.call(`/api/summary/lifetime?today=${TODAY}`, token)).body.earned, 100);
  });
});
