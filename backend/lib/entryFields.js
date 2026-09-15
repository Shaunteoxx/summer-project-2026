import { roundMoney } from "./validation.js";

/**
 * The fields an entry is made of, and the rules they obey.
 *
 * Three things describe money moving in this app — a transaction being created,
 * one being corrected, and a repeating rule that will produce more of them —
 * and they must agree exactly. A rule that accepted a category transactions
 * refuse would sit there producing entries the API would have rejected, and the
 * divergence would show up as a failed write months later rather than at the
 * point the two definitions drifted.
 *
 * So the caps, the category list and the account lookup live here once, and the
 * three callers differ only in which fields they ask about.
 */

// The categories every user has, on top of their own. Adding one here is all it
// should ever take: transactions, edits and repeating rules all read this.
export const FIXED_CATEGORIES = {
  expense: ["F & B", "Transport", "Shopping", "Entertainment", "Travel"],
  income: ["Allowance", "Job", "Gifts"],
};

// Flat list, for checking a proposed custom category doesn't collide.
export const FIXED_CATEGORY_NAMES = [
  ...FIXED_CATEGORIES.expense,
  ...FIXED_CATEGORIES.income,
];

export const ENTRY_TYPES = ["income", "expense"];

export const MAX_DESCRIPTION = 120;
export const MAX_CATEGORY = 40;
export const MAX_AMOUNT = 1e9;

export function categoryAllowed(user, type, category) {
  if (FIXED_CATEGORIES[type]?.includes(category)) return true;
  return (user.customCategories || []).some(
    (item) => item.type === type && item.name === category
  );
}

/*
 * Each check returns either { value } — the cleaned field, ready to store — or
 * { message } to send straight back to the client.
 */

export function checkDescription(raw) {
  const description = String(raw ?? "").trim();
  if (!description) return { message: "Description is required" };
  if (description.length > MAX_DESCRIPTION) {
    return { message: `Description too long (max ${MAX_DESCRIPTION} characters)` };
  }
  return { value: description };
}

export function checkAmount(raw) {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { message: "Amount must be greater than zero" };
  }
  if (amount > MAX_AMOUNT) return { message: "Amount is too large" };
  return { value: roundMoney(amount) };
}

export function checkCategory(user, type, raw) {
  const category = String(raw ?? "").trim();
  if (!category || category.length > MAX_CATEGORY || !categoryAllowed(user, type, category)) {
    return { message: "Choose a valid category" };
  }
  return { value: category };
}

export function checkType(raw) {
  if (!ENTRY_TYPES.includes(raw)) return { message: "Invalid type" };
  return { value: raw };
}

/**
 * Resolve an accountId from a request against the user's own accounts.
 *
 * Returns { ok, value } rather than a plain value so an explicit null — the
 * entry is deliberately untagged — stays distinguishable from a rejection.
 * Archived accounts are refused: they keep their history but can't take
 * anything new.
 */
export function checkAccountId(user, raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  const match = (user.accounts || []).find(
    (a) => String(a._id) === String(raw) && !a.archived
  );
  return match ? { ok: true, value: match._id } : { ok: false };
}

/*
 * Paid back — money friends returned for a shared bill.
 *
 * It lives on the expense rather than as an income row of its own. As income
 * it was new money, spread over every day left in the period, while the meal's
 * day kept looking like the whole table's bill. On the expense it comes off
 * that day instead: a $12.80 dinner with $5.90 back costs the budget $6.90.
 *
 * `amount` stays what actually left the account the bill was paid from, so the
 * account columns still match the bank. The repayment is counted into
 * `paidBackAccountId` — often a different account (PayWave out, PayNow back) —
 * and on the expense's own date, even if it arrived days later. That trades a
 * timing difference in monthly bank checks for one number to edit.
 */

/** What an entry costs the budget: the bill, less what came back. */
export const spentAmount = (t) => t.amount - (t.paidBack || 0);

/** The same thing as a Mongo expression, for the aggregations. */
export const SPENT_AMOUNT = { $subtract: ["$amount", { $ifNull: ["$paidBack", 0] }] };

/**
 * Check a paid-back amount and the account it went into, against the
 * expense's own type and amount.
 *
 * Returns { value: { paidBack, paidBackAccountId } } or { message }. Nothing
 * back, in any form, clears both, so a stale account can't outlive its amount.
 * `rawAccountId === undefined` keeps `keepAccountId` — an edit that doesn't
 * mention the account mustn't have to resend one the user may since have
 * archived.
 */
export function checkPaidBack(user, { type, amount, rawPaidBack, rawAccountId, keepAccountId = null }) {
  const paidBack = rawPaidBack === undefined || rawPaidBack === null || rawPaidBack === ""
    ? 0
    : Number(rawPaidBack);
  if (!Number.isFinite(paidBack) || paidBack < 0) {
    return { message: "Paid back must be zero or more" };
  }
  if (paidBack === 0) return { value: { paidBack: 0, paidBackAccountId: null } };
  if (type !== "expense") return { message: "Only an expense can be paid back" };

  const rounded = roundMoney(paidBack);
  // Less than, not up to: an entry that was paid back in full wasn't your
  // spending, and a zero-cost expense would sit in the ledger as noise.
  if (rounded >= amount) {
    return { message: "Paid back must be less than the amount" };
  }

  if (rawAccountId === undefined) {
    return { value: { paidBack: rounded, paidBackAccountId: keepAccountId } };
  }
  const account = checkAccountId(user, rawAccountId);
  if (!account.ok) return { message: "Choose a valid account for the money paid back" };
  return { value: { paidBack: rounded, paidBackAccountId: account.value } };
}
