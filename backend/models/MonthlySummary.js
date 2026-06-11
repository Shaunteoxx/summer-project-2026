import mongoose from "mongoose";

const monthlySummarySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    month: { type: Number, required: true }, // 0-11 (JS month)
    year: { type: Number, required: true },
    totalIncome: { type: Number, default: 0 },
    totalExpenses: { type: Number, default: 0 },
    totalSaved: { type: Number, default: 0 },
    percentageSaved: { type: Number, default: 0 },
    percentageSpent: { type: Number, default: 0 },
  },
  { timestamps: true }
);

monthlySummarySchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

export default mongoose.model("MonthlySummary", monthlySummarySchema);
