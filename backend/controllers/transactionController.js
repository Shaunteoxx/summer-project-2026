import Transaction from "../models/Transaction.js";
import {
  parseMonthYear,
  parseTransactionDate,
  roundMoney,
} from "../lib/validation.js";

const FIXED_CATEGORIES = {
  expense: new Set(["Food & Drinks", "Transport", "Shopping", "Entertainment", "Travel"]),
  income: new Set(["Allowance", "Job", "Gifts"]),
};

function categoryAllowed(user, type, category) {
  if (FIXED_CATEGORIES[type]?.has(category)) return true;
  return (user.customCategories || []).some(
    (item) => item.type === type && item.name === category
  );
}

/** GET /api/transactions?month=&year= */
export async function getTransactions(req, res) {
  const period = parseMonthYear(req.query);
  if (!period) return res.status(400).json({ message: "Invalid month or year" });
  const transactions = await Transaction.find({
    userId: req.user._id,
    ...period,
  }).sort({ date: -1, createdAt: -1 });
  res.json(transactions);
}

/** POST /api/transactions */
export async function createTransaction(req, res) {
  const { description, amount, type, category, date } = req.body;
  if (!description || amount === undefined || !type || !category) {
    return res.status(400).json({
      message: "description, amount, type and category are required",
    });
  }
  if (!["income", "expense"].includes(type)) {
    return res.status(400).json({ message: "Invalid type" });
  }

  const desc = String(description).trim();
  if (!desc) return res.status(400).json({ message: "Description is required" });
  if (desc.length > 120) {
    return res.status(400).json({ message: "Description too long (max 120 characters)" });
  }

  const cat = String(category).trim();
  if (!cat || cat.length > 40 || !categoryAllowed(req.user, type, cat)) {
    return res.status(400).json({ message: "Choose a valid category" });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }
  if (numericAmount > 1e9) {
    return res.status(400).json({ message: "Amount is too large" });
  }

  const when = parseTransactionDate(date);
  if (!when) return res.status(400).json({ message: "Invalid transaction date" });

  const transaction = await Transaction.create({
    userId: req.user._id,
    description: desc,
    amount: roundMoney(numericAmount),
    type,
    category: cat,
    date: when,
    month: when.getUTCMonth(),
    year: when.getUTCFullYear(),
  });
  res.status(201).json(transaction);
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