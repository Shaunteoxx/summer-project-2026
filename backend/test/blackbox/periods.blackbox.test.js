// Black-box API tests: custom-length periods (days mode) and lump-sum terms
// (term mode), with the clock pinned to the 1st of a month wherever the month
// boundary is the point of the test.
//
// From the README / HANDOFF §12 and §15:
//   • days mode: periods are started by hand; a day outside every period is
//     untracked — it has no budget and neither extends nor breaks a streak.
//   • term mode: a term is only a window; its cycles are calendar months
//     clipped at both ends, and
//       funding = pot × weight ÷ Σ(weights of this cycle and every later one)
//       pot     = income[term.start .. cycle.end] − (spending + set-aside)[term.start .. cycle.start)
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { boot, near } from "./_harness.js";

const FIRST = "2026-03-01T04:00:00.000Z"; // midday in Singapore on the 1st of March
const TODAY = "2026-03-01";

let api;
before(async () => { api = await boot("bbperiods", { now: FIRST }); });
after(async () => { await api.stop(); });
beforeEach(() => { api.setNow(FIRST); });

const get = async (path, token, today = TODAY) => (await api.call(`${path}?today=${today}`, token)).body;
const setMode = (token, mode) => api.call("/api/period/mode", token, "PUT", { mode });
const startPeriod = (token, body, today = TODAY) => api.call("/api/period", token, "POST", { today, ...body });
const startTerm = (token, body, today = TODAY) => api.call("/api/period/term", token, "POST", { today, ...body });
const daysUser = async () => {
  const u = await api.makeUser();
  assert.equal((await setMode(u.token, "days")).status, 200);
  return u;
};
const termUser = async () => {
  const u = await api.makeUser();
  assert.equal((await setMode(u.token, "term")).status, 200);
  return u;
};

// ───────────────────────── days mode on the 1st ──────────────────────────

describe("days mode: a period that began last month, seen on the 1st", () => {
  let token;
  before(async () => {
    api.setNow(FIRST);
    ({ token } = await daysUser());
    const p = await startPeriod(token, { start: "2026-02-20", length: 14, savingsTarget: 50 });
    assert.equal(p.status, 201);
    await api.income(token, "2026-02-20", 700);
    await api.expense(token, "2026-02-25", 35, { description: "last month, same period" });
    await api.expense(token, "2026-03-01", 10, { description: "the 1st" });
  });

  it("the period is still the active one", async () => {
    const p = await get("/api/period", token);
    assert.equal(p.mode, "days");
    assert.equal(p.status, "active");
    assert.equal(p.current.start, "2026-02-20");
    assert.equal(p.current.end, "2026-03-05");
    assert.equal(p.current.days, 14);
    assert.equal(p.current.daysLeft, 5);
  });

  it("home totals cover the whole period, not just the new calendar month", async () => {
    const h = await get("/api/auth/home", token);
    assert.equal(h.status, "active");
    assert.equal(h.period.start, "2026-02-20");
    assert.equal(h.period.end, "2026-03-05");
    assert.equal(h.periodIncome, 700);
    assert.equal(h.periodExpenses, 45);
    assert.equal(h.periodSavings, 50);
    assert.equal(h.leftToSpend, 605);
    assert.equal(h.period.daysLeft, 5);
  });

  it("the streak's days run from the period's first day across the boundary", async () => {
    const s = await get("/api/streak", token);
    assert.equal(s.hasIncome, true);
    assert.deepEqual(s.periodDays.map((d) => d.date), [
      "2026-02-20", "2026-02-21", "2026-02-22", "2026-02-23", "2026-02-24",
      "2026-02-25", "2026-02-26", "2026-02-27", "2026-02-28", "2026-03-01",
    ]);
    assert.equal(s.periodDays.find((d) => d.date === "2026-02-25").spent, 35);
    near(s.today.budget, (700 - 50 - 35) / 5);
    assert.equal(s.today.spent, 10);
    assert.equal(s.currentStreak, 10);
  });

  it("the accounts card covers the same span", async () => {
    const a = await get("/api/accounts", token);
    assert.equal(a.period.start, "2026-02-20");
    assert.equal(a.totals.income, 700);
    assert.equal(a.totals.spent, 45);
    assert.equal(a.totals.leftToSpend, 605);
  });

  it("the period's own date range returns last month's entries too", async () => {
    const p = await get("/api/period", token);
    const r = await api.call(`/api/transactions?start=${p.current.start}&end=${p.current.end}`, token);
    assert.equal(r.status, 200);
    assert.equal(r.body.length, 3);
    assert.ok(r.body.some((t) => t.description === "last month, same period"));
  });

  it("asking by calendar month, by contrast, shows only the 1st — the trap for a client", async () => {
    const r = await api.call("/api/transactions?month=2&year=2026", token);
    assert.equal(r.body.length, 1);
    assert.equal(r.body[0].description, "the 1st");
  });

  it("history stays on calendar months whatever the mode", async () => {
    const rows = (await api.call("/api/summary/all", token)).body;
    const feb = rows.find((r) => r.month === 1);
    const mar = rows.find((r) => r.month === 2);
    assert.equal(feb.totalIncome, 700);
    assert.equal(feb.totalExpenses, 35);
    assert.equal(mar.totalExpenses, 10);
  });
});

describe("days mode: the last day and the day after", () => {
  it("the final day has one day left and the whole remainder as its budget", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-16", length: 14 }); // ends 1 March
    await api.income(token, "2026-02-16", 280);
    await api.expense(token, "2026-02-20", 80);
    const s = await get("/api/streak", token);
    assert.equal(s.period.end, "2026-03-01");
    assert.equal(s.period.daysLeft, 1);
    near(s.today.budget, 200);
  });

  it("the day after it ends, the period has lapsed and nothing is budgeted", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-15", length: 14 }); // ends 28 February
    await api.income(token, "2026-02-15", 280);
    const p = await get("/api/period", token);
    assert.equal(p.status, "lapsed");
    assert.equal(p.current, null);
    assert.equal(p.previous.start, "2026-02-15");
    assert.equal(p.previous.end, "2026-02-28");
    const h = await get("/api/auth/home", token);
    assert.equal(h.status, "lapsed");
    assert.equal(h.period, null);
    const s = await get("/api/streak", token);
    assert.notEqual(s.periodStatus, "active");
    assert.equal(s.period, null);
    assert.equal(s.today.budget, 0);
  });

  it("the streak names a lapsed period the way /api/period and home do", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-15", length: 14 });
    await api.income(token, "2026-02-15", 280);
    const [p, h, s] = await Promise.all([get("/api/period", token), get("/api/auth/home", token), get("/api/streak", token)]);
    assert.equal(h.status, p.status);
    assert.equal(s.periodStatus, p.status, "the streak uses a different word for the same state");
  });

  it("gap days neither extend nor break the streak", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-15", length: 10 }); // ends 24 February
    await api.income(token, "2026-02-15", 300);
    const s = await get("/api/streak", token);
    assert.equal(s.currentStreak, 10);
    assert.equal(s.longestStreak, 10);
  });

  it("spending on an untracked day does not break the streak either", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-15", length: 10 });
    await api.income(token, "2026-02-15", 300);
    await api.expense(token, "2026-02-27", 999);
    assert.equal((await get("/api/streak", token)).currentStreak, 10);
  });

  it("starting the next period picks the streak back up", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-15", length: 10 }); // 15–24 Feb
    await api.income(token, "2026-02-15", 300);
    assert.equal((await startPeriod(token, { start: "2026-02-28", length: 7 })).status, 201);
    await api.income(token, "2026-02-28", 70);
    const s = await get("/api/streak", token);
    assert.equal(s.periodStatus, "active");
    assert.equal(s.currentStreak, 12); // ten days, a gap, then 28 Feb and 1 Mar
  });

  it("never having started one is 'none', not 'lapsed'", async () => {
    const { token } = await daysUser();
    const p = await get("/api/period", token);
    assert.equal(p.status, "none");
    assert.equal(p.current, null);
    assert.equal(p.previous, null);
    assert.deepEqual(p.history, []);
    assert.equal((await get("/api/auth/home", token)).status, "none");
  });

  it("all-time savings count everything when no period is running", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-10", length: 10 }); // ended 19 Feb
    await api.income(token, "2026-02-10", 300);
    await api.expense(token, "2026-02-12", 100);
    const life = await get("/api/summary/lifetime", token);
    assert.equal(life.earned, 300);
    assert.equal(life.spent, 100);
    assert.equal(life.saved, 200);
  });

  it("all-time savings stop the day before a running period opens", async () => {
    const { token } = await daysUser();
    await api.income(token, "2026-02-01", 400);
    await api.expense(token, "2026-02-05", 100);
    await startPeriod(token, { start: "2026-02-20", length: 14 });
    await api.income(token, "2026-02-20", 700);
    const life = await get("/api/summary/lifetime", token);
    assert.equal(life.through, "2026-02-19");
    assert.equal(life.earned, 400);
    assert.equal(life.saved, 300);
  });
});

describe("days mode: starting a period", () => {
  it("returns the period with an inclusive end date", async () => {
    const { token } = await daysUser();
    const r = await startPeriod(token, { start: "2026-03-01", length: 14, savingsTarget: 25 });
    assert.equal(r.status, 201);
    assert.equal(r.body.start, "2026-03-01");
    assert.equal(r.body.end, "2026-03-14");
    assert.equal(r.body.days, 14);
    assert.equal(r.body.savings, 25);
    assert.equal(r.body.daysLeft, 14);
    assert.equal(r.body.savesTotal, 1);
  });

  it("allows a one-day period and the longest one", async () => {
    const a = await daysUser();
    const one = await startPeriod(a.token, { start: "2026-03-01", length: 1 });
    assert.equal(one.status, 201);
    assert.equal(one.body.end, "2026-03-01");
    assert.equal(one.body.daysLeft, 1);
    const b = await daysUser();
    const long = await startPeriod(b.token, { start: "2026-03-01", length: 366 });
    assert.equal(long.status, 201);
    assert.equal(long.body.end, "2027-03-01");
    assert.equal(long.body.savesTotal, 37);
  });

  it("a one-day period's budget is everything, less the savings target", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-03-01", length: 1, savingsTarget: 20 });
    await api.income(token, "2026-03-01", 100);
    near((await get("/api/streak", token)).today.budget, 80);
  });

  it("allows back-dating, which grades the forgotten days", async () => {
    const { token } = await daysUser();
    await api.income(token, "2026-02-25", 100);
    const r = await startPeriod(token, { start: "2026-02-25", length: 10 });
    assert.equal(r.status, 201);
    assert.equal((await get("/api/streak", token)).currentStreak, 5);
  });

  it("refuses a start in the future", async () => {
    const { token } = await daysUser();
    for (const start of ["2026-03-03", "2026-04-01", "2027-01-01"]) {
      assert.equal((await startPeriod(token, { start, length: 7 })).status, 400, start);
    }
    assert.deepEqual((await get("/api/period", token)).history, []);
  });

  it("refuses a bad length", async () => {
    const { token } = await daysUser();
    for (const length of [0, -5, 367, 1.5, "abc", null, undefined]) {
      const r = await startPeriod(token, { start: "2026-03-01", length });
      assert.equal(r.status, 400, `length ${JSON.stringify(length)} → ${r.status}`);
    }
  });

  it("refuses a bad start date", async () => {
    const { token } = await daysUser();
    for (const start of ["junk", "2026-02-30", "", null, { $gt: "" }]) {
      const r = await startPeriod(token, { start, length: 7 });
      assert.equal(r.status, 400, `start ${JSON.stringify(start)} → ${r.status}`);
    }
  });

  it("refuses a negative or absurd savings target", async () => {
    const { token } = await daysUser();
    for (const savingsTarget of [-1, "abc", 1e12]) {
      const r = await startPeriod(token, { start: "2026-03-01", length: 7, savingsTarget });
      assert.equal(r.status, 400, `target ${JSON.stringify(savingsTarget)} → ${r.status}`);
    }
  });

  it("refuses any overlap with an existing period", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-10", length: 10 }); // 10–19 Feb
    for (const [start, length] of [["2026-02-10", 10], ["2026-02-05", 6], ["2026-02-19", 3], ["2026-02-12", 2], ["2026-02-01", 28]]) {
      const r = await startPeriod(token, { start, length });
      assert.ok([400, 409].includes(r.status), `${start}+${length} → ${r.status}`);
    }
    assert.equal((await get("/api/period", token)).history.length, 1);
  });

  it("allows periods that sit back to back", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-10", length: 10 }); // ends 19 Feb
    assert.equal((await startPeriod(token, { start: "2026-02-20", length: 10 })).status, 201);
    assert.equal((await startPeriod(token, { start: "2026-02-05", length: 5 })).status, 201); // ends 9 Feb
    assert.equal((await get("/api/period", token)).history.length, 3);
  });

  it("one user's periods never block or show up for another", async () => {
    const a = await daysUser();
    const b = await daysUser();
    await startPeriod(a.token, { start: "2026-02-20", length: 14 });
    assert.equal((await startPeriod(b.token, { start: "2026-02-20", length: 14 })).status, 201);
    assert.equal((await get("/api/period", b.token)).history.length, 1);
  });
});

describe("days mode: changing and removing a period", () => {
  let token; let id;
  beforeEach(async () => {
    ({ token } = await daysUser());
    id = (await startPeriod(token, { start: "2026-02-20", length: 14, savingsTarget: 50 })).body.id;
  });
  const patch = (body, t = token, pid = id) => api.call(`/api/period/${pid}`, t, "PATCH", { today: TODAY, ...body });

  it("a new length moves the end", async () => {
    const r = await patch({ length: 20 });
    assert.equal(r.status, 200);
    assert.equal(r.body.end, "2026-03-11");
    assert.equal(r.body.start, "2026-02-20");
    assert.equal(r.body.savings, 50);
  });

  it("a new start moves the end with it", async () => {
    const r = await patch({ start: "2026-02-22" });
    assert.equal(r.status, 200);
    assert.equal(r.body.end, "2026-03-07");
    assert.equal(r.body.days, 14);
  });

  it("the savings target can change on its own", async () => {
    const r = await patch({ savingsTarget: 80 });
    assert.equal(r.status, 200);
    assert.equal(r.body.savings, 80);
    assert.equal(r.body.end, "2026-03-05");
  });

  it("refuses changes that break the rules for a new period", async () => {
    for (const body of [{ length: 0 }, { length: 367 }, { start: "2026-03-05" }, { start: "junk" }, { savingsTarget: -1 }]) {
      const r = await patch(body);
      assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    }
    assert.equal((await get("/api/period", token)).current.end, "2026-03-05");
  });

  it("refuses to be stretched or moved over another period", async () => {
    await startPeriod(token, { start: "2026-02-01", length: 10 }); // 1–10 Feb
    const r = await patch({ start: "2026-02-08" });
    assert.ok([400, 409].includes(r.status), `got ${r.status}`);
    assert.equal((await get("/api/period", token)).current.start, "2026-02-20");
  });

  it("is 404 for another user's period, which stays as it was", async () => {
    const other = await daysUser();
    assert.equal((await patch({ length: 3 }, other.token)).status, 404);
    assert.equal((await api.call(`/api/period/${id}`, other.token, "DELETE")).status, 404);
    assert.equal((await get("/api/period", token)).current.days, 14);
  });

  it("is 404 for an unknown id and never a 500 for a malformed one", async () => {
    assert.equal((await patch({ length: 3 }, token, "507f1f77bcf86cd799439011")).status, 404);
    const bad = await patch({ length: 3 }, token, "not-an-id");
    assert.ok([400, 404].includes(bad.status), `got ${bad.status}`);
  });

  it("removing a period keeps its transactions", async () => {
    await api.income(token, "2026-02-20", 700);
    await api.expense(token, "2026-02-25", 35);
    assert.equal((await api.call(`/api/period/${id}`, token, "DELETE")).status, 200);
    assert.equal((await get("/api/period", token)).status, "none");
    assert.equal((await api.call("/api/transactions?start=2026-02-01&end=2026-03-31", token)).body.length, 2);
  });
});

describe("switching modes", () => {
  it("refuses a mode that does not exist", async () => {
    const { token } = await api.makeUser();
    for (const mode of ["weeks", "", null, 1, { $ne: "month" }]) {
      const r = await setMode(token, mode);
      assert.equal(r.status, 400, `mode ${JSON.stringify(mode)} → ${r.status}`);
    }
    assert.equal((await api.call("/api/auth/me", token)).body.budgetMode, "month");
  });

  it("loses nothing: periods and savings survive a round trip", async () => {
    const { token } = await daysUser();
    await startPeriod(token, { start: "2026-02-20", length: 14, savingsTarget: 50 });
    await api.call("/api/auth/savings", token, "PUT", { key: "2026-2", amount: 120 });
    await api.income(token, "2026-02-20", 700);

    await setMode(token, "month");
    const month = await get("/api/auth/home", token);
    assert.equal(month.mode, "month");
    assert.equal(month.period.start, "2026-03-01");
    assert.equal(month.periodSavings, 120);
    assert.equal(month.periodIncome, 0);

    await setMode(token, "days");
    const days = await get("/api/auth/home", token);
    assert.equal(days.period.start, "2026-02-20");
    assert.equal(days.periodSavings, 50);
    assert.equal(days.periodIncome, 700);
  });

  it("month mode on the 1st starts a fresh month: yesterday's entries are last month's", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-02-01", 500);
    await api.expense(token, "2026-02-28", 40);
    const h = await get("/api/auth/home", token);
    assert.equal(h.period.start, "2026-03-01");
    assert.equal(h.period.daysLeft, 31);
    assert.equal(h.periodIncome, 0);
    assert.equal(h.periodExpenses, 0);
  });
});

// ─────────────────────────────── term mode ───────────────────────────────

describe("term mode: a lump sum budgeted a month at a time", () => {
  const MID = "2026-03-10T04:00:00.000Z";
  const D = "2026-03-10";
  // A six-month term from 1 January holding $6,000.
  const sixMonths = async () => {
    api.setNow(MID);
    const u = await termUser();
    const t = await startTerm(u.token, { start: "2026-01-01", months: 6 }, D);
    assert.equal(t.status, 201);
    assert.equal(t.body.end, "2026-06-30");
    await api.income(u.token, "2026-01-01", 6000);
    return u;
  };

  it("the current cycle is this calendar month", async () => {
    const { token } = await sixMonths();
    const p = await get("/api/period", token, D);
    assert.equal(p.mode, "term");
    assert.equal(p.status, "active");
    assert.equal(p.current.start, "2026-03-01");
    assert.equal(p.current.end, "2026-03-31");
    assert.equal(p.current.cycle, 3);
    assert.equal(p.current.cycles, 6);
    assert.equal(p.current.daysLeft, 22);
    assert.equal(p.current.savesTotal, 3);
  });

  it("spending exactly the funding each month leaves the next month unchanged", async () => {
    const { token } = await sixMonths();
    await api.expense(token, "2026-01-15", 1000);
    await api.expense(token, "2026-02-15", 1000);
    near((await get("/api/period", token, D)).current.funding, 1000);
  });

  it("money not spent is spread over the months that remain", async () => {
    const { token } = await sixMonths(); // nothing spent in January or February
    near((await get("/api/period", token, D)).current.funding, 6000 / 4);
  });

  it("overspending shrinks the months that remain", async () => {
    const { token } = await sixMonths();
    await api.expense(token, "2026-01-15", 1400);
    await api.expense(token, "2026-02-15", 920); // February's funding was (6000 − 1400) ÷ 5
    near((await get("/api/period", token, D)).current.funding, (6000 - 1400 - 920) / 4);
  });

  it("a top-up mid-term is spread, not dumped into the month it arrived", async () => {
    const { token } = await sixMonths();
    await api.expense(token, "2026-01-15", 1000);
    await api.expense(token, "2026-02-15", 1000);
    await api.income(token, "2026-03-05", 400);
    near((await get("/api/period", token, D)).current.funding, (4000 + 400) / 4);
  });

  it("the daily budget comes from the funding, though no income landed this month", async () => {
    const { token } = await sixMonths();
    await api.expense(token, "2026-01-15", 1000);
    await api.expense(token, "2026-02-15", 1000);
    const s = await get("/api/streak", token, D);
    assert.equal(s.hasIncome, true);
    near(s.today.budget, 1000 / 22);
    assert.equal(s.overspentBy, 0);
    const h = await get("/api/auth/home", token, D);
    near(h.periodFunding, 1000);
    near(h.leftToSpend, 1000);
  });

  it("home, the streak and the accounts card agree on what is left", async () => {
    const { token } = await sixMonths();
    await api.expense(token, "2026-01-15", 1000);
    await api.expense(token, "2026-02-15", 1000);
    await api.expense(token, "2026-03-04", 123.45);
    await api.call("/api/auth/savings", token, "PUT", { key: "2026-2", amount: 200 });
    const h = await get("/api/auth/home", token, D);
    const s = await get("/api/streak", token, D);
    const a = await get("/api/accounts", token, D);
    near(h.leftToSpend, 1000 - 123.45 - 200);
    near(s.leftToSpend, h.leftToSpend);
    near(a.totals.leftToSpend, h.leftToSpend);
    near(a.totals.funding, 1000);
  });

  it("a finished month's savings target leaves the pot", async () => {
    const { token } = await sixMonths();
    await api.call("/api/auth/savings", token, "PUT", { key: "2026-0", amount: 100 });
    await api.call("/api/auth/savings", token, "PUT", { key: "2026-1", amount: 0 });
    await api.call("/api/auth/savings", token, "PUT", { key: "2026-2", amount: 0 });
    await api.expense(token, "2026-01-15", 900);  // January's budget: 1000 − 100
    await api.expense(token, "2026-02-15", 1000); // February's funding: (6000 − 900 − 100) ÷ 5
    const p = await get("/api/period", token, D);
    near(p.current.funding, 1000);
    near(p.term.saved, 100);
  });

  it("the term's own totals are income in, money spent and what is left", async () => {
    const { token } = await sixMonths();
    await api.expense(token, "2026-01-15", 1000);
    await api.expense(token, "2026-03-02", 250);
    const { term } = await get("/api/period", token, D);
    assert.equal(term.income, 6000);
    assert.equal(term.spent, 1250);
    near(term.left, 6000 - 1250 - term.saved);
  });

  it("the streak is judged against each month's funding, not the month's income", async () => {
    const { token } = await sixMonths();
    // Without term mode, February has no income, so any spending would break it.
    await api.expense(token, "2026-02-10", 20);
    const s = await get("/api/streak", token, D);
    assert.equal(s.currentStreak, 31 + 28 + 10);
  });

  it("all-time savings stop before the running cycle", async () => {
    const { token } = await sixMonths();
    assert.equal((await get("/api/summary/lifetime", token, D)).through, "2026-02-28");
  });
});

describe("term mode on the 1st of a month", () => {
  it("rolls into the new month's cycle with the full month ahead", async () => {
    const { token } = await termUser();
    await startTerm(token, { start: "2026-01-01", months: 6 });
    await api.income(token, "2026-01-01", 6000);
    await api.expense(token, "2026-01-15", 1000);
    await api.expense(token, "2026-02-15", 1000);
    const p = await get("/api/period", token);
    assert.equal(p.status, "active");
    assert.equal(p.current.start, "2026-03-01");
    assert.equal(p.current.cycle, 3);
    assert.equal(p.current.daysLeft, 31);
    near(p.current.funding, 1000);
    const s = await get("/api/streak", token);
    assert.equal(s.hasIncome, true);
    near(s.today.budget, 1000 / 31);
    const h = await get("/api/auth/home", token);
    assert.equal(h.period.start, "2026-03-01");
    near(h.leftToSpend, 1000);
  });

  it("the last cycle gets everything still in the pot", async () => {
    const { token } = await termUser();
    await startTerm(token, { start: "2025-10-01", months: 6 }); // ends 31 March
    await api.income(token, "2025-10-01", 6000);
    for (const day of ["2025-10-10", "2025-11-10", "2025-12-10", "2026-01-10", "2026-02-10"]) await api.expense(token, day, 1100);
    const p = await get("/api/period", token);
    assert.equal(p.current.cycle, 6);
    near(p.current.funding, 500);
  });

  it("the day after a term ends, it has lapsed", async () => {
    const { token } = await termUser();
    await startTerm(token, { start: "2025-12-01", months: 3 }); // ends 28 February
    await api.income(token, "2025-12-01", 3000);
    const p = await get("/api/period", token);
    assert.equal(p.status, "lapsed");
    assert.equal(p.current, null);
    assert.equal((await get("/api/streak", token)).today.budget, 0);
  });
});

describe("term mode: a term that starts and ends mid-month", () => {
  it("has a clipped first and last cycle, weighted by their share of the month", async () => {
    api.setNow("2026-01-20T04:00:00.000Z");
    const { token } = await termUser();
    const t = await startTerm(token, { start: "2026-01-15", months: 3 }, "2026-01-20");
    assert.equal(t.status, 201);
    assert.equal(t.body.end, "2026-04-14");
    await api.income(token, "2026-01-15", 3000);
    const p = await get("/api/period", token, "2026-01-20");
    assert.equal(p.current.start, "2026-01-15");
    assert.equal(p.current.end, "2026-01-31");
    assert.equal(p.current.days, 17);
    assert.equal(p.current.cycle, 1);
    assert.equal(p.current.cycles, 4);
    const weights = [17 / 31, 1, 1, 14 / 30];
    near(p.current.funding, (3000 * weights[0]) / weights.reduce((a, b) => a + b, 0));
  });
});

describe("term mode: starting, changing and removing a term", () => {
  it("returns the term's window", async () => {
    const { token } = await termUser();
    const r = await startTerm(token, { start: "2026-03-01", months: 4 });
    assert.equal(r.status, 201);
    assert.equal(r.body.start, "2026-03-01");
    assert.equal(r.body.end, "2026-06-30");
    assert.equal(r.body.months, 4);
  });

  it("refuses a bad length", async () => {
    const { token } = await termUser();
    for (const months of [0, -1, 13, 1.5, "abc", null, undefined]) {
      const r = await startTerm(token, { start: "2026-03-01", months });
      assert.equal(r.status, 400, `months ${JSON.stringify(months)} → ${r.status}`);
    }
  });

  it("refuses a future or malformed start", async () => {
    const { token } = await termUser();
    for (const start of ["2026-03-05", "2027-01-01", "junk", "2026-02-30", null]) {
      const r = await startTerm(token, { start, months: 3 });
      assert.equal(r.status, 400, `start ${JSON.stringify(start)} → ${r.status}`);
    }
  });

  it("refuses a second term that overlaps the first", async () => {
    const { token } = await termUser();
    await startTerm(token, { start: "2026-01-01", months: 6 });
    const r = await startTerm(token, { start: "2026-02-01", months: 2 });
    assert.ok([400, 409].includes(r.status), `got ${r.status}`);
    assert.equal((await get("/api/period", token)).terms.length, 1);
  });

  it("changing the length moves the end", async () => {
    const { token } = await termUser();
    const id = (await startTerm(token, { start: "2026-01-01", months: 6 })).body.id;
    const r = await api.call(`/api/period/term/${id}`, token, "PATCH", { months: 3, today: TODAY });
    assert.equal(r.status, 200);
    assert.equal(r.body.end, "2026-03-31");
    assert.equal((await get("/api/period", token)).current.cycles, 3);
  });

  it("removing a term keeps its transactions and leaves nothing running", async () => {
    const { token } = await termUser();
    const id = (await startTerm(token, { start: "2026-01-01", months: 6 })).body.id;
    await api.income(token, "2026-01-01", 6000);
    assert.equal((await api.call(`/api/period/term/${id}`, token, "DELETE")).status, 200);
    assert.equal((await get("/api/period", token)).status, "none");
    assert.equal((await api.call("/api/transactions?start=2026-01-01&end=2026-01-31", token)).body.length, 1);
  });

  it("is 404 for another user's term", async () => {
    const a = await termUser();
    const b = await termUser();
    const id = (await startTerm(a.token, { start: "2026-01-01", months: 6 })).body.id;
    assert.equal((await api.call(`/api/period/term/${id}`, b.token, "PATCH", { months: 2, today: TODAY })).status, 404);
    assert.equal((await api.call(`/api/period/term/${id}`, b.token, "DELETE")).status, 404);
    assert.equal((await get("/api/period", a.token)).term.months, 6);
  });
});
