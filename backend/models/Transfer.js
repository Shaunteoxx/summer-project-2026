import mongoose from "mongoose";

/**
 * Money moved between two of the user's own accounts.
 *
 * Deliberately NOT a Transaction. A transfer is neither income nor expense, and
 * the four places that branch on `type` would each classify an unknown third
 * value differently — the streak would read it as income and inflate the daily
 * budget, the home totals and leaderboard would read it as spending, and the
 * monthly summaries would ignore it. Keeping transfers in their own collection
 * means every one of those aggregations is blind to them by construction rather
 * than by remembering to filter in four places. See ACCOUNTS_PLAN.md §2.3.
 *
 * `from` and `to` are subdocument ids on User.accounts, so no `ref`.
 */
const transferSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    from: { type: mongoose.Schema.Types.ObjectId, required: true },
    to: { type: mongoose.Schema.Types.ObjectId, required: true },
    amount: { type: Number, required: true, min: 0.01, max: 1e9 },
    // UTC midnight, matching Transaction. No month/year alongside it: unlike
    // transactions, transfers are only ever queried by date range for the
    // active period, never grouped by calendar month.
    date: { type: Date, required: true },
  },
  { timestamps: true }
);

transferSchema.index({ userId: 1, date: 1 });

export default mongoose.model("Transfer", transferSchema);
