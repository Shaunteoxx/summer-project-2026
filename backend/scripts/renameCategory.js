/**
 * Rename a category everywhere it is stored.
 *
 * Categories are stored as their label, not as an id — a transaction says
 * "F & B", a repeating rule says "F & B". That is deliberate (a rule keeps
 * working if the custom category behind it is deleted, see models/User.js) and
 * it is exactly why renaming one is a data migration rather than a one-line
 * edit: change `FIXED_CATEGORIES` alone and every row already written keeps the
 * old label, which the API will then refuse on the next edit.
 *
 * Two places hold one:
 *   - transactions.category
 *   - users.recurring[].category
 *
 * Custom categories are deliberately not touched. A user's own category can
 * never collide with a fixed name (the API refuses it), so a custom one that
 * happens to match the *new* name is a different thing that happens to share
 * a label, and renaming it would merge two categories silently.
 *
 * Usage, from backend/:
 *   node scripts/renameCategory.js --from "Food & Drinks" --to "F & B" --dry
 *   node scripts/renameCategory.js --from "Food & Drinks" --to "F & B"
 *
 * Dry run first. It prints the same counts without writing, so the number of
 * rows about to change is known before anything changes.
 */
// Standalone scripts don't go through index.js, which is where the server
// loads its .env — without this the script would silently fall back to the
// development defaults in config/env.js and rename rows in the wrong database.
// A MONGO_URI already in the environment still wins, which is how this gets
// pointed at production for one command without editing .env.
import "dotenv/config";
import mongoose from "mongoose";

import { env } from "../config/env.js";
import Transaction from "../models/Transaction.js";
import User from "../models/User.js";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? null : process.argv[i + 1];
}

const from = arg("from");
const to = arg("to");
const dry = process.argv.includes("--dry");

if (!from || !to) {
  console.error(
    'Usage: node scripts/renameCategory.js --from "Old name" --to "New name" [--dry]'
  );
  process.exit(1);
}

// Print the target before connecting. The local and Atlas URIs differ by one
// commented-out line in .env, and knowing which one a migration just rewrote
// after the fact is too late.
console.log(`Database: ${env.mongoUri.replace(/\/\/[^@]+@/, "//***@")}`);
console.log(`Rename:   ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
console.log(dry ? "Mode:     dry run, nothing will be written\n" : "Mode:     writing\n");

await mongoose.connect(env.mongoUri);

const transactions = await Transaction.countDocuments({ category: from });
// One user can hold several rules; count the rules, not the users, so the
// number means the same thing as the transaction count beside it.
const usersWithRules = await User.find({ "recurring.category": from })
  .select("recurring.category")
  .lean();
const rules = usersWithRules.reduce(
  (n, u) => n + u.recurring.filter((r) => r.category === from).length,
  0
);

console.log(`transactions.category:      ${transactions}`);
console.log(`users.recurring[].category: ${rules} (across ${usersWithRules.length} users)`);

if (!dry && transactions + rules > 0) {
  const txnResult = await Transaction.updateMany(
    { category: from },
    { $set: { category: to } }
  );
  // Positional-filtered update: `$[el]` rewrites every matching element of the
  // array in one pass, rather than reading each user and writing them back.
  const userResult = await User.updateMany(
    { "recurring.category": from },
    { $set: { "recurring.$[el].category": to } },
    { arrayFilters: [{ "el.category": from }] }
  );
  console.log(
    `\nWrote ${txnResult.modifiedCount} transactions, ` +
      `${userResult.modifiedCount} users.`
  );
} else if (!dry) {
  console.log("\nNothing to write.");
}

await mongoose.disconnect();
