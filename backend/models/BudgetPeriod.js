import mongoose from "mongoose";
import { MIN_PERIOD_DAYS, MAX_PERIOD_DAYS } from "../lib/period.js";

/**
 * One custom-length budget period the user started by hand (days mode only).
 * Month mode derives its periods from the calendar and stores nothing here.
 *
 * Dates are UTC YYYY-MM-DD strings rather than Dates so that comparisons are
 * plain string ordering and match the day keys the streak already uses.
 */
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const budgetPeriodSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    start: { type: String, required: true, match: YMD },
    // Derived from start + length on write; stored so range queries and the
    // resolver's binary search don't have to recompute it.
    end: { type: String, required: true, match: YMD },
    length: {
      type: Number,
      required: true,
      min: MIN_PERIOD_DAYS,
      max: MAX_PERIOD_DAYS,
    },
    // Reserved out of the period's income before the daily budget is spread.
    savingsTarget: { type: Number, default: 0, min: 0, max: 1e9 },
  },
  { timestamps: true }
);

budgetPeriodSchema.index({ userId: 1, start: 1 }, { unique: true });

export default mongoose.model("BudgetPeriod", budgetPeriodSchema);
