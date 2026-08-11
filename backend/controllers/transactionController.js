import Transaction from "../models/Transaction.js";
import {
  parseMonthYear,
  parseTransactionDate,
  parseYmd,
  utcToday,
  ymd,
} from "../lib/validation.js";
import { dayFromYmd } from "../lib/period.js";
import { ensureRecurringDue } from "../lib/recurring.js";
// One definition of what an entry's fields may contain, shared with the
// repeating rules that produce entries of their own — see lib/entryFields.js.
import {
  checkAccountId,
  checkAmount,
  checkCategory,
  checkDescription,
  checkType,
} from "../lib/entryFields.js";

/**
 * GET /api/transactions?start=&end=  (a budget period)
 * GET /api/transactions?month=&year= (a calendar month, used by the history views)
 */
export async function getTransactions(req, res) {
  // The ledger is a read of the very rows repeating entries produce, so they
  // have to exist before it runs. Server today rather than the client's: this
  // endpoint is asked for a window, not a day, and being an hour late on a
  // timezone boundary only delays a row the next request writes anyway.
  await ensureRecurringDue(req.user, ymd(utcToday()));

  const { start, end } = req.query;
  let filter;

  if (start !== undefined || end !== undefined) {
    const from = parseYmd(start);
    const to = parseYmd(end);
    if (!from || !to || start > end) {
      return res.status(400).json({ message: "Invalid date range" });
    }
    filter = { date: { $gte: dayFromYmd(start), $lte: dayFromYmd(end) } };
  } else {
    const period = parseMonthYear(req.query);
    if (!period) return res.status(400).json({ message: "Invalid month or year" });
    filter = period;
  }

  // "none" narrows to rows logged before the user made any accounts, or ones
  // they left untagged — the same bucket the per-account totals call unassigned.
  const { accountId } = req.query;
  if (accountId === "none") {
    filter = { ...filter, accountId: null };
  } else if (accountId !== undefined && accountId !== "") {
    const resolved = checkAccountId(req.user, accountId);
    if (!resolved.ok) return res.status(400).json({ message: "Unknown account" });
    filter = { ...filter, accountId: resolved.value };
  }

  const transactions = await Transaction.find({
    userId: req.user._id,
    ...filter,
  }).sort({ date: -1, createdAt: -1 });
  res.json(transactions);
}

/** POST /api/transactions */
export async function createTransaction(req, res) {
  const { description, amount, type, category, date, accountId } = req.body;
  if (!description || amount === undefined || !type || !category) {
    return res.status(400).json({
      message: "description, amount, type and category are required",
    });
  }
  const kind = checkType(type);
  if (kind.message) return res.status(400).json({ message: kind.message });

  const desc = checkDescription(description);
  if (desc.message) return res.status(400).json({ message: desc.message });

  const cat = checkCategory(req.user, type, category);
  if (cat.message) return res.status(400).json({ message: cat.message });

  const value = checkAmount(amount);
  if (value.message) return res.status(400).json({ message: value.message });

  const when = parseTransactionDate(date);
  if (!when) return res.status(400).json({ message: "Invalid transaction date" });

  const account = checkAccountId(req.user, accountId);
  if (!account.ok) return res.status(400).json({ message: "Choose a valid account" });

  const transaction = await Transaction.create({
    userId: req.user._id,
    description: desc.value,
    amount: value.value,
    type,
    category: cat.value,
    date: when,
    month: when.getUTCMonth(),
    year: when.getUTCFullYear(),
    accountId: account.value,
  });
  res.status(201).json(transaction);
}

/**
 * PATCH /api/transactions/:id
 *
 * Partial on purpose: only the keys present in the body change. Tagging a row
 * that predates accounts is then a one-field request, and an edit can never
 * blank out something the client didn't know to send.
 *
 * `type` is deliberately not editable. Categories are per-type, so switching
 * would have to silently drop or re-map the category, and a row that changes
 * sign is really a different entry — delete and re-add says so honestly.
 *
 * Nothing derived is written here: the streak, summaries and per-account totals
 * are all computed at read time from these rows, so correcting one is enough.
 * The one thing that must move with `date` is month/year, which the history
 * views group by.
 */
export async function updateTransaction(req, res) {
  const transaction = await Transaction.findOne({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }

  const body = req.body || {};
  const { description, amount, type, category, date, accountId } = body;

  if (type !== undefined && type !== transaction.type) {
    return res.status(400).json({
      message: "A transaction's type can't be changed. Delete it and add it again.",
    });
  }

  if (description !== undefined) {
    const desc = checkDescription(description);
    if (desc.message) return res.status(400).json({ message: desc.message });
    transaction.description = desc.value;
  }

  if (category !== undefined) {
    const cat = checkCategory(req.user, transaction.type, category);
    if (cat.message) return res.status(400).json({ message: cat.message });
    transaction.category = cat.value;
  }

  if (amount !== undefined) {
    const value = checkAmount(amount);
    if (value.message) return res.status(400).json({ message: value.message });
    transaction.amount = value.value;
  }

  if (date !== undefined) {
    const when = parseTransactionDate(date);
    if (!when) return res.status(400).json({ message: "Invalid transaction date" });
    transaction.date = when;
    transaction.month = when.getUTCMonth();
    transaction.year = when.getUTCFullYear();
  }

  // `in` rather than a value check: an explicit null is how the client clears
  // the tag, and that has to stay distinguishable from not mentioning it.
  if ("accountId" in body) {
    const account = checkAccountId(req.user, accountId);
    if (!account.ok) return res.status(400).json({ message: "Choose a valid account" });
    transaction.accountId = account.value;
  }

  await transaction.save();
  res.json(transaction);
}

/** DELETE /api/transactions/:id */
export async function deleteTransaction(req, res) {
  const transaction = await Transaction.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!transaction) {
    return res.status(404).json({ message: "Transaction not found" });
  }
  res.json({ message: "Deleted", id: transaction._id });
}