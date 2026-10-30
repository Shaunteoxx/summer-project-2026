/**
 * The entry sheet's pure helpers: the blank and seeded drafts, the "Repeat
 * Monthly" schedule, which tip an opening gets, and what an entry did to
 * today's budget.
 *
 * Today is pinned to 2026-08-10, so nothing here depends on the day the suite
 * runs (see the README's caution about dates a test doesn't control).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal()),
  localToday: () => "2026-08-10",
}));

// A plain stub rather than vi.fn: vi.fn keeps hold of the promises it hands
// out, which re-reported a rejection todayAfter had already caught and kept
// the worker from exiting on one that never settles.
let answer = () => Promise.resolve(null);
const asked = [];
vi.mock("@/api/endpoints", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchStreak: (...args) => {
    asked.push(args);
    return answer(...args);
  },
}));
const answerWith = (...values) => {
  const queue = [...values];
  answer = () => Promise.resolve(queue.length > 1 ? queue.shift() : queue[0]);
};

import {
  emptyForm,
  formFrom,
  pickEntryTip,
  readDraft,
  repeatPlan,
  todayAfter,
  TODAY_WAIT_MS,
} from "@/lib/entryDraft";

beforeEach(() => {
  answer = () => Promise.resolve(null);
  asked.length = 0;
});

describe("emptyForm", () => {
  it("starts blank, dated today, on the account it's given", () => {
    expect(emptyForm("acc1")).toEqual({
      description: "",
      amount: "",
      category: "",
      date: "2026-08-10",
      accountId: "acc1",
      paidBack: "",
      paidBackAccountId: "",
    });
  });

  it("has no account when none is given", () => {
    expect(emptyForm().accountId).toBe("");
  });
});

describe("formFrom", () => {
  it("seeds the draft from a row, as strings, on the day it was stored", () => {
    expect(
      formFrom({
        description: "Dinner",
        amount: 42.5,
        category: "F & B",
        date: "2026-08-03T00:00:00.000Z",
        accountId: 7,
        paidBack: 20,
        paidBackAccountId: 9,
      })
    ).toEqual({
      description: "Dinner",
      amount: "42.5",
      category: "F & B",
      date: "2026-08-03",
      accountId: "7",
      paidBack: "20",
      paidBackAccountId: "9",
    });
  });

  it("leaves missing accounts and paid back empty rather than 'null'", () => {
    const form = formFrom({
      description: "Bus",
      amount: 2,
      category: "Transport",
      date: "2026-08-03T00:00:00.000Z",
      accountId: null,
    });
    expect(form.accountId).toBe("");
    expect(form.paidBack).toBe("");
    expect(form.paidBackAccountId).toBe("");
  });
});

describe("repeatPlan", () => {
  it("starts the day after the entry and names the next month", () => {
    expect(repeatPlan("2026-08-15")).toEqual({
      dayOfMonth: 15,
      startKey: "2026-08-16",
      caption: "Adds this again on the 15th of each month, from September.",
    });
  });

  it("never starts before today, for an entry dated in the past", () => {
    expect(repeatPlan("2026-07-04").startKey).toBe("2026-08-10");
  });

  it("says how short months are handled past the 28th", () => {
    expect(repeatPlan("2026-08-31").caption).toBe(
      "Adds this again on the 31st of each month, from September. Shorter months use their last day."
    );
  });

  it("rolls over into January from December", () => {
    expect(repeatPlan("2026-12-02").caption).toBe(
      "Adds this again on the 2nd of each month, from January."
    );
  });

  it("has no plan for a date it can't read", () => {
    expect(repeatPlan("")).toBeNull();
    expect(repeatPlan("not-a-date")).toBeNull();
  });
});

describe("pickEntryTip", () => {
  const tour = (...seen) => ({ isDone: (id) => seen.includes(id) });

  it("offers the first tip not seen yet, in order", () => {
    expect(pickEntryTip(tour(), { type: "expense", hasAccounts: true })).toBe("entry.paid-back");
    expect(pickEntryTip(tour("entry.paid-back"), { type: "expense", hasAccounts: true })).toBe(
      "entry.repeat"
    );
    expect(
      pickEntryTip(tour("entry.paid-back", "entry.repeat"), { type: "expense", hasAccounts: true })
    ).toBe("entry.account");
  });

  it("skips paid back for income", () => {
    expect(pickEntryTip(tour(), { type: "income", hasAccounts: true })).toBe("entry.repeat");
  });

  it("skips the account tip for someone with no accounts", () => {
    expect(
      pickEntryTip(tour("entry.paid-back", "entry.repeat"), { type: "expense", hasAccounts: false })
    ).toBeNull();
  });

  it("has nothing once every tip is seen", () => {
    expect(
      pickEntryTip(tour("entry.paid-back", "entry.repeat", "entry.account"), {
        type: "expense",
        hasAccounts: true,
      })
    ).toBeNull();
  });
});

describe("todayAfter", () => {
  const today = { budget: 30, spent: 4, remaining: 26, within: true };
  const created = { date: "2026-08-10T00:00:00.000Z" };

  it("hands back today's budget for an entry dated today", async () => {
    answerWith({ periodStatus: "active", hasIncome: true, overspentBy: 0, today });
    await expect(todayAfter(created)).resolves.toEqual(today);
    expect(asked).toEqual([["2026-08-10"]]);
  });

  it("doesn't ask about an entry dated another day", async () => {
    await expect(todayAfter({ date: "2026-08-09T00:00:00.000Z" })).resolves.toBeNull();
    expect(asked).toEqual([]);
  });

  it("has no line with no period running, no income, or the period overspent", async () => {
    answerWith({ periodStatus: "inactive", hasIncome: true, today });
    await expect(todayAfter(created)).resolves.toBeNull();
    answerWith({ periodStatus: "active", hasIncome: false, today });
    await expect(todayAfter(created)).resolves.toBeNull();
    answerWith({ periodStatus: "active", hasIncome: true, overspentBy: 5, today });
    await expect(todayAfter(created)).resolves.toBeNull();
  });

  it("has no line when the streak request fails", async () => {
    answer = () => Promise.reject(new Error("offline"));
    await expect(todayAfter(created)).resolves.toBeNull();
  });

  it("gives up after the wait rather than holding the toast", async () => {
    answer = () => new Promise(() => {});
    const started = Date.now();
    await expect(todayAfter(created)).resolves.toBeNull();
    expect(Date.now() - started).toBeGreaterThanOrEqual(TODAY_WAIT_MS - 50);
  });
});

describe("readDraft", () => {
  const draft = (over) => ({ ...emptyForm(), category: "F & B", amount: "4.5", ...over });

  it("sends the description as typed, trimmed, and the amount as a number", () => {
    expect(readDraft(draft({ description: "  Chicken rice " }))).toEqual({
      description: "Chicken rice",
      amount: 4.5,
      errors: {},
    });
  });

  it("falls back to the category for a blank description", () => {
    expect(readDraft(draft({ description: "   " })).description).toBe("F & B");
  });

  it("names every problem at once", () => {
    expect(readDraft(draft({ category: "", amount: "", date: "" })).errors).toEqual({
      category: "Choose a category.",
      amount: "Enter an amount greater than $0.",
      date: "Choose a valid date.",
    });
  });

  it("refuses zero, a negative and anything that isn't a number", () => {
    for (const amount of ["0", "-3", "abc"]) {
      expect(readDraft(draft({ amount })).errors.amount).toBe("Enter an amount greater than $0.");
    }
  });

  it("caps an amount at a billion", () => {
    expect(readDraft(draft({ amount: "1000000000" })).errors).toEqual({});
    expect(readDraft(draft({ amount: "1000000000.01" })).errors.amount).toBe(
      "Keep it under $1,000,000,000."
    );
  });

  it("refuses a date it can't read", () => {
    expect(readDraft(draft({ date: "2026-13-45" })).errors.date).toBe("Choose a valid date.");
  });
});

