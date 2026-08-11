import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    googleId: { type: String, required: true, unique: true },
    username: { type: String, required: true, unique: true, trim: true },
    // Case-normalized key closes the race left by case-insensitive pre-checks.
    usernameKey: { type: String, unique: true, sparse: true, select: false },
    email: { type: String, required: true, unique: true, lowercase: true },
    // Read-only demo account used by the public "Explore the demo" button.
    isDemo: { type: Boolean, default: false },
    // Bumped on sign-out to invalidate every token already issued to this user.
    // Tokens carry the version they were signed with; a mismatch fails auth.
    tokenVersion: { type: Number, default: 0 },
    profilePicture: { type: String, default: "" },
    // Chosen animal avatar id (e.g. "cat"); empty = fall back to Google photo.
    avatar: { type: String, default: "" },
    // Days (YYYY-MM-DD) the user spent a "save" on to repair their streak.
    restoredDays: { type: [String], default: [] },
    // How the budget window is worked out. "month" derives it from the calendar
    // (and reads savingsByMonth below); "days" uses the BudgetPeriod rows the
    // user starts by hand. Switching modes leaves the other mode's data intact.
    budgetMode: { type: String, enum: ["month", "days"], default: "month" },
    // Amount the user wants to set aside per month, keyed by "YYYY-M" (M is the
    // 0-based month). Reserved before the spendable daily budget is calculated.
    //
    // A missing key means "never set" and a stored 0 means "set to nothing" —
    // a distinction repeatSavings below depends on, so writers must store 0
    // rather than deleting the key.
    savingsByMonth: {
      type: Map,
      of: { type: Number, min: 0, max: 1e9 },
      default: {},
    },
    // Carry the savings target into each new calendar month instead of making
    // the user re-enter the same number. Materialised as a real savingsByMonth
    // entry for the current month only (see lib/savingsCarry.js) — never as a
    // read-time fallback, which would retroactively give past months a target
    // they never had and rewrite the streak. Month mode only; days mode keeps
    // its target on the BudgetPeriod row.
    repeatSavings: { type: Boolean, default: false },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    // Bank accounts the user splits their spending across — one card for
    // PayWave, another for PayNow. Embedded for the same reasons as
    // customCategories below: a handful per user, wanted on every page, and
    // they ride along with /api/auth/me instead of costing a request.
    //
    // No opening balance on purpose. An account's figure is this period's money
    // in it (income in − spent + transfers in − transfers out), which keeps it
    // consistent with everything else here and makes the per-account totals sum
    // to the period's income minus spending. It is deliberately not the bank's
    // balance; see ACCOUNTS_PLAN.md §2.2.
    accounts: [
      {
        name: { type: String, required: true, trim: true, maxlength: 24 },
        color: { type: String, required: true },
        archived: { type: Boolean, default: false },
      },
    ],
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

userSchema.pre("validate", function normalizeUsername() {
  if (this.username) this.usernameKey = this.username.trim().toLowerCase();
});

export default mongoose.model("User", userSchema);
