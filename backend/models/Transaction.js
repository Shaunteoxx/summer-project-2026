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
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, year: 1, month: 1 });

export default mongoose.model("Transaction", transactionSchema);
