import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true, maxlength: 120 },
    amount: { type: Number, required: true, min: 0.01, max: 1e9 },
    // Income vs expense — drives totals and the +/- sign.
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
    },
    // Spending/earning category label, e.g. "Food & Drinks" or "Allowance".
    category: { type: String, required: true, trim: true, maxlength: 40 },
    date: { type: Date, required: true, default: Date.now },
    month: { type: Number, required: true, min: 0, max: 11 },
    year: { type: Number, required: true, min: 2000, max: 2100 },
    // Which of the user's accounts the money moved through. A subdocument id on
    // User.accounts rather than a collection, so there is no `ref` — the client
    // resolves name and colour from the auth profile, exactly as it already
    // does for custom categories. Null on rows logged before the user made any
    // accounts, and on any they leave untagged.
    accountId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Set when this row was produced by a rule in User.recurring, so the ledger
    // can say where a row nobody typed came from. Null on everything else.
    recurringId: { type: mongoose.Schema.Types.ObjectId, default: null },
    // The occurrence date this row was produced for, as a UTC YYYY-MM-DD key.
    // Kept alongside `date` rather than derived from it because it is what
    // makes materialising idempotent, and it has to survive the user correcting
    // the date afterwards — otherwise the rule would produce the day again.
    dueKey: { type: String, default: null },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, year: 1, month: 1 });
transactionSchema.index({ userId: 1, accountId: 1 });
// One row per rule per due date, enforced by the database rather than by the
// materialiser checking first: two requests arriving together both compute the
// same occurrence, and only one may win. Partial so the millions of ordinary
// rows, which share `recurringId: null`, stay out of the index entirely.
transactionSchema.index(
  { userId: 1, recurringId: 1, dueKey: 1 },
  {
    unique: true,
    partialFilterExpression: { recurringId: { $type: "objectId" } },
  }
);

export default mongoose.model("Transaction", transactionSchema);
