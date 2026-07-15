import Transaction from "../models/Transaction.js";
import { recomputeSummary } from "./summaryController.js";

/** GET /api/transactions?month=&year=  (defaults to current month) */
export async function getTransactions(req, res) {
  const now = new Date();
  const month =
    req.query.month !== undefined ? Number(req.query.month) : now.getMonth();
  const year =
    req.query.year !== undefined ? Number(req.query.year) : now.getFullYear();

  const transactions = await Transaction.find({
    userId: req.user._id,
    month,
    year,
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
  if (!desc) {
    return res.status(400).json({ message: "Description is required" });
  }
  if (desc.length > 120) {
    return res
      .status(400)
      .json({ message: "Description too long (max 120 characters)" });
  }

  const cat = String(category).trim();
  if (!cat) {
    return res.status(400).json({ message: "Category is required" });
  }
  if (cat.length > 40) {
    return res.status(400).json({ message: "Category too long" });
  }

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }
  if (value > 1e9) {
    return res.status(400).json({ message: "Amount is too large" });
  }

  const when = date ? new Date(date) : new Date();
  if (Number.isNaN(when.getTime())) {
    return res.status(400).json({ message: "Invalid date" });
  }

  const transaction = await Transaction.create({
    userId: req.user._id,
    description: desc,
    amount: value,
    type,
    category: cat,
    date: when,
    month: when.getMonth(),
    year: when.getFullYear(),
  });

  await recomputeSummary(req.user._id, transaction.month, transaction.year);

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

  await recomputeSummary(req.user._id, transaction.month, transaction.year);

  res.json({ message: "Deleted", id: transaction._id });
}
