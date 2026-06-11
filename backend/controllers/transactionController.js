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
  if (Number(amount) < 0) {
    return res.status(400).json({ message: "Amount must be positive" });
  }

  const when = date ? new Date(date) : new Date();

  const transaction = await Transaction.create({
    userId: req.user._id,
    description,
    amount: Number(amount),
    type,
    category: String(category).trim(),
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
