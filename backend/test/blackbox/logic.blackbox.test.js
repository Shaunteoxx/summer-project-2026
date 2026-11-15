// Black-box tests for the backend's pure logic.
//
// Written from the function names, their parameter lists and the documented
// behaviour (README design notes, HANDOFF.md, ACCOUNTS_PLAN.md) — not from the
// implementations. Each expectation is what the app is *meant* to do; a failure
// here is either a real bug or a place where the docs and the code disagree.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.JWT_SECRET ||= "test-jwt-secret-at-least-32-characters-long";
process.env.NODE_ENV ||= "development";

const period = await import("../../lib/period.js");
const validation = await import("../../lib/validation.js");
const entry = await import("../../lib/entryFields.js");
const budget = await import("../../lib/budget.js");
const localTime = await import("../../lib/localTime.js");
const recurring = await import("../../lib/recurring.js");
const savingsCarry = await import("../../lib/savingsCarry.js");
const auth = await import("../../middleware/auth.js");
const { asyncHandler } = await import("../../middleware/asyncHandler.js");

const todayYmd = () => new Date().toISOString().slice(0, 10);
const shift = (n) => period.addDaysYmd(todayYmd(), n);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// ───────────────────────────── lib/period.js ─────────────────────────────

describe("period: date helpers", () => {
  it("pad zero-pads to two digits", () => {
    assert.equal(period.pad(3), "03");
    assert.equal(period.pad(0), "00");
    assert.equal(period.pad(12), "12");
  });

  it("daysInMonth knows every month length (0-based month)", () => {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    lengths.forEach((n, m) => assert.equal(period.daysInMonth(2026, m), n, `month ${m}`));
  });

  it("daysInMonth follows the leap-year rule, including century years", () => {
    assert.equal(period.daysInMonth(2024, 1), 29);
    assert.equal(period.daysInMonth(2026, 1), 28);
    assert.equal(period.daysInMonth(2000, 1), 29); // divisible by 400
    assert.equal(period.daysInMonth(2100, 1), 28); // divisible by 100 only
  });

  it("dayFromYmd is UTC midnight and ymdOf is its inverse", () => {
    const d = period.dayFromYmd("2026-03-05");
    assert.equal(d.toISOString(), "2026-03-05T00:00:00.000Z");
    assert.equal(period.ymdOf(d), "2026-03-05");
    for (const k of ["2024-02-29", "2026-12-31", "2026-01-01"]) {
      assert.equal(period.ymdOf(period.dayFromYmd(k)), k);
    }
  });

  it("ymdOf keys by the UTC day, never the local one", () => {
    assert.equal(period.ymdOf(new Date("2026-03-05T23:59:59.999Z")), "2026-03-05");
    assert.equal(period.ymdOf(new Date("2026-03-05T00:00:00.000Z")), "2026-03-05");
  });

  it("addDays does not mutate its input", () => {
    const d = new Date("2026-03-05T00:00:00.000Z");
    const next = period.addDays(d, 1);
    assert.equal(next.toISOString(), "2026-03-06T00:00:00.000Z");
    assert.equal(d.toISOString(), "2026-03-05T00:00:00.000Z");
  });

  it("addDaysYmd crosses month, year and leap-day boundaries", () => {
    assert.equal(period.addDaysYmd("2026-01-31", 1), "2026-02-01");
    assert.equal(period.addDaysYmd("2026-12-31", 1), "2027-01-01");
    assert.equal(period.addDaysYmd("2026-01-01", -1), "2025-12-31");
    assert.equal(period.addDaysYmd("2024-02-28", 1), "2024-02-29");
    assert.equal(period.addDaysYmd("2026-02-28", 1), "2026-03-01");
    assert.equal(period.addDaysYmd("2026-03-05", 0), "2026-03-05");
    assert.equal(period.addDaysYmd("2026-03-05", 365), "2027-03-05");
  });

  it("daysBetween counts the days a span covers, both ends included", () => {
    assert.equal(period.daysBetween("2026-03-01", "2026-03-10"), 10);
    assert.equal(period.daysBetween("2026-03-05", "2026-03-05"), 1);
    assert.equal(period.daysBetween("2024-02-28", "2024-03-01"), 3);
    assert.equal(period.daysBetween("2026-02-28", "2026-03-01"), 2);
    assert.equal(period.daysBetween("2026-01-01", "2026-12-31"), 365);
    assert.equal(period.daysBetween("2024-01-01", "2024-12-31"), 366);
  });

  it("periodEnd is inclusive: a 1-day period ends the day it starts", () => {
    assert.equal(period.periodEnd("2026-03-01", 1), "2026-03-01");
    assert.equal(period.periodEnd("2026-03-01", 10), "2026-03-10");
    assert.equal(period.periodEnd("2026-03-01", 31), "2026-03-31");
    assert.equal(period.periodEnd("2026-01-20", 14), "2026-02-02");
    assert.equal(period.periodEnd("2026-01-01", 365), "2026-12-31");
  });

  it("a period's length equals the days its span covers", () => {
    for (const len of [1, 7, 14, 30, 45, 180, 366]) {
      const end = period.periodEnd("2026-06-17", len);
      assert.equal(period.daysBetween("2026-06-17", end), len);
    }
  });

  it("addMonthsYmd keeps the day, clamping to shorter months", () => {
    assert.equal(period.addMonthsYmd("2026-03-15", 1), "2026-04-15");
    assert.equal(period.addMonthsYmd("2026-01-31", 1), "2026-02-28");
    assert.equal(period.addMonthsYmd("2024-01-31", 1), "2024-02-29");
    assert.equal(period.addMonthsYmd("2026-03-31", 1), "2026-04-30");
    assert.equal(period.addMonthsYmd("2026-11-15", 2), "2027-01-15");
    assert.equal(period.addMonthsYmd("2026-01-15", 12), "2027-01-15");
    assert.equal(period.addMonthsYmd("2026-03-15", 0), "2026-03-15");
  });

  it("termEnd is the day before the same date N months on", () => {
    assert.equal(period.termEnd("2026-01-01", 6), "2026-06-30");
    assert.equal(period.termEnd("2026-01-15", 3), "2026-04-14");
    assert.equal(period.termEnd("2026-09-01", 1), "2026-09-30");
    assert.equal(period.termEnd("2026-09-01", 12), "2027-08-31");
  });

  it("limits are the documented ones", () => {
    assert.equal(period.MIN_PERIOD_DAYS, 1);
    assert.equal(period.MAX_PERIOD_DAYS, 366);
    assert.equal(period.MIN_TERM_MONTHS, 1);
    assert.equal(period.MAX_TERM_MONTHS, 12);
  });
});

describe("period: savesForPeriod — max(1, round(3 × days / 30))", () => {
  it("gives three per thirty days", () => {
    assert.equal(period.savesForPeriod(30), 3);
    assert.equal(period.savesForPeriod(28), 3);
    assert.equal(period.savesForPeriod(31), 3);
    assert.equal(period.savesForPeriod(60), 6);
    assert.equal(period.savesForPeriod(180), 18);
  });

  it("never drops below one, however short the period", () => {
    for (const d of [1, 2, 3, 5, 7, 10, 14]) assert.equal(period.savesForPeriod(d), 1, `days=${d}`);
  });

  it("scales for odd lengths", () => {
    assert.equal(period.savesForPeriod(15), 2); // 1.5 rounds up
    assert.equal(period.savesForPeriod(20), 2);
    assert.equal(period.savesForPeriod(366), 37);
  });
});

describe("period: monthPeriodOf", () => {
  it("is the whole calendar month a date falls in", () => {
    const p = period.monthPeriodOf("2026-02-10", {});
    assert.equal(p.start, "2026-02-01");
    assert.equal(p.end, "2026-02-28");
    assert.equal(p.days, 28);
  });

  it("holds on the first and last day of the month", () => {
    assert.equal(period.monthPeriodOf("2026-03-01", {}).start, "2026-03-01");
    assert.equal(period.monthPeriodOf("2026-03-01", {}).end, "2026-03-31");
    assert.equal(period.monthPeriodOf("2026-03-31", {}).start, "2026-03-01");
    assert.equal(period.monthPeriodOf("2026-12-31", {}).end, "2026-12-31");
    assert.equal(period.monthPeriodOf("2027-01-01", {}).start, "2027-01-01");
  });

  it("gives a leap February 29 days", () => {
    const p = period.monthPeriodOf("2024-02-29", {});
    assert.equal(p.end, "2024-02-29");
    assert.equal(p.days, 29);
  });

  it("reads the savings target from the 0-based YYYY-M key", () => {
    assert.equal(period.monthPeriodOf("2026-02-10", { "2026-1": 50 }).savings, 50);
    assert.equal(period.monthPeriodOf("2026-01-10", { "2026-0": 75 }).savings, 75);
    assert.equal(period.monthPeriodOf("2026-12-10", { "2026-11": 20 }).savings, 20);
  });

  it("does not borrow another month's target", () => {
    assert.equal(period.monthPeriodOf("2026-03-10", { "2026-1": 50, "2026-3": 80 }).savings, 0);
    // "2026-2" (March, 0-based) must not be confused with February.
    assert.equal(period.monthPeriodOf("2026-02-10", { "2026-2": 99 }).savings, 0);
  });

  it("carries no funding — that is a term-mode idea", () => {
    assert.equal(period.monthPeriodOf("2026-02-10", {}).funding, null);
  });
});

describe("period: daysLeftInPeriod counts today", () => {
  const march = { start: "2026-03-01", end: "2026-03-31", days: 31 };

  it("is the full length on the first day and 1 on the last", () => {
    assert.equal(period.daysLeftInPeriod("2026-03-01", march), 31);
    assert.equal(period.daysLeftInPeriod("2026-03-31", march), 1);
    assert.equal(period.daysLeftInPeriod("2026-03-10", march), 22);
  });

  it("is zero once the period is over, and with no period at all", () => {
    assert.equal(period.daysLeftInPeriod("2026-04-01", march), 0);
    assert.equal(period.daysLeftInPeriod("2026-06-01", march), 0);
    assert.equal(period.daysLeftInPeriod("2026-03-10", null), 0);
  });
});

describe("period: status and history", () => {
  const march = { start: "2026-03-01", end: "2026-03-10", days: 10 };

  it("is active inside a period", () => {
    assert.equal(period.periodStatus("2026-03-05", march, [march]), "active");
  });

  it("is lapsed when there was a period and it is over", () => {
    assert.equal(period.periodStatus("2026-03-20", null, [march]), "lapsed");
  });

  it("is none when there has never been one", () => {
    assert.equal(period.periodStatus("2026-03-20", null, []), "none");
  });

  it("latestPeriodBefore picks the most recent period that has ended", () => {
    const rows = [
      { start: "2026-01-01", end: "2026-01-10", length: 10 },
      { start: "2026-02-01", end: "2026-02-10", length: 10 },
      { start: "2026-03-01", end: "2026-03-10", length: 10 },
    ];
    assert.equal(period.latestPeriodBefore("2026-02-20", rows).start, "2026-02-01");
    assert.equal(period.latestPeriodBefore("2026-03-20", rows).start, "2026-03-01");
  });

  it("latestPeriodBefore does not depend on the order it is given", () => {
    const rows = [
      { start: "2026-03-01", end: "2026-03-10", length: 10 },
      { start: "2026-01-01", end: "2026-01-10", length: 10 },
      { start: "2026-02-01", end: "2026-02-10", length: 10 },
    ];
    assert.equal(period.latestPeriodBefore("2026-02-20", rows).start, "2026-02-01");
  });

  it("latestPeriodBefore is null when nothing has ended yet", () => {
    assert.equal(period.latestPeriodBefore("2025-12-01", [march]), null);
    assert.equal(period.latestPeriodBefore("2026-03-20", []), null);
  });

  it("toPeriod turns a stored row into the common period shape", () => {
    const p = period.toPeriod({ _id: "abc", start: "2026-03-01", end: "2026-03-10", length: 10, savingsTarget: 25 });
    assert.equal(p.id, "abc");
    assert.equal(p.start, "2026-03-01");
    assert.equal(p.end, "2026-03-10");
    assert.equal(p.days, 10);
    assert.equal(p.savings, 25);
  });
});

describe("period: resolver — (date) → period | null", () => {
  it("month mode resolves every date, to its calendar month", () => {
    const resolve = period.createPeriodResolver({ mode: "month", savingsByMonth: { "2026-2": 100 } });
    const p = resolve("2026-03-17");
    assert.equal(p.start, "2026-03-01");
    assert.equal(p.end, "2026-03-31");
    assert.equal(p.savings, 100);
    assert.ok(resolve("1999-01-01"));
    assert.ok(resolve("2030-12-31"));
  });

  it("month mode ignores stored periods and terms entirely", () => {
    const resolve = period.createPeriodResolver({
      mode: "month",
      periods: [{ _id: "a", start: "2026-03-10", end: "2026-03-12", length: 3, savingsTarget: 9 }],
      terms: [{ _id: "t", start: "2026-03-10", end: "2026-06-09", months: 3 }],
    });
    assert.equal(resolve("2026-03-11").start, "2026-03-01");
    assert.equal(resolve("2026-03-11").end, "2026-03-31");
  });

  const rows = [
    { _id: "a", start: "2026-02-20", end: "2026-03-05", length: 14, savingsTarget: 20 },
    { _id: "b", start: "2026-03-15", end: "2026-03-20", length: 6, savingsTarget: 0 },
  ];

  it("days mode resolves a date inside a period, ends included", () => {
    const resolve = period.createPeriodResolver({ mode: "days", periods: rows });
    assert.equal(resolve("2026-02-20").id, "a");
    assert.equal(resolve("2026-03-05").id, "a");
    assert.equal(resolve("2026-03-15").id, "b");
    assert.equal(resolve("2026-03-20").id, "b");
    assert.equal(resolve("2026-02-20").savings, 20);
    assert.equal(resolve("2026-02-20").days, 14);
  });

  it("days mode keeps a period that spans a month boundary whole", () => {
    const resolve = period.createPeriodResolver({ mode: "days", periods: rows });
    // The 1st of March is still inside the period that began in February.
    const p = resolve("2026-03-01");
    assert.equal(p.id, "a");
    assert.equal(p.start, "2026-02-20");
    assert.equal(p.end, "2026-03-05");
  });

  it("days mode returns null in a gap, before the first and after the last", () => {
    const resolve = period.createPeriodResolver({ mode: "days", periods: rows });
    assert.equal(resolve("2026-02-19"), null);
    assert.equal(resolve("2026-03-06"), null);
    assert.equal(resolve("2026-03-14"), null);
    assert.equal(resolve("2026-03-21"), null);
  });

  it("days mode with no periods never resolves", () => {
    const resolve = period.createPeriodResolver({ mode: "days", periods: [] });
    assert.equal(resolve("2026-03-10"), null);
  });

  it("days mode does not care what order the rows arrive in", () => {
    const resolve = period.createPeriodResolver({ mode: "days", periods: [...rows].reverse() });
    assert.equal(resolve("2026-03-01").id, "a");
    assert.equal(resolve("2026-03-16").id, "b");
    assert.equal(resolve("2026-03-10"), null);
  });

  const term = { _id: "t", start: "2026-01-15", end: "2026-04-14", months: 3 };

  it("term mode resolves to the calendar-month cycle, clipped at both ends", () => {
    const resolve = period.createPeriodResolver({ mode: "term", terms: [term] });
    const first = resolve("2026-01-20");
    assert.equal(first.start, "2026-01-15");
    assert.equal(first.end, "2026-01-31");
    const whole = resolve("2026-02-10");
    assert.equal(whole.start, "2026-02-01");
    assert.equal(whole.end, "2026-02-28");
    const last = resolve("2026-04-14");
    assert.equal(last.start, "2026-04-01");
    assert.equal(last.end, "2026-04-14");
  });

  it("term mode resolves the 1st of a month to that month's cycle", () => {
    const resolve = period.createPeriodResolver({ mode: "term", terms: [term] });
    const p = resolve("2026-03-01");
    assert.equal(p.start, "2026-03-01");
    assert.equal(p.end, "2026-03-31");
    assert.equal(p.days, 31);
  });

  it("term mode returns null outside the term", () => {
    const resolve = period.createPeriodResolver({ mode: "term", terms: [term] });
    assert.equal(resolve("2026-01-14"), null);
    assert.equal(resolve("2026-04-15"), null);
  });
});

describe("period: term cycles", () => {
  it("splits a whole-month term into one cycle per calendar month", () => {
    const cycles = period.cyclesOfTerm({ _id: "t", start: "2026-01-01", end: "2026-06-30", months: 6 }, {});
    assert.equal(cycles.length, 6);
    assert.deepEqual(cycles.map((c) => c.start), ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]);
    assert.deepEqual(cycles.map((c) => c.end), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"]);
    cycles.forEach((c) => assert.equal(c.weight, 1));
  });

  it("cycles tile the term with no gap and no overlap", () => {
    const term = { _id: "t", start: "2026-01-15", end: "2026-04-14", months: 3 };
    const cycles = period.cyclesOfTerm(term, {});
    assert.equal(cycles[0].start, term.start);
    assert.equal(cycles.at(-1).end, term.end);
    for (let i = 1; i < cycles.length; i += 1) {
      assert.equal(cycles[i].start, period.addDaysYmd(cycles[i - 1].end, 1));
    }
    const total = cycles.reduce((n, c) => n + c.days, 0);
    assert.equal(total, period.daysBetween(term.start, term.end));
  });

  it("weights a clipped cycle by its share of the calendar month", () => {
    const cycles = period.cyclesOfTerm({ _id: "t", start: "2026-01-15", end: "2026-04-14", months: 3 }, {});
    near(cycles[0].weight, 17 / 31);
    assert.equal(cycles[1].weight, 1);
    assert.equal(cycles[2].weight, 1);
    near(cycles[3].weight, 14 / 30);
  });

  it("remainingWeight is this cycle's weight plus every later one's", () => {
    const cycles = period.cyclesOfTerm({ _id: "t", start: "2026-01-15", end: "2026-04-14", months: 3 }, {});
    cycles.forEach((c, i) => {
      const rest = cycles.slice(i).reduce((n, x) => n + x.weight, 0);
      near(c.remainingWeight, rest);
    });
    near(cycles.at(-1).remainingWeight, cycles.at(-1).weight);
  });

  it("takes each cycle's savings target from that calendar month", () => {
    const cycles = period.cyclesOfTerm(
      { _id: "t", start: "2026-01-01", end: "2026-03-31", months: 3 },
      { "2026-0": 100, "2026-2": 50 }
    );
    assert.deepEqual(cycles.map((c) => c.savings), [100, 0, 50]);
  });

  it("handles a term that crosses the year end", () => {
    const cycles = period.cyclesOfTerm({ _id: "t", start: "2026-11-01", end: "2027-02-28", months: 4 }, { "2027-0": 30 });
    assert.deepEqual(cycles.map((c) => c.start), ["2026-11-01", "2026-12-01", "2027-01-01", "2027-02-01"]);
    assert.equal(cycles[2].savings, 30);
  });
});

describe("period: term funding — pot × weight / Σ remaining weights", () => {
  const cycles = period.cyclesOfTerm({ _id: "t", start: "2026-01-01", end: "2026-06-30", months: 6 }, {});

  it("gives whole months equal money", () => {
    near(period.fundingFor(cycles[0], 6000), 1000);
  });

  it("gives the last cycle everything still in the pot", () => {
    near(period.fundingFor(cycles.at(-1), 1234.56), 1234.56);
  });

  it("is zero for an empty pot", () => {
    assert.equal(period.fundingFor(cycles[0], 0), 0);
  });

  it("spending exactly the funding leaves every later cycle unchanged", () => {
    let pot = 6000;
    const funded = cycles.map((c) => {
      const f = period.fundingFor(c, pot);
      pot -= f; // spend exactly what was funded
      return f;
    });
    funded.forEach((f) => near(f, 1000, 1e-6));
    near(pot, 0, 1e-6);
  });

  it("overspending shrinks later cycles; underspending grows them", () => {
    const first = period.fundingFor(cycles[0], 6000);
    const afterOverspend = period.fundingFor(cycles[1], 6000 - (first + 500));
    const afterUnderspend = period.fundingFor(cycles[1], 6000 - (first - 500));
    assert.ok(afterOverspend < 1000);
    assert.ok(afterUnderspend > 1000);
    near(afterOverspend, 900);
    near(afterUnderspend, 1100);
  });

  it("a clipped first cycle takes proportionally less", () => {
    const stub = period.cyclesOfTerm({ _id: "t", start: "2026-01-15", end: "2026-04-14", months: 3 }, {});
    const pot = 3000;
    const first = period.fundingFor(stub[0], pot);
    const second = period.fundingFor(stub[1], pot - first);
    near(first / second, 17 / 31, 1e-4);
  });
});

describe("period: setAsideFor — a finished cycle's target leaves the pot", () => {
  it("is the target when the cycle held at least that much", () => {
    assert.equal(period.setAsideFor({ savings: 100 }, 250), 100);
    assert.equal(period.setAsideFor({ savings: 100 }, 100), 100);
  });

  it("is never more than what was actually held", () => {
    assert.equal(period.setAsideFor({ savings: 100 }, 40), 40);
  });

  it("is never negative", () => {
    assert.equal(period.setAsideFor({ savings: 100 }, -30), 0);
    assert.equal(period.setAsideFor({ savings: 100 }, 0), 0);
  });

  it("is zero with no target", () => {
    assert.equal(period.setAsideFor({ savings: 0 }, 500), 0);
  });
});

// ─────────────────────────── lib/validation.js ───────────────────────────

describe("validation: roundMoney", () => {
  it("rounds to two decimal places", () => {
    assert.equal(validation.roundMoney(12.344), 12.34);
    assert.equal(validation.roundMoney(12.346), 12.35);
    assert.equal(validation.roundMoney(10), 10);
    assert.equal(validation.roundMoney(0), 0);
  });

  it("is not fooled by binary floating point", () => {
    assert.equal(validation.roundMoney(0.1 + 0.2), 0.3);
    assert.equal(validation.roundMoney(1.005), 1.01);
    assert.equal(validation.roundMoney(12.345), 12.35);
    assert.equal(validation.roundMoney(2.675), 2.68);
    assert.equal(validation.roundMoney(1.15), 1.15);
  });

  it("rounds negatives too", () => {
    assert.equal(validation.roundMoney(-12.346), -12.35);
    assert.equal(validation.roundMoney(-0.1 - 0.2), -0.3);
  });
});

describe("validation: parseYmd", () => {
  it("parses a real date to UTC midnight", () => {
    assert.equal(validation.parseYmd("2026-03-05").toISOString(), "2026-03-05T00:00:00.000Z");
    assert.equal(validation.parseYmd("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  });

  it("rejects dates that do not exist", () => {
    assert.equal(validation.parseYmd("2026-02-30"), null);
    assert.equal(validation.parseYmd("2026-02-29"), null); // not a leap year
    assert.equal(validation.parseYmd("2026-13-01"), null);
    assert.equal(validation.parseYmd("2026-00-10"), null);
    assert.equal(validation.parseYmd("2026-04-31"), null);
    assert.equal(validation.parseYmd("2026-01-00"), null);
  });

  it("rejects anything that is not YYYY-MM-DD", () => {
    for (const bad of ["", "nope", "2026-3-5", "05-03-2026", "2026/03/05", "20260305", "2026-03-05T10:00:00Z", " 2026-03-05", null, undefined, 20260305, {}, []]) {
      assert.equal(validation.parseYmd(bad), null, `input ${JSON.stringify(bad)}`);
    }
  });
});

describe("validation: ymd / utcToday", () => {
  it("ymd formats by the UTC day", () => {
    assert.equal(validation.ymd(new Date("2026-03-05T23:59:59Z")), "2026-03-05");
    assert.equal(validation.ymd(new Date("2026-03-05T16:30:00+08:00")), "2026-03-05");
    assert.equal(validation.ymd(new Date("2026-03-06T00:30:00+08:00")), "2026-03-05");
  });

  it("utcToday is today at UTC midnight", () => {
    const t = validation.utcToday();
    assert.equal(t.toISOString(), `${todayYmd()}T00:00:00.000Z`);
  });
});

describe("validation: parseTransactionDate", () => {
  it("accepts today and past dates, as UTC midnight", () => {
    assert.equal(validation.parseTransactionDate(todayYmd()).toISOString(), `${todayYmd()}T00:00:00.000Z`);
    assert.ok(validation.parseTransactionDate(shift(-1)));
    assert.ok(validation.parseTransactionDate(shift(-400)));
    assert.ok(validation.parseTransactionDate("2024-02-29"));
  });

  it("accepts tomorrow, since a client east of UTC is already there", () => {
    // 01:00 in Singapore on the 15th is still the 14th in UTC.
    assert.ok(validation.parseTransactionDate(shift(1)));
  });

  it("refuses the future beyond that", () => {
    assert.equal(validation.parseTransactionDate(shift(2)), null);
    assert.equal(validation.parseTransactionDate(shift(30)), null);
  });

  it("refuses years outside the supported range", () => {
    assert.equal(validation.parseTransactionDate(`${validation.MIN_YEAR - 1}-06-15`), null);
    assert.equal(validation.parseTransactionDate("1970-01-01"), null);
    assert.ok(validation.parseTransactionDate(`${validation.MIN_YEAR}-01-01`));
  });

  it("refuses garbage and impossible dates", () => {
    for (const bad of ["nope", "2026-02-30", "2026-13-01", 12345, "2026-3-5"]) {
      assert.equal(validation.parseTransactionDate(bad), null, `input ${JSON.stringify(bad)}`);
    }
  });

  it("defaults to today when no date is sent", () => {
    assert.equal(validation.ymd(validation.parseTransactionDate(undefined)), todayYmd());
  });

  it("the supported year range reaches the current year", () => {
    const year = new Date().getUTCFullYear();
    assert.ok(validation.MIN_YEAR <= year);
    assert.ok(validation.MAX_YEAR >= year);
  });
});

describe("validation: resolveClientToday", () => {
  it("accepts the client's date within a day of the server's", () => {
    for (const n of [-1, 0, 1]) {
      assert.equal(validation.ymd(validation.resolveClientToday(shift(n))), shift(n));
    }
  });

  it("refuses a date further out — the client cannot move the clock", () => {
    assert.equal(validation.resolveClientToday(shift(2)), null);
    assert.equal(validation.resolveClientToday(shift(-2)), null);
    assert.equal(validation.resolveClientToday("2020-01-01"), null);
    assert.equal(validation.resolveClientToday("2099-01-01"), null);
  });

  it("falls back to the server's today when nothing is sent", () => {
    assert.equal(validation.ymd(validation.resolveClientToday(undefined)), todayYmd());
  });

  it("refuses a malformed date rather than guessing", () => {
    assert.equal(validation.resolveClientToday("junk"), null);
    assert.equal(validation.resolveClientToday("2026-02-30"), null);
  });
});

describe("validation: parseMonthYear (0-based month)", () => {
  it("parses numeric strings", () => {
    assert.deepEqual(validation.parseMonthYear({ month: "0", year: "2026" }), { month: 0, year: 2026 });
    assert.deepEqual(validation.parseMonthYear({ month: "11", year: "2026" }), { month: 11, year: 2026 });
  });

  it("rejects an out-of-range month", () => {
    assert.equal(validation.parseMonthYear({ month: "12", year: "2026" }), null);
    assert.equal(validation.parseMonthYear({ month: "-1", year: "2026" }), null);
  });

  it("rejects an out-of-range year", () => {
    assert.equal(validation.parseMonthYear({ month: "3", year: String(validation.MIN_YEAR - 1) }), null);
    assert.equal(validation.parseMonthYear({ month: "3", year: String(validation.MAX_YEAR + 1) }), null);
  });

  it("rejects fractional and non-numeric input", () => {
    for (const q of [{ month: "abc", year: "2026" }, { month: "3", year: "abc" }, { month: "1.5", year: "2026" }, { month: "3", year: "2026.5" }]) {
      assert.equal(validation.parseMonthYear(q), null, JSON.stringify(q));
    }
  });

  it("defaults to the current month when nothing is asked for", () => {
    const now = new Date();
    assert.deepEqual(validation.parseMonthYear({}), { month: now.getUTCMonth(), year: now.getUTCFullYear() });
  });
});

describe("validation: HEX_COLOR", () => {
  it("accepts six-digit hex in either case", () => {
    assert.ok(validation.HEX_COLOR.test("#aabbcc"));
    assert.ok(validation.HEX_COLOR.test("#AABBCC"));
    assert.ok(validation.HEX_COLOR.test("#012345"));
  });

  it("rejects everything else", () => {
    for (const bad of ["aabbcc", "#aabbc", "#aabbccd", "#gggggg", "red", "", "#aabbcc; background:url(x)", "javascript:#aabbcc"]) {
      assert.equal(validation.HEX_COLOR.test(bad), false, bad);
    }
  });
});

// ─────────────────────────── lib/entryFields.js ──────────────────────────

describe("entry fields: constants", () => {
  it("has the fixed categories the app documents", () => {
    assert.deepEqual(entry.ENTRY_TYPES, ["income", "expense"]);
    assert.deepEqual(entry.FIXED_CATEGORIES.expense, ["F & B", "Transport", "Shopping", "Entertainment", "Travel"]);
    assert.deepEqual(entry.FIXED_CATEGORIES.income, ["Allowance", "Job", "Gifts"]);
    assert.equal(entry.FIXED_CATEGORY_NAMES.length, 8);
  });

  it("has the documented caps", () => {
    assert.equal(entry.MAX_DESCRIPTION, 120);
    assert.equal(entry.MAX_CATEGORY, 40);
    assert.equal(entry.MAX_AMOUNT, 1e9);
  });
});

describe("entry fields: checkAmount", () => {
  it("accepts a positive amount and rounds it to cents", () => {
    assert.deepEqual(entry.checkAmount(12.5), { value: 12.5 });
    assert.deepEqual(entry.checkAmount(12.345), { value: 12.35 });
    assert.deepEqual(entry.checkAmount(0.01), { value: 0.01 });
  });

  it("accepts the cap and refuses anything above it", () => {
    assert.deepEqual(entry.checkAmount(1e9), { value: 1e9 });
    assert.ok(entry.checkAmount(1e9 + 1).message);
    assert.ok(entry.checkAmount(1e12).message);
  });

  it("refuses zero and negatives", () => {
    assert.ok(entry.checkAmount(0).message);
    assert.ok(entry.checkAmount(-1).message);
    assert.ok(entry.checkAmount(-0.01).message);
  });

  it("refuses an amount that rounds down to zero", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, () => {
    // $0.004 is not money. Accepting it would store a $0.00 entry, which the
    // positive-amount rule exists to prevent.
    const r = entry.checkAmount(0.004);
    assert.ok(r.message, `expected a refusal, got ${JSON.stringify(r)}`);
  });

  it("refuses non-finite and non-numeric input", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, () => {
    for (const bad of [NaN, Infinity, -Infinity, "abc", "", null, undefined, {}, [], true]) {
      assert.ok(entry.checkAmount(bad).message, `input ${String(bad)}`);
    }
  });
});

describe("entry fields: checkType", () => {
  it("accepts income and expense only", () => {
    assert.deepEqual(entry.checkType("income"), { value: "income" });
    assert.deepEqual(entry.checkType("expense"), { value: "expense" });
    for (const bad of ["transfer", "Income", "EXPENSE", "", null, undefined, 1]) {
      assert.ok(entry.checkType(bad).message, `input ${String(bad)}`);
    }
  });
});

describe("entry fields: checkDescription", () => {
  it("trims and returns the text", () => {
    assert.deepEqual(entry.checkDescription("  Lunch  "), { value: "Lunch" });
  });

  it("allows exactly the cap and refuses one past it", () => {
    assert.equal(entry.checkDescription("x".repeat(120)).value.length, 120);
    assert.ok(entry.checkDescription("x".repeat(121)).message);
  });

  it("refuses empty, whitespace-only and non-string input", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, () => {
    for (const bad of ["", "   ", null, undefined, 42, {}, []]) {
      assert.ok(entry.checkDescription(bad).message, `input ${JSON.stringify(bad)}`);
    }
  });
});

describe("entry fields: categories", () => {
  const user = {
    customCategories: [
      { name: "Pets", type: "expense", color: "#aabbcc" },
      { name: "Tutoring", type: "income", color: "#aabbcc" },
    ],
    accounts: [],
  };

  it("accepts a fixed category of the right type", () => {
    assert.deepEqual(entry.checkCategory(user, "expense", "Transport"), { value: "Transport" });
    assert.deepEqual(entry.checkCategory(user, "income", "Job"), { value: "Job" });
  });

  it("refuses a fixed category of the other type", () => {
    assert.ok(entry.checkCategory(user, "expense", "Allowance").message);
    assert.ok(entry.checkCategory(user, "income", "Transport").message);
    assert.equal(entry.categoryAllowed(user, "expense", "Job"), false);
  });

  it("accepts the user's own custom category, for its own type only", () => {
    assert.deepEqual(entry.checkCategory(user, "expense", "Pets"), { value: "Pets" });
    assert.deepEqual(entry.checkCategory(user, "income", "Tutoring"), { value: "Tutoring" });
    assert.ok(entry.checkCategory(user, "income", "Pets").message);
    assert.ok(entry.checkCategory(user, "expense", "Tutoring").message);
  });

  it("refuses unknown, empty and non-string categories", () => {
    for (const bad of ["Nope", "", null, undefined, 5, "x".repeat(41)]) {
      assert.ok(entry.checkCategory(user, "expense", bad).message, `input ${JSON.stringify(bad)}`);
    }
  });

  it("works for a user with no custom categories at all", () => {
    assert.equal(entry.categoryAllowed({ customCategories: [] }, "expense", "F & B"), true);
    assert.equal(entry.categoryAllowed({ customCategories: [] }, "expense", "Pets"), false);
  });
});

describe("entry fields: checkAccountId", () => {
  const live = "507f1f77bcf86cd799439011";
  const archived = "507f1f77bcf86cd799439012";
  const user = {
    customCategories: [],
    accounts: [
      { _id: live, name: "DBS", color: "#aabbcc", archived: false },
      { _id: archived, name: "Old", color: "#aabbcc", archived: true },
    ],
  };

  it("treats an absent or null id as no account", () => {
    assert.deepEqual(entry.checkAccountId(user, undefined), { ok: true, value: null });
    assert.deepEqual(entry.checkAccountId(user, null), { ok: true, value: null });
  });

  it("accepts one of the user's live accounts", () => {
    const r = entry.checkAccountId(user, live);
    assert.equal(r.ok, true);
    assert.equal(String(r.value), live);
  });

  it("refuses an archived account", () => {
    assert.equal(entry.checkAccountId(user, archived).ok, false);
  });

  it("refuses an unknown or malformed id", () => {
    assert.equal(entry.checkAccountId(user, "507f1f77bcf86cd799439099").ok, false);
    assert.equal(entry.checkAccountId(user, "abc").ok, false);
    assert.equal(entry.checkAccountId(user, 12345).ok, false);
    assert.equal(entry.checkAccountId(user, { $ne: null }).ok, false);
  });
});

describe("entry fields: paid back", () => {
  const user = { customCategories: [], accounts: [] };

  it("defaults to nothing paid back", () => {
    assert.deepEqual(entry.checkPaidBack(user, { type: "expense", rawPaidBack: undefined }), {
      value: { paidBack: 0, paidBackAccountId: null },
    });
  });

  it("accepts an amount on an expense", () => {
    assert.equal(entry.checkPaidBack(user, { type: "expense", rawPaidBack: 5 }).value.paidBack, 5);
    assert.equal(entry.checkPaidBack(user, { type: "expense", rawPaidBack: 0 }).value.paidBack, 0);
  });

  it("refuses a negative, non-finite or absurd amount", () => {
    for (const bad of [-5, NaN, Infinity, 1e12, "abc"]) {
      assert.ok(entry.checkPaidBack(user, { type: "expense", rawPaidBack: bad }).message, `input ${String(bad)}`);
    }
  });

  it("only an expense can be paid back", () => {
    assert.ok(entry.checkPaidBack(user, { type: "income", rawPaidBack: 5 }).message);
  });

  it("an expense counts net of what was paid back", () => {
    assert.equal(entry.spentAmount({ type: "expense", amount: 10, paidBack: 4 }), 6);
    assert.equal(entry.spentAmount({ type: "expense", amount: 10, paidBack: 0 }), 10);
    assert.equal(entry.spentAmount({ type: "expense", amount: 10 }), 10);
    assert.equal(entry.spentAmount({ type: "expense", amount: 10, paidBack: 10 }), 0);
  });

  it("being paid back more than the cost never makes spending negative", () => {
    assert.equal(entry.spentAmount({ type: "expense", amount: 10, paidBack: 14 }), 0);
    assert.equal(entry.extraPaidBack({ type: "expense", amount: 10, paidBack: 14 }), 4);
    assert.equal(entry.incomeAmount({ type: "expense", amount: 10, paidBack: 14 }), 4);
  });

  it("there is no extra when paid back is within the cost", () => {
    assert.equal(entry.extraPaidBack({ type: "expense", amount: 10, paidBack: 4 }), 0);
    assert.equal(entry.extraPaidBack({ type: "expense", amount: 10 }), 0);
    assert.equal(entry.incomeAmount({ type: "expense", amount: 10, paidBack: 4 }), 0);
  });

  it("income counts in full", () => {
    assert.equal(entry.incomeAmount({ type: "income", amount: 100 }), 100);
    assert.equal(entry.extraPaidBack({ type: "income", amount: 100 }), 0);
  });

  it("money is conserved: income − spent equals amount in minus net cost", () => {
    const rows = [
      { type: "expense", amount: 10, paidBack: 4 },
      { type: "expense", amount: 10, paidBack: 14 },
      { type: "expense", amount: 25.5, paidBack: 0 },
      { type: "income", amount: 100 },
    ];
    for (const t of rows) {
      const { income, spent } = budget.sumEntries([t]);
      const expected = t.type === "income" ? t.amount : (t.paidBack || 0) - t.amount;
      near(income - spent, expected);
    }
    const all = budget.sumEntries(rows);
    near(all.income - all.spent, 100 - 6 + 4 - 25.5);
  });
});

// ───────────────────────────── lib/budget.js ─────────────────────────────

describe("budget arithmetic", () => {
  it("sumEntries totals income and spending separately", () => {
    assert.deepEqual(
      budget.sumEntries([
        { type: "income", amount: 100 },
        { type: "income", amount: 50 },
        { type: "expense", amount: 30 },
        { type: "expense", amount: 12.5 },
      ]),
      { income: 150, spent: 42.5 }
    );
  });

  it("sumEntries of nothing is zero, not NaN", () => {
    assert.deepEqual(budget.sumEntries([]), { income: 0, spent: 0 });
  });

  it("sumEntries nets paid-back money off the expense", () => {
    assert.deepEqual(budget.sumEntries([{ type: "expense", amount: 40, paidBack: 15 }]), { income: 0, spent: 25 });
  });

  it("sumEntries counts an over-repayment as income, not negative spending", () => {
    assert.deepEqual(budget.sumEntries([{ type: "expense", amount: 10, paidBack: 14 }]), { income: 4, spent: 0 });
  });

  it("sumEntries does not accumulate floating-point dust", () => {
    const rows = Array.from({ length: 10 }, () => ({ type: "expense", amount: 0.1 }));
    assert.equal(budget.sumEntries(rows).spent, 1);
    assert.equal(budget.sumEntries([{ type: "income", amount: 0.1 }, { type: "income", amount: 0.2 }]).income, 0.3);
  });

  it("grossOf is income, unless a term supplies funding", () => {
    assert.equal(budget.grossOf({ income: 800, funding: null }), 800);
    assert.equal(budget.grossOf({ income: 800, funding: undefined }), 800);
    assert.equal(budget.grossOf({ income: 6000, funding: 1000 }), 1000);
  });

  it("grossOf: a funding of zero is zero, it does not fall back to income", () => {
    assert.equal(budget.grossOf({ income: 500, funding: 0 }), 0);
  });

  it("leftToSpendOf = gross − spent − savings", () => {
    assert.equal(budget.leftToSpendOf({ income: 800, funding: null, spent: 448, savings: 200 }), 152);
    assert.equal(budget.leftToSpendOf({ income: 6000, funding: 1000, spent: 300, savings: 100 }), 600);
  });

  it("leftToSpendOf goes negative when overspent — it is not clamped", () => {
    assert.equal(budget.leftToSpendOf({ income: 100, funding: null, spent: 150, savings: 0 }), -50);
    assert.equal(budget.leftToSpendOf({ income: 0, funding: null, spent: 0, savings: 150 }), -150);
  });

  it("leftToSpendOf stays exact to the cent", () => {
    assert.equal(budget.leftToSpendOf({ income: 724.74, funding: null, spent: 33.59, savings: 150 }), 541.15);
  });
});

// ──────────────────────────── lib/localTime.js ───────────────────────────

describe("local time", () => {
  it("recognises real IANA zones and nothing else", () => {
    assert.equal(localTime.isValidTimeZone("Asia/Singapore"), true);
    assert.equal(localTime.isValidTimeZone("America/New_York"), true);
    assert.equal(localTime.isValidTimeZone("UTC"), true);
    for (const bad of ["Mars/Phobos", "", "Singapore time", null, undefined, 8, {}]) {
      assert.equal(localTime.isValidTimeZone(bad), false, `input ${JSON.stringify(bad)}`);
    }
  });

  it("gives the wall-clock day and hour in the user's zone", () => {
    const at = new Date("2026-03-05T16:30:00Z");
    assert.deepEqual(localTime.localWallClock(at, "Asia/Singapore"), { dayKey: "2026-03-06", hour: 0 });
    assert.deepEqual(localTime.localWallClock(at, "UTC"), { dayKey: "2026-03-05", hour: 16 });
    assert.deepEqual(localTime.localWallClock(at, "America/Los_Angeles"), { dayKey: "2026-03-05", hour: 8 });
  });

  it("reports midnight as hour 0, never 24", () => {
    const { hour, dayKey } = localTime.localWallClock(new Date("2026-03-05T16:00:00Z"), "Asia/Singapore");
    assert.equal(hour, 0);
    assert.equal(dayKey, "2026-03-06");
  });

  it("handles the 8am and 9pm send hours in Singapore", () => {
    assert.equal(localTime.localWallClock(new Date("2026-03-05T00:00:00Z"), "Asia/Singapore").hour, 8);
    assert.equal(localTime.localWallClock(new Date("2026-03-05T13:00:00Z"), "Asia/Singapore").hour, 21);
  });

  it("follows daylight saving", () => {
    // New York: UTC-5 in January, UTC-4 in July.
    assert.equal(localTime.localWallClock(new Date("2026-01-15T13:00:00Z"), "America/New_York").hour, 8);
    assert.equal(localTime.localWallClock(new Date("2026-07-15T12:00:00Z"), "America/New_York").hour, 8);
  });

  it("crosses the year boundary", () => {
    assert.deepEqual(localTime.localWallClock(new Date("2026-12-31T16:00:00Z"), "Asia/Singapore"), {
      dayKey: "2027-01-01",
      hour: 0,
    });
  });
});

// ──────────────────────────── lib/recurring.js ───────────────────────────

describe("recurring: occurrencesFor (after exclusive, through inclusive)", () => {
  const monthly = (dayOfMonth, startKey = "2020-01-01") => ({ frequency: "monthly", dayOfMonth, startKey });
  const weekly = (weekday, startKey = "2020-01-01") => ({ frequency: "weekly", weekday, startKey });

  it("monthly: lands on the same day each month", () => {
    assert.deepEqual(recurring.occurrencesFor(monthly(15), "2026-01-15", "2026-04-15"), ["2026-02-15", "2026-03-15", "2026-04-15"]);
  });

  it("monthly on the 31st uses the last day of shorter months", () => {
    assert.deepEqual(recurring.occurrencesFor(monthly(31), "2026-01-31", "2026-04-30"), ["2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("monthly on the 30th in a leap February lands on the 29th", () => {
    assert.deepEqual(recurring.occurrencesFor(monthly(30), "2024-01-30", "2024-03-30"), ["2024-02-29", "2024-03-30"]);
  });

  it("monthly crosses the year end", () => {
    assert.deepEqual(recurring.occurrencesFor(monthly(1), "2026-11-01", "2027-02-01"), ["2026-12-01", "2027-01-01", "2027-02-01"]);
  });

  it("the day already written is not written again", () => {
    assert.deepEqual(recurring.occurrencesFor(monthly(15), "2026-03-15", "2026-03-15"), []);
    assert.deepEqual(recurring.occurrencesFor(monthly(15), "2026-03-15", "2026-04-14"), []);
  });

  it("a due date that is today is included", () => {
    assert.deepEqual(recurring.occurrencesFor(monthly(15), "2026-03-14", "2026-03-15"), ["2026-03-15"]);
  });

  it("catches up every missed occurrence after a long gap", () => {
    const got = recurring.occurrencesFor(monthly(5), "2026-01-05", "2026-07-20");
    assert.deepEqual(got, ["2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05", "2026-07-05"]);
  });

  it("a rule starting on its own due day fires that day", () => {
    const got = recurring.occurrencesFor(monthly(10, "2026-03-10"), "2026-03-09", "2026-03-31");
    assert.deepEqual(got, ["2026-03-10"]);
  });

  it("weekly: every seven days on the chosen weekday (0 = Sunday)", () => {
    // 2026-03-02 is a Monday.
    assert.deepEqual(recurring.occurrencesFor(weekly(1), "2026-03-01", "2026-03-16"), ["2026-03-02", "2026-03-09", "2026-03-16"]);
    // 2026-03-01 is a Sunday.
    assert.deepEqual(recurring.occurrencesFor(weekly(0), "2026-03-01", "2026-03-15"), ["2026-03-08", "2026-03-15"]);
    assert.deepEqual(recurring.occurrencesFor(weekly(6), "2026-03-01", "2026-03-14"), ["2026-03-07", "2026-03-14"]);
  });

  it("weekly crosses a month and a year boundary", () => {
    // 2026-12-28 is a Monday.
    assert.deepEqual(recurring.occurrencesFor(weekly(1), "2026-12-27", "2027-01-11"), ["2026-12-28", "2027-01-04", "2027-01-11"]);
  });

  it("an empty or backwards window yields nothing", () => {
    assert.deepEqual(recurring.occurrencesFor(monthly(15), "2026-04-01", "2026-03-01"), []);
    assert.deepEqual(recurring.occurrencesFor(weekly(1), "2026-03-02", "2026-03-02"), []);
  });

  it("every occurrence is a real date in ascending order", () => {
    const got = recurring.occurrencesFor(monthly(31), "2025-12-31", "2027-12-31");
    assert.equal(got.length, 24);
    got.forEach((k) => assert.ok(validation.parseYmd(k), k));
    assert.deepEqual([...got].sort(), got);
    assert.equal(new Set(got).size, got.length);
  });
});

// ─────────────────────────── lib/savingsCarry.js ─────────────────────────

describe("savings carry: monthKeyOf uses the legacy 0-based key", () => {
  it("maps a date to YYYY-M", () => {
    assert.equal(savingsCarry.monthKeyOf("2026-01-15"), "2026-0");
    assert.equal(savingsCarry.monthKeyOf("2026-03-05"), "2026-2");
    assert.equal(savingsCarry.monthKeyOf("2026-10-01"), "2026-9");
    assert.equal(savingsCarry.monthKeyOf("2026-12-31"), "2026-11");
  });

  it("agrees with the key monthPeriodOf reads", () => {
    for (const day of ["2026-01-01", "2026-06-30", "2026-12-31", "2024-02-29"]) {
      const key = savingsCarry.monthKeyOf(day);
      assert.equal(period.monthPeriodOf(day, { [key]: 77 }).savings, 77, day);
    }
  });
});

// ───────────────────────────── middleware ────────────────────────────────

describe("auth: session ceiling of 30 days", () => {
  const now = () => Math.floor(Date.now() / 1000);
  const DAY = 86400;

  it("a fresh sign-in is not exhausted", () => {
    assert.equal(auth.sessionExhausted(now()), false);
    assert.equal(auth.sessionExhausted(now() - 29 * DAY), false);
  });

  it("a sign-in older than 30 days is exhausted", () => {
    assert.equal(auth.sessionExhausted(now() - 31 * DAY), true);
    assert.equal(auth.sessionExhausted(1), true);
  });

  it("a token with no sign-in time cannot be trusted", () => {
    assert.equal(auth.sessionExhausted(undefined), true);
    assert.equal(auth.sessionExhausted(null), true);
    assert.equal(auth.sessionExhausted("abc"), true);
  });
});

describe("auth: signToken", () => {
  const user = { _id: "507f1f77bcf86cd799439011", tokenVersion: 3 };
  const decode = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());

  it("issues a three-part JWT signed with HS256", () => {
    const token = auth.signToken(user);
    assert.equal(token.split(".").length, 3);
    const header = JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString());
    assert.equal(header.alg, "HS256");
  });

  it("expires seven days after it is issued", () => {
    const claims = decode(auth.signToken(user));
    assert.equal(claims.exp - claims.iat, 7 * 86400);
  });

  it("carries the token version so sign-out can revoke it", () => {
    assert.equal(decode(auth.signToken(user)).tv, 3);
  });

  it("keeps the original sign-in time across a refresh", () => {
    const authAt = Math.floor(Date.now() / 1000) - 5 * 86400;
    assert.equal(decode(auth.signToken(user, authAt)).authAt, authAt);
  });

  it("never puts the email or Google id in the token", () => {
    const claims = decode(auth.signToken({ ...user, email: "a@example.com", googleId: "g-12345" }));
    const text = JSON.stringify(claims);
    assert.ok(!text.includes("a@example.com"));
    assert.ok(!text.includes("g-12345"));
  });
});

describe("auth: blockDemoMutations", () => {
  const run = (method, isDemo) => {
    const out = { status: null, body: null, nexted: false };
    const res = {
      status(code) { out.status = code; return this; },
      json(body) { out.body = body; return this; },
    };
    auth.blockDemoMutations({ method, user: { isDemo } }, res, () => { out.nexted = true; });
    return out;
  };

  it("lets the demo account read", () => {
    assert.equal(run("GET", true).nexted, true);
  });

  it("refuses every demo write with 403 { demo: true }", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const out = run(method, true);
      assert.equal(out.nexted, false, method);
      assert.equal(out.status, 403, method);
      assert.equal(out.body.demo, true, method);
    }
  });

  it("does not touch real accounts", () => {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"]) {
      const out = run(method, false);
      assert.equal(out.nexted, true, method);
      assert.equal(out.status, null, method);
    }
  });
});

describe("asyncHandler", () => {
  it("passes a rejected promise to next() instead of leaving it unhandled", async () => {
    const boom = new Error("boom");
    let seen;
    await asyncHandler(async () => { throw boom; })({}, {}, (err) => { seen = err; });
    await new Promise((r) => setImmediate(r));
    assert.equal(seen, boom);
  });

  it("does not call next() with an error when the handler succeeds", async () => {
    let called = 0;
    let handled = false;
    await asyncHandler(async () => { handled = true; })({}, {}, (err) => { if (err) called += 1; });
    await new Promise((r) => setImmediate(r));
    assert.equal(handled, true);
    assert.equal(called, 0);
  });

  it("hands the handler req, res and next", async () => {
    const req = {}; const res = {}; const next = () => {};
    let got;
    await asyncHandler(async (...args) => { got = args; })(req, res, next);
    assert.equal(got[0], req);
    assert.equal(got[1], res);
    assert.equal(got[2], next);
  });
});
