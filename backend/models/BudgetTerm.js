import mongoose from "mongoose";
import { MIN_TERM_MONTHS, MAX_TERM_MONTHS } from "../lib/period.js";

/**
 * A stretch that one lump sum has to last, budgeted a month at a time.
 *
 * Deliberately only a *window*. There is no amount here: the money is the
 * income the user logs as normal, exactly as in the other two modes. Storing a
 * total as well would double-count it, because the lump sum still has to be
 * logged to reach the ledger and the accounts card.
 *
 * There is no savings target either. Cycles are calendar months, so the target
 * keeps living in User.savingsByMonth and month mode's repeat-savings carry
 * goes on working untouched.
 *
 * Old terms are kept rather than replaced. The streak re-resolves every day
 * since the user's first transaction on every request, so dropping a finished
 * term would turn last semester's days untracked and rewrite history behind
 * them — the same trap lib/savingsCarry.js is written to avoid.
 *
 * Dates are UTC YYYY-MM-DD strings rather than Dates so that comparisons are
 * plain string ordering and match the day keys the streak already uses.
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const budgetTermSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    start: { type: String, required: true, match: YMD },
    // Derived from start + months on write, for the same reason BudgetPeriod
    // stores its end: range queries and the resolver's search shouldn't have to
    // recompute it.
    end: { type: String, required: true, match: YMD },
    months: {
      type: Number,
      required: true,
      min: MIN_TERM_MONTHS,
      max: MAX_TERM_MONTHS,
    },
  },
  { timestamps: true }
);

budgetTermSchema.index({ userId: 1, start: 1 }, { unique: true });

export default mongoose.model("BudgetTerm", budgetTermSchema);
