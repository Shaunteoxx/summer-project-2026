import "dotenv/config";
import mongoose from "mongoose";
import { connectDB } from "../config/db.js";
import { runDailyReminders } from "../jobs/dailyReminder.js";
import { runNotifications } from "../jobs/index.js";
import { runMorningBudget } from "../jobs/morningBudget.js";
import { pushEnabled } from "../lib/push.js";
import User from "../models/User.js";

// CLI: send whichever notifications are due, through the same code the hourly
// run uses.
//   node scripts/runNotifications.js --dry                      plan only; no claim, no send
//   node scripts/runNotifications.js --at=2026-09-16T13:00:00Z  pretend it is this instant
//   node scripts/runNotifications.js --email=you@example.com    only this account
//   node scripts/runNotifications.js --type=morningBudget       or dailyReminder; default both
//   node scripts/runNotifications.js --again                    forget today's sends first
const RUNNERS = { dailyReminder: runDailyReminders, morningBudget: runMorningBudget };

const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    return [key, value ?? true];
  })
);

const now = args.at ? new Date(args.at) : new Date();
if (Number.isNaN(now.getTime())) {
  console.error(`Invalid --at: ${args.at}`);
  process.exit(1);
}
if (args.type && !RUNNERS[args.type]) {
  console.error(`--type must be one of: ${Object.keys(RUNNERS).join(", ")}`);
  process.exit(1);
}
if (!pushEnabled && !args.dry) {
  console.error("VAPID keys are not set; use --dry or add them to backend/.env");
  process.exit(1);
}

await connectDB();

let userIds;
if (args.email) {
  const user = await User.findOne({ email: String(args.email).toLowerCase() }).select("_id");
  if (!user) {
    console.error(`No user with email ${args.email}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  userIds = [user._id];
}

if (args.again) {
  const types = args.type ? [args.type] : Object.keys(RUNNERS);
  await User.updateMany(
    userIds ? { _id: { $in: userIds } } : {},
    { $set: Object.fromEntries(types.map((t) => [`notifications.${t}.lastSentKey`, null])) }
  );
}

const options = { dryRun: Boolean(args.dry), userIds };
const result = args.type
  ? { [args.type]: await RUNNERS[args.type](now, options) }
  : await runNotifications(now, options);
console.log(`At ${now.toISOString()}:`);
console.dir(result, { depth: null });
await mongoose.disconnect();
process.exit(0);
