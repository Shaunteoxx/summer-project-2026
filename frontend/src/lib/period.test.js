// Client-side period helpers. These mirror the server's arithmetic, so the
// cases that matter are the ones where a naive local-time implementation would
// drift: month boundaries, leap years and daylight saving.
import { describe, it, expect } from "vitest";

import {
  addDaysYmd,
  daysBetween,
  daysLeftInPeriod,
  formatDay,
  formatMonthLabel,
  formatPeriodLabel,
  periodDayList,
  periodEnd,
} from "@/lib/period";

const period = (start, length) => ({ start, end: periodEnd(start, length), days: length });

describe("day arithmetic", () => {
  it("counts an inclusive span", () => {
    expect(daysBetween("2026-08-01", "2026-08-01")).toBe(1);
    expect(daysBetween("2026-08-01", "2026-08-15")).toBe(15);
  });

  it("crosses month and year boundaries", () => {
    expect(daysBetween("2026-08-28", "2026-09-02")).toBe(6);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(4);
  });

  it("is unaffected by daylight saving shifts", () => {
    // A local-midnight implementation lands 23 or 25 hours out here and
    // rounds to the wrong number of days.
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(3);
    expect(daysBetween("2026-10-24", "2026-10-26")).toBe(3);
  });

  it("adds days across boundaries", () => {
    expect(addDaysYmd("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysYmd("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysYmd("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("derives a period's last day from its length", () => {
    expect(periodEnd("2026-08-01", 15)).toBe("2026-08-15");
    expect(periodEnd("2026-08-28", 10)).toBe("2026-09-06");
    expect(periodEnd("2026-12-20", 20)).toBe("2027-01-08");
  });
});

describe("days left", () => {
  const p = period("2026-08-01", 15);

  it("counts today itself", () => {
    expect(daysLeftInPeriod("2026-08-01", p)).toBe(15);
    expect(daysLeftInPeriod("2026-08-15", p)).toBe(1);
  });

  it("is zero once the period has ended, or with no period", () => {
    expect(daysLeftInPeriod("2026-08-16", p)).toBe(0);
    expect(daysLeftInPeriod("2026-08-10", null)).toBe(0);
  });
});

describe("period day list", () => {
  it("returns every day inclusive of both ends", () => {
    const days = periodDayList(period("2026-08-30", 4));
    expect(days).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02"]);
  });

  it("handles a single-day period and a missing one", () => {
    expect(periodDayList(period("2026-08-30", 1))).toEqual(["2026-08-30"]);
    expect(periodDayList(null)).toEqual([]);
  });

  it("produces exactly `days` entries for a long period", () => {
    expect(periodDayList(period("2026-04-01", 151))).toHaveLength(151);
  });
});

describe("labels", () => {
  it("reads a whole calendar month as the month name", () => {
    expect(formatPeriodLabel(period("2026-08-01", 31))).toBe("August 2026");
    expect(formatPeriodLabel(period("2028-02-01", 29))).toBe("February 2028");
  });

  it("always uses the month name in month mode", () => {
    // Month mode's period is the calendar month by definition.
    expect(formatPeriodLabel(period("2026-08-01", 31), { mode: "month" })).toBe(
      "August 2026"
    );
  });

  it("reads a part-month as a day range", () => {
    expect(formatPeriodLabel(period("2026-08-01", 15))).toBe("1 – 15 Aug");
    expect(formatPeriodLabel(period("2026-08-10", 6))).toBe("10 – 15 Aug");
  });

  it("spells out both months when the period straddles one", () => {
    expect(formatPeriodLabel(period("2026-08-25", 14))).toBe("25 Aug – 7 Sep");
  });

  it("adds years only when the period crosses one", () => {
    expect(formatPeriodLabel(period("2026-12-20", 20))).toBe(
      "20 Dec 2026 – 8 Jan 2027"
    );
  });

  it("formats single days and month headings", () => {
    expect(formatDay("2026-08-04")).toBe("4 Aug");
    expect(formatDay("2026-08-04", { withYear: true })).toBe("4 Aug 2026");
    expect(formatMonthLabel("2026-08-04")).toBe("August 2026");
  });

  it("returns empty rather than throwing on a missing period", () => {
    expect(formatPeriodLabel(null)).toBe("");
    expect(formatDay(null)).toBe("");
    expect(formatMonthLabel(undefined)).toBe("");
  });
});
