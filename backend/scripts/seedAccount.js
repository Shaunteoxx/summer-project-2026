import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { seedHistoryFor } from "../lib/demoSeed.js";
import User from "../models/User.js";
import Transaction from "../models/Transaction.js";

/**
 * Fill a real (local) account with sample history, so the history-heavy pages
 * have something to show without months of manual logging.
 *
 *   node scripts/seedAccount.js you@example.com
 *   node scripts/seedAccount.js you@example.com --months=14
 *   node scripts/seedAccount.js you@example.com --spend=2.4   # expense multiplier
 *   node scripts/seedAccount.js you@example.com --force      # replace existing
 *
 * Development only. It looks the account up by email and never touches
 * googleId, email or username: sign-in matches on googleId, so inventing an
 * account here would collide with the unique email index the first time you
 * signed in for real and lock you out of it.
 */
const [emailArg, ...flags] = process.argv.slice(2);
const has = (name) => flags.includes(`--${name}`);
const value = (name, fallback) => {
  const hit = flags.find((f) => f.startsWith(`--${name}=`));
  return hit ? Number(hit.split("=")[1]) : fallback;
};

const email = (emailArg || "").trim().toLowerCase();
if (!email || email.startsWith("--")) {
  console.error("Usage: node scripts/seedAccount.js <email> [--months=N] [--force]");
  process.exit(1);
}

const months = value("months", 14);
if (!Number.isInteger(months) || months < 1 || months > 60) {
  console.error("--months must be a whole number between 1 and 60.");
  process.exit(1);
}

await connectDB();

const user = await User.findOne({ email });
if (!user) {
  console.error(
    `No account with the email ${email}.\n` +
      "Sign in through the app once first — this script fills an existing " +
      "account rather than creating one, so that Google sign-in keeps working."
  );
  await mongoose.disconnect();
  process.exit(1);
}

const existing = await Transaction.countDocuments({ userId: user._id });
if (existing > 0 && !has("force")) {
  console.error(
    `${email} already has ${existing} transactions. Seeding replaces them.\n` +
      "Re-run with --force if that's what you want."
  );
  await mongoose.disconnect();
  process.exit(1);
}

// Enough spending that days land on both sides of the daily budget — an
// account that never goes over shows a flat green calendar and teaches you
// nothing about the streak.
const result = await seedHistoryFor(user, {
  months,
  spendScale: value("spend", 2.4),
  withAccounts: true,
});
// Show off the carry: with this on, next month starts with the same target
// instead of $0. Month mode only, which is what a fresh account is on.
user.repeatSavings = true;
await user.save();

console.log(
  `✅ Seeded ${user.username} (${email})\n` +
    `   ${result.transactions} transactions across ${result.months} months\n` +
    `   2 accounts (DBS, Trust) and ${result.transfers} transfers\n` +
    `   savings target set on every month, repeat-every-month on`
);

await mongoose.disconnect();
process.exit(0);
