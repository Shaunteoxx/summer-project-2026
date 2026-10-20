import { MIN_YEAR, MAX_YEAR, roundMoney } from "../lib/validation.js";

const SAVINGS_KEY_RE = /^\d{4}-(0|1[01]|[0-9])$/;

/**
 * PUT /api/auth/savings { key: "YYYY-M", amount, repeat? } -> set one month's
 * savings target, and optionally carry it into future months.
 */
export async function setSavings(req, res) {
  const user = req.user;
  const { key, amount, repeat } = req.body;

  if (!SAVINGS_KEY_RE.test(key || "")) {
    return res.status(400).json({ message: "Invalid month" });
  }
  const [year] = key.split("-").map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) {
    return res.status(400).json({ message: "Invalid month" });
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 0 || numericAmount > 1e9) {
    return res.status(400).json({ message: "Invalid savings amount" });
  }
  if (repeat !== undefined && typeof repeat !== "boolean") {
    return res.status(400).json({ message: "Invalid repeat flag" });
  }
  const value = roundMoney(numericAmount);

  // Zero is stored rather than deleted. Carrying a target forward has to be
  // able to tell "I want to save nothing this month" from "I haven't set this
  // month yet" — deleting the key collapses the two, and the carry would
  // overwrite a deliberate zero with last month's number.
  user.savingsByMonth.set(key, value);
  if (repeat !== undefined) user.repeatSavings = repeat;
  await user.save();

  res.json({
    savingsByMonth: Object.fromEntries(user.savingsByMonth),
    repeatSavings: user.repeatSavings,
  });
}
