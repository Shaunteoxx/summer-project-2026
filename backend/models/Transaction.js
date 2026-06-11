import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    description: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0 },
    // Income vs expense — drives totals and the +/- sign.
    type: {
      type: String,
      enum: ["income", "expense"],
      required: true,
    },
    // Spending/earning category label, e.g. "Food & Drinks" or "Allowance".
    category: { type: String, required: true, trim: true },
    date: { type: Date, required: true, default: Date.now },
    month: { type: Number, required: true }, // 0-11 (JS month)
    year: { type: Number, required: true },
  },
  { timestamps: true }
);

transactionSchema.index({ userId: 1, year: 1, month: 1 });

export default mongoose.model("Transaction", transactionSchema);
