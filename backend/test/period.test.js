// Budget period resolution. These are pure functions, so no database here —
// the cases that matter are month/day boundaries, leap years, and the gaps
// that only days mode can produce.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createPeriodResolver,
  daysBetween,
  daysLeftInPeriod,
  latestPeriodBefore,
  monthPeriodOf,
  periodEnd,
  periodStatus,
  savesForPeriod,
} from "../lib/period.js";

const period = (start, length, savingsTarget = 0, _id = start) => ({
  _id,
  start,
  end: periodEnd(start, length),
  length,
  savingsTarget,
});

describe("day arithmetic", () => {
  it("counts an inclusive span", () => {
    assert.equal(daysBetween("2026-08-01", "2026-08-01"), 1);
    assert.equal(daysBetween("2026-08-01", "2026-08-15"), 15);
  });

  it("crosses month and year boundaries", () => {
    assert.equal(daysBetween("2026-08-28", "2026-09-02"), 6);
    assert.equal(daysBetween("2026-12-30", "2027-01-02"), 4);
  });

  it("is unaffected by daylight saving shifts", () => {
    // Northern-hemisphere DST changeover; a local-time implementation would
    // land 23 or 25 hours out and round to the wrong day count.
    assert.equal(daysBetween("2026-03-28", "2026-03-30"), 3);
    assert.equal(daysBetween("2026-10-24", "2026-10-26"), 3);
  });

  it("derives a period's last day from its length", () => {
    assert.equal(periodEnd("2026-08-01", 15), "2026-08-15");
    assert.equal(periodEnd("2026-08-28", 10), "2026-09-06");
    assert.equal(periodEnd("2026-12-20", 20), "2027-01-08");
  });
});

describe("month periods", () => {
  it("spans the whole calendar month", () => {
    const p = monthPeriodOf("2026-08-14");
    assert.equal(p.start, "2026-08-01");
    assert.equal(p.end, "2026-08-31");
    assert.equal(p.days, 31);
  });

  it("handles short months and leap years", () => {
    assert.equal(monthPeriodOf("2026-02-10").days, 28);
    assert.equal(monthPeriodOf("2028-02-10").days, 29);
    assert.equal(monthPeriodOf("2026-04-30").end, "2026-04-30");
  });

  it("reads savings from the legacy 0-based month key", () => {
    // savingsByMonth has always been keyed "YYYY-M"; month mode must keep
    // reading it so existing users' targets survive untouched.
    const savings = { "2026-7": 250 };
    assert.equal(monthPeriodOf("2026-08-14", savings).savings, 250);
    assert.equal(monthPeriodOf("2026-09-14", savings).savings, 0);
  });

  it("never returns a negative savings target", () => {
    assert.equal(monthPeriodOf("2026-08-14", { "2026-7": -50 }).savings, 0);
  });
});

describe("resolver in month mode", () => {
  const resolve = createPeriodResolver({ mode: "month", savingsByMonth: { "2026-7": 100 } });

  it("covers every day, so there are never gaps", () => {
    for (const day of ["2020-01-01", "2026-08-31", "2026-09-01", "2030-12-31"]) {
      assert.ok(resolve(day), `${day} should resolve`);
    }
  });

  it("rolls over at the month boundary", () => {
    assert.equal(resolve("2026-08-31").key, "2026-08-01");
    assert.equal(resolve("2026-09-01").key, "2026-09-01");
  });
});

describe("resolver in days mode", () => {
  const periods = [
    period("2026-07-01", 15, 50),
    period("2026-07-20", 15, 60),
    period("2026-08-10", 20, 80),
  ];
  const resolve = createPeriodResolver({ mode: "days", periods });

  it("resolves days inside a period, including both edges", () => {
    assert.equal(resolve("2026-07-01").key, "2026-07-01");
    assert.equal(resolve("2026-07-15").key, "2026-07-01");
    assert.equal(resolve("2026-07-08").savings, 50);
  });

  it("returns null in the gap between two periods", () => {
    // Jul 16-19 belong to no period: no budget, and nothing to judge.
    assert.equal(resolve("2026-07-16"), null);
    assert.equal(resolve("2026-07-19"), null);
    assert.equal(resolve("2026-07-20").key, "2026-07-20");
  });

  it("returns null before the first period and after the last", () => {
    assert.equal(resolve("2026-06-30"), null);
    assert.equal(resolve("2026-08-29").key, "2026-08-10");
    assert.equal(resolve("2026-08-30"), null);
  });

  it("resolves a period that straddles a month boundary", () => {
    const straddling = createPeriodResolver({
      mode: "days",
      periods: [period("2026-08-25", 14)],
    });
    assert.equal(straddling("2026-08-31").key, "2026-08-25");
    assert.equal(straddling("2026-09-07").key, "2026-08-25");
    assert.equal(straddling("2026-09-08"), null);
  });

  it("does not care what order the periods arrive in", () => {
    const shuffled = createPeriodResolver({
      mode: "days",
      periods: [periods[2], periods[0], periods[1]],
    });
    assert.equal(shuffled("2026-07-08").key, "2026-07-01");
    assert.equal(shuffled("2026-08-15").key, "2026-08-10");
    assert.equal(shuffled("2026-07-17"), null);
  });

  it("resolves nothing at all when no period has been started", () => {
    const empty = createPeriodResolver({ mode: "days", periods: [] });
    assert.equal(empty("2026-08-14"), null);
  });
});

describe("days left", () => {
  const p = period("2026-08-01", 15);

  it("counts today itself", () => {
    assert.equal(daysLeftInPeriod("2026-08-01", p), 15);
    assert.equal(daysLeftInPeriod("2026-08-15", p), 1);
  });

  it("is zero once the period has ended", () => {
    assert.equal(daysLeftInPeriod("2026-08-16", p), 0);
    assert.equal(daysLeftInPeriod("2026-08-14", null), 0);
  });
});

describe("restore allowance", () => {
  it("keeps roughly three per thirty days", () => {
    assert.equal(savesForPeriod(30), 3);
    assert.equal(savesForPeriod(31), 3);
    assert.equal(savesForPeriod(15), 2);
    assert.equal(savesForPeriod(45), 5);
    assert.equal(savesForPeriod(60), 6);
  });

  it("never leaves a short period with none", () => {
    assert.equal(savesForPeriod(7), 1);
    assert.equal(savesForPeriod(1), 1);
  });
});

describe("status", () => {
  const periods = [period("2026-07-01", 15), period("2026-07-20", 15)];

  it("is active while a period covers today", () => {
    assert.equal(periodStatus("2026-07-25", periods[1], periods), "active");
  });

  it("is lapsed once the last period has ended", () => {
    assert.equal(periodStatus("2026-08-05", null, periods), "lapsed");
  });

  it("is none when the user has never started one", () => {
    assert.equal(periodStatus("2026-08-05", null, []), "none");
  });

  it("finds the most recent finished period to describe the lapse", () => {
    assert.equal(latestPeriodBefore("2026-08-05", periods).key, "2026-07-20");
    assert.equal(latestPeriodBefore("2026-06-01", periods), null);
  });
});
