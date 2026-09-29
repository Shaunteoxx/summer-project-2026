// Term cycles — a lump sum sliced into the calendar months it has to cover.
// Pure functions, so no database here. The cases that matter are the clipped
// stub cycles a mid-month start produces, month-length clamping, and that the
// rebalance is actually calibrated: spending exactly a cycle's budget has to
// leave every later cycle untouched, and its savings target has to stay saved.
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  addMonthsYmd,
  createPeriodResolver,
  cyclesOfTerm,
  fundingFor,
  latestPeriodBefore,
  monthPeriodOf,
  periodEnd,
  periodStatus,
  priceCycles,
  setAsideFor,
  settleCycles,
  termEnd,
} from "../lib/period.js";

const term = (start, months, _id = start) => ({
  _id,
  start,
  end: termEnd(start, months),
  months,
});

/**
 * Walk a term of `amount`, spending each cycle exactly what it was given. The
 * pot has to drain as we go — that is what makes the split a split rather than
 * the same money offered over and over.
 */
const slices = (t, amount) => {
  let pot = amount;
  return cyclesOfTerm(t).map((cycle) => {
    const funding = fundingFor(cycle, pot);
    pot -= funding;
    return funding;
  });
};

describe("month arithmetic", () => {
  it("moves whole months", () => {
    assert.equal(addMonthsYmd("2026-01-15", 1), "2026-02-15");
    assert.equal(addMonthsYmd("2026-01-15", 6), "2026-07-15");
    assert.equal(addMonthsYmd("2026-01-15", 0), "2026-01-15");
  });

  it("crosses year boundaries", () => {
    assert.equal(addMonthsYmd("2026-11-20", 3), "2027-02-20");
    assert.equal(addMonthsYmd("2026-08-15", 6), "2027-02-15");
  });

  it("clamps to the target month's length", () => {
    assert.equal(addMonthsYmd("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonthsYmd("2026-01-31", 3), "2026-04-30");
    assert.equal(addMonthsYmd("2026-08-31", 1), "2026-09-30");
  });

  it("clamps from the original day, not the previous clamped one", () => {
    // The bug this guards: stepping month by month from a clamped value walks
    // 31 Jan -> 28 Feb -> 28 Mar. March has a 31st and should get it back.
    assert.equal(addMonthsYmd("2026-01-31", 2), "2026-03-31");
    assert.equal(addMonthsYmd("2026-01-31", 4), "2026-05-31");
  });

  it("handles leap years", () => {
    assert.equal(addMonthsYmd("2028-01-31", 1), "2028-02-29");
    assert.equal(addMonthsYmd("2027-01-31", 1), "2027-02-28");
  });

  it("derives a term's last day", () => {
    assert.equal(termEnd("2026-01-01", 6), "2026-06-30");
    assert.equal(termEnd("2026-08-15", 6), "2027-02-14");
    assert.equal(termEnd("2026-01-31", 1), "2026-02-27");
  });
});

describe("term cycles", () => {
  it("slices a month-aligned term into whole calendar months", () => {
    const cycles = cyclesOfTerm(term("2026-01-01", 6));
    assert.equal(cycles.length, 6);
    assert.deepEqual(
      cycles.map((c) => c.start),
      ["2026-01-01", "2026-02-01", "2026-03-01", "2026-04-01", "2026-05-01", "2026-06-01"]
    );
    assert.equal(cycles.at(-1).end, "2026-06-30");
    assert.deepEqual(cycles.map((c) => c.days), [31, 28, 31, 30, 31, 30]);
    // Every cycle is a whole month, so every weight is exactly 1.
    assert.deepEqual(cycles.map((c) => c.weight), [1, 1, 1, 1, 1, 1]);
  });

  it("clips the first and last cycles of a mid-month term", () => {
    const cycles = cyclesOfTerm(term("2026-08-15", 6));
    // Six months from 15 Aug runs to 14 Feb, which touches seven calendar
    // months: a stub at each end and five whole ones between.
    assert.equal(cycles.length, 7);
    assert.equal(cycles[0].start, "2026-08-15");
    assert.equal(cycles[0].end, "2026-08-31");
    assert.equal(cycles[0].days, 17);
    assert.equal(cycles.at(-1).start, "2027-02-01");
    assert.equal(cycles.at(-1).end, "2027-02-14");
    assert.equal(cycles.at(-1).days, 14);
    // Whole months in the middle.
    assert.deepEqual(cycles.slice(1, 6).map((c) => c.days), [30, 31, 30, 31, 31]);
  });

  it("weighs a stub as its fraction of the month it sits in", () => {
    const cycles = cyclesOfTerm(term("2026-08-15", 6));
    assert.equal(cycles[0].weight, 17 / 31);
    assert.equal(cycles.at(-1).weight, 14 / 28);
    assert.deepEqual(cycles.slice(1, 6).map((c) => c.weight), [1, 1, 1, 1, 1]);
  });

  it("handles a term that starts and ends inside one month", () => {
    const cycles = cyclesOfTerm({
      _id: "t",
      start: "2026-03-10",
      end: "2026-03-20",
      months: 1,
    });
    assert.equal(cycles.length, 1);
    assert.equal(cycles[0].days, 11);
    assert.equal(cycles[0].weight, 11 / 31);
    // One cycle, so it gets the lot however small a slice of a month it is.
    assert.equal(fundingFor(cycles[0], 500), 500);
  });

  it("keeps the calendar month's savings target", () => {
    // 0-based month key, the legacy savingsByMonth shape.
    const cycles = cyclesOfTerm(term("2026-01-01", 3), { "2026-1": 200 });
    assert.equal(cycles[0].savings, 0);
    assert.equal(cycles[1].savings, 200); // February
    assert.equal(cycles[1].monthKey, "2026-1");
  });

  it("numbers cycles and carries the term id", () => {
    const cycles = cyclesOfTerm(term("2026-01-01", 3, "abc"));
    assert.deepEqual(cycles.map((c) => c.index), [0, 1, 2]);
    assert.ok(cycles.every((c) => c.termId === "abc"));
    assert.ok(cycles.every((c) => c.cycles === 3));
  });

  it("returns nothing for a missing or inside-out term", () => {
    assert.deepEqual(cyclesOfTerm(null), []);
    assert.deepEqual(cyclesOfTerm({ start: "2026-01-01" }), []);
    assert.deepEqual(cyclesOfTerm({ start: "2026-06-01", end: "2026-01-01" }), []);
  });
});

describe("funding a cycle", () => {
  it("splits evenly when every cycle is a whole month", () => {
    assert.deepEqual(slices(term("2026-01-01", 6), 6000), [
      1000, 1000, 1000, 1000, 1000, 1000,
    ]);
  });

  it("gives equal money to months of unequal length", () => {
    // January has 31 days and February 28; both get $1,000. The product is
    // "a thousand a month", not a daily rate that wobbles with the calendar.
    const [jan, feb] = slices(term("2026-01-01", 6), 6000);
    assert.equal(jan, feb);
  });

  it("pays a stub its fraction of a month", () => {
    const [stub, whole] = slices(term("2026-08-15", 6), 6000);
    // The term weighs 6.048 months, so a whole one is worth ~$992 and the
    // 17-day stub takes 17/31 of that.
    assert.ok(stub > 500 && stub < 600, `stub funding was ${stub}`);
    assert.ok(whole > 950 && whole < 1000, `whole-month funding was ${whole}`);
    assert.ok(whole > stub);
  });

  it("hands the last cycle everything that is left", () => {
    const cycles = cyclesOfTerm(term("2026-01-01", 6));
    assert.equal(fundingFor(cycles.at(-1), 900), 900);
  });

  it("never goes negative on a blown term", () => {
    const cycles = cyclesOfTerm(term("2026-01-01", 6));
    assert.equal(fundingFor(cycles[2], -4000), 0);
    assert.equal(fundingFor(cycles[2], 0), 0);
  });

  it("is calibrated: spending exactly your funding leaves the rest untouched", () => {
    // The invariant the whole rebalance rests on. Walk the term spending each
    // cycle's funding to the cent; every later cycle must still be offered the
    // same figure it would have been at the start.
    const cycles = cyclesOfTerm(term("2026-01-01", 6));
    const baseline = slices(term("2026-01-01", 6), 6000);
    let pot = 6000;
    cycles.forEach((cycle, i) => {
      const funding = fundingFor(cycle, pot);
      assert.equal(funding, baseline[i]);
      pot -= funding; // spend it all
    });
    assert.equal(Math.round(pot * 100) / 100, 0);
  });

  it("shrinks later cycles after an overspend", () => {
    const cycles = cyclesOfTerm(term("2026-01-01", 6));
    // $1,000 in January, then $1,400 in February: $3,600 left over 4 months.
    const pot = 6000 - 1000 - 1400;
    assert.equal(fundingFor(cycles[2], pot), 900);
    assert.ok(fundingFor(cycles[2], pot) < fundingFor(cycles[2], 4000));
  });

  it("grows later cycles after an underspend", () => {
    const cycles = cyclesOfTerm(term("2026-01-01", 6));
    const spentOnPlan = fundingFor(cycles[0], 6000);
    const thrifty = fundingFor(cycles[1], 6000 - 800);
    const onPlan = fundingFor(cycles[1], 6000 - spentOnPlan);
    assert.ok(thrifty > onPlan, `${thrifty} should beat ${onPlan}`);
  });

  it("stays safe on a cycle it was never given" , () => {
    assert.equal(fundingFor(null, 6000), 0);
    assert.equal(fundingFor({ weight: 1 }, 6000), 0);
  });
});

// A savings target is reserved out of each month's share. Once the month ends
// it has to leave the pot, the way month mode assumes it went to savings — left
// in, it reads as an underspend and the next month is handed it back to spend.
describe("savings in a term", () => {
  // $300 a month on a January–March term (0-based savingsByMonth keys).
  const targets = { "2026-0": 300, "2026-1": 300, "2026-2": 300 };

  /**
   * Walk a term the way it's lived: price the month with what has happened so
   * far, then spend `spend(funding, cycle)` in it.
   */
  const live = (t, lump, savingsByMonth, spend) => {
    const cycles = cyclesOfTerm(t, savingsByMonth);
    const incomeByCycle = new Map([[cycles[0].key, lump]]);
    const expenseByCycle = new Map();
    return cycles.map((cycle) => {
      const funding = priceCycles(cycles, { incomeByCycle, expenseByCycle }).get(cycle.key);
      expenseByCycle.set(cycle.key, spend(funding, cycle));
      return funding;
    });
  };

  it("keeps every month's target, not just the last one's", () => {
    // Spend exactly the budget — share minus target — every month.
    const onBudget = (funding, cycle) => funding - cycle.savings;
    const shares = live(term("2026-01-01", 3), 3000, targets, onBudget);

    // Each month is still offered $1,000 and spends $700. Before the target left
    // the pot this read $1,000, $1,150, $1,450: $2,700 spent and $300 saved
    // against $900 of targets.
    assert.deepEqual(shares, [1000, 1000, 1000]);
    const spent = shares.reduce((n, share) => n + share - 300, 0);
    assert.equal(3000 - spent, 900);
  });

  it("is calibrated against the budget: staying on it leaves later months alone", () => {
    const onBudget = (funding, cycle) => funding - cycle.savings;
    assert.deepEqual(
      live(term("2026-01-01", 3), 3000, targets, onBudget),
      live(term("2026-01-01", 3), 3000, {}, (funding) => funding)
    );
  });

  it("still takes the target out of a month that spent into it", () => {
    // January spends its whole $1,000, target and all. The target is taken to
    // have gone to savings regardless, so February shares $3,000 − $1,300.
    const [jan, feb] = live(term("2026-01-01", 3), 3000, targets, (funding) => funding);
    assert.equal(jan, 1000);
    assert.equal(feb, 850);
  });

  it("only takes out targets that were actually set", () => {
    // February has no target, so only January's leaves the pot before March.
    const onBudget = (funding, cycle) => funding - cycle.savings;
    const shares = live(term("2026-01-01", 3), 3000, { "2026-0": 300 }, onBudget);
    assert.deepEqual(shares, [1000, 1000, 1000]);
  });

  it("never sets aside more than the allowance still holds", () => {
    const [cycle] = cyclesOfTerm(term("2026-01-01", 3), targets);
    assert.equal(setAsideFor(cycle, 1000), 300);
    assert.equal(setAsideFor(cycle, 200), 200);
    // Nothing left once the month's spending is out, so nothing to put away.
    assert.equal(setAsideFor(cycle, 0), 0);
    assert.equal(setAsideFor(cycle, -500), 0);
    assert.equal(setAsideFor({}, 1000), 0);
  });

  it("doesn't dock a top-up for a target an empty pot couldn't meet", () => {
    // The whole $3,000 goes in January, so its $300 target had nothing to move
    // and February gets nothing. March's $600 top-up then arrives whole, rather
    // than $300 short for a transfer that couldn't have happened.
    const cycles = cyclesOfTerm(term("2026-01-01", 3), targets);
    const settled = settleCycles(cycles, {
      incomeByCycle: new Map([
        [cycles[0].key, 3000],
        [cycles[2].key, 600],
      ]),
      expenseByCycle: new Map([[cycles[0].key, 3000]]),
    });
    assert.deepEqual(settled.get(cycles[0].key), { funding: 1000, setAside: 0 });
    assert.equal(settled.get(cycles[1].key).funding, 0);
    assert.equal(settled.get(cycles[2].key).funding, 600);
  });
});

describe("resolver in term mode", () => {
  const terms = [term("2026-01-01", 3, "a"), term("2026-07-01", 2, "b")];
  const resolve = createPeriodResolver({ mode: "term", terms });

  it("resolves both edges of a cycle", () => {
    assert.equal(resolve("2026-01-01").key, "2026-01-01");
    assert.equal(resolve("2026-01-31").key, "2026-01-01");
    assert.equal(resolve("2026-02-01").key, "2026-02-01");
  });

  it("returns null outside every term", () => {
    assert.equal(resolve("2025-12-31"), null); // before the first
    assert.equal(resolve("2026-05-15"), null); // the gap between terms
    assert.equal(resolve("2026-09-01"), null); // after the last
  });

  it("resolves each term independently", () => {
    assert.equal(resolve("2026-03-31").termId, "a");
    assert.equal(resolve("2026-07-01").termId, "b");
  });

  it("does not care what order the terms arrive in", () => {
    const shuffled = createPeriodResolver({ mode: "term", terms: [terms[1], terms[0]] });
    assert.equal(shuffled("2026-02-14").key, "2026-02-01");
    assert.equal(shuffled("2026-08-01").key, "2026-08-01");
  });

  it("has nothing to resolve without a term", () => {
    assert.equal(createPeriodResolver({ mode: "term" })("2026-01-01"), null);
  });
});

describe("funding is absent from the other two modes", () => {
  // The guard the month-mode equivalence suite rests on: if funding ever stops
  // being null here it starts changing budgets it has no business touching.
  it("is null in month mode", () => {
    assert.equal(monthPeriodOf("2026-01-15").funding, null);
    assert.equal(createPeriodResolver({ mode: "month" })("2026-01-15").funding, null);
  });

  it("is null in days mode", () => {
    const periods = [{ _id: "p", start: "2026-01-01", end: periodEnd("2026-01-01", 30), length: 30 }];
    assert.equal(createPeriodResolver({ mode: "days", periods })("2026-01-05").funding, null);
  });
});

describe("a lapsed term", () => {
  const cycles = cyclesOfTerm(term("2026-01-01", 3));

  it("reads as lapsed rather than never set up", () => {
    assert.equal(periodStatus("2026-06-01", null, cycles), "lapsed");
    assert.equal(periodStatus("2026-06-01", null, []), "none");
  });

  it("names the cycle that ended without mangling it", () => {
    // latestPeriodBefore used to run every window through toPeriod, which reads
    // `length` and `savingsTarget` — fields a resolved cycle doesn't have.
    const last = latestPeriodBefore("2026-06-01", cycles);
    assert.equal(last.start, "2026-03-01");
    assert.equal(last.end, "2026-03-31");
    assert.equal(last.days, 31);
  });
});
