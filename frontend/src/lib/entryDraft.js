/**
 * The entry sheet's pure parts: blank and seeded drafts, the "Repeat Monthly"
 * schedule, which tip an opening gets, and what a new entry did to today.
 * AddTransactionSheet holds the state and the saving; these hold no state.
 */
import { fetchStreak } from "@/api/endpoints";
import { localToday, ordinal } from "@/lib/utils";

export const emptyForm = (accountId = "") => ({
  description: "",
  amount: "",
  category: "",
  date: localToday(),
  accountId,
  paidBack: "",
  paidBackAccountId: "",
});

/**
 * What a "repeat this" rule would do, worked out from the entry being added.
 *
 * The rule starts the day *after* this entry, never on it — the entry being
 * saved is this month's, and a rule that also fired today would post it twice.
 * Because of that the first repeat is always the following month, whatever
 * date the entry carries. Never earlier than today either, since a rule can't
 * reach into days already lived through.
 */
export function repeatPlan(dateYmd) {
  const day = Number(String(dateYmd).slice(8, 10));
  if (!Number.isInteger(day) || day < 1) return null;

  const dayAfter = new Date(`${dateYmd}T00:00:00.000Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const startKey =
    dayAfter.toISOString().slice(0, 10) > localToday()
      ? dayAfter.toISOString().slice(0, 10)
      : localToday();

  const entry = new Date(`${dateYmd}T00:00:00.000Z`);
  const nextMonth = new Date(
    Date.UTC(entry.getUTCFullYear(), entry.getUTCMonth() + 1, 1)
  );
  return {
    dayOfMonth: day,
    startKey,
    caption:
      `Adds this again on the ${ordinal(day)} of each month, from ` +
      `${nextMonth.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })}.` +
      (day > 28 ? " Shorter months use their last day." : ""),
  };
}

/**
 * The parts of this form that don't explain themselves, in the order they're
 * worth learning. One tip per opening: the first not seen yet.
 */
export const ENTRY_TIPS = ["entry.paid-back", "entry.repeat", "entry.account"];

export function pickEntryTip(tour, { type, hasAccounts }) {
  return (
    ENTRY_TIPS.find((id) => {
      if (id === "entry.paid-back" && type !== "expense") return false;
      if (id === "entry.account" && !hasAccounts) return false;
      return !tour.isDone(id);
    }) ?? null
  );
}

/**
 * How long the confirmation waits to hear what an entry did to today. The sheet
 * has closed and the row is already in the ledger by then, so this only delays
 * the toast — and past this it goes out without the budget line rather than
 * leaving the save unconfirmed.
 */
export const TODAY_WAIT_MS = 1200;

/**
 * Where today's budget stands now that `created` is in, or null when there's
 * no line worth adding: the entry isn't dated today, no budget period is
 * running, or the period is already overspent (Home says that far better than
 * a toast can).
 *
 * The streak endpoint is the one place today's budget is worked out, so this
 * asks it rather than subtracting on the client.
 */
export async function todayAfter(created) {
  if (String(created.date).slice(0, 10) !== localToday()) return null;
  try {
    const streak = await Promise.race([
      fetchStreak(localToday()),
      new Promise((_, reject) => setTimeout(reject, TODAY_WAIT_MS)),
    ]);
    if (streak?.periodStatus !== "active" || !streak.hasIncome) return null;
    if (streak.overspentBy > 0) return null;
    return streak.today ?? null;
  } catch {
    return null;
  }
}

/** Seed the form from an existing row, so an edit starts from what's there. */
export const formFrom = (transaction) => ({
  description: transaction.description,
  amount: String(transaction.amount),
  category: transaction.category,
  // Transaction dates are stored at UTC midnight; slicing the ISO string keeps
  // the day the user chose, which building a local Date from it would not.
  date: String(transaction.date).slice(0, 10),
  accountId: transaction.accountId ? String(transaction.accountId) : "",
  paidBack: transaction.paidBack ? String(transaction.paidBack) : "",
  paidBackAccountId: transaction.paidBackAccountId ? String(transaction.paidBackAccountId) : "",
});

/**
 * What submitting `form` would send, and what stops it: `description` and
 * `amount` as they'd be saved, and `errors` by field (category, amount, date),
 * empty when there's nothing to fix.
 */
export function readDraft(form) {
  // Typing is the slowest step in this form, so the description is optional
  // and falls back to the category — "F & B" reads fine in the
  // ledger, and the placeholder shows what will be saved before you submit.
  const description = form.description.trim() || form.category;
  const amount = Number(form.amount);

  // Validate every field at once so all problems light up together, rather
  // than surfacing them one refused submit at a time.
  const errors = {};
  if (!form.category) errors.category = "Choose a category.";
  if (form.amount === "" || !Number.isFinite(amount) || amount <= 0) {
    errors.amount = "Enter an amount greater than $0.";
  } else if (amount > 1e9) {
    errors.amount = "Keep it under $1,000,000,000.";
  }
  if (!form.date || Number.isNaN(new Date(`${form.date}T00:00:00`).getTime())) {
    errors.date = "Choose a valid date.";
  }
  return { description, amount, errors };
}
