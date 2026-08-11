import Transfer from "../models/Transfer.js";
import {
  parseTransactionDate,
  parseYmd,
  roundMoney,
} from "../lib/validation.js";
import { dayFromYmd } from "../lib/period.js";

/** An account of the user's own that can still be moved through. */
function liveAccount(user, id) {
  if (!id) return null;
  return (user.accounts || []).find(
    (a) => String(a._id) === String(id) && !a.archived
  );
}

/**
 * POST /api/transfers { from, to, amount, date }
 *
 * Moves money between two of the user's own accounts. Nothing here touches the
 * budget: a transfer is not income or spending, and lives in its own collection
 * precisely so no aggregation can mistake it for either.
 */
export async function createTransfer(req, res) {
  const { from, to, amount, date } = req.body;

  const source = liveAccount(req.user, from);
  const target = liveAccount(req.user, to);
  if (!source || !target) {
    return res.status(400).json({ message: "Choose two of your own accounts" });
  }
  if (String(source._id) === String(target._id)) {
    return res.status(400).json({ message: "Pick two different accounts" });
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than zero" });
  }
  if (numericAmount > 1e9) {
    return res.status(400).json({ message: "Amount is too large" });
  }

  const when = parseTransactionDate(date);
  if (!when) return res.status(400).json({ message: "Invalid transfer date" });

  const transfer = await Transfer.create({
    userId: req.user._id,
    from: source._id,
    to: target._id,
    amount: roundMoney(numericAmount),
    date: when,
  });
  res.status(201).json(transfer);
}

/** GET /api/transfers?start=&end=  — newest first, for the ledger. */
export async function getTransfers(req, res) {
  const { start, end } = req.query;
  const filter = { userId: req.user._id };

  if (start !== undefined || end !== undefined) {
    const from = parseYmd(start);
    const to = parseYmd(end);
    if (!from || !to || start > end) {
      return res.status(400).json({ message: "Invalid date range" });
    }
    filter.date = { $gte: dayFromYmd(start), $lte: dayFromYmd(end) };
  }

  const transfers = await Transfer.find(filter).sort({ date: -1, createdAt: -1 });
  res.json(transfers);
}

/** DELETE /api/transfers/:id */
export async function deleteTransfer(req, res) {
  const transfer = await Transfer.findOneAndDelete({
    _id: req.params.id,
    userId: req.user._id,
  });
  if (!transfer) return res.status(404).json({ message: "Transfer not found" });
  res.json({ message: "Deleted", id: transfer._id });
}
