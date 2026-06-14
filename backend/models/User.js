import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    // Read-only demo account used by the public "Explore the demo" button.
    isDemo: { type: Boolean, default: false },
    profilePicture: { type: String, default: "" },
    // Chosen animal avatar id (e.g. "cat"); empty = fall back to Google photo.
    avatar: { type: String, default: "" },
    // Days (YYYY-MM-DD) the user spent a "save" on to repair their streak.
    restoredDays: { type: [String], default: [] },
    // Amount the user wants to set aside per month, keyed by "YYYY-M" (M is the
    // 0-based month). Reserved before the spendable daily budget is calculated.
    savingsByMonth: { type: Map, of: Number, default: {} },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // User-defined categories on top of the fixed built-in set.
    customCategories: [
      {
        name: { type: String, required: true, trim: true },
        type: { type: String, enum: ["income", "expense"], required: true },
        color: { type: String, required: true },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("User", userSchema);
