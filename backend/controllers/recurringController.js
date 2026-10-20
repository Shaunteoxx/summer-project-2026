import { parseYmd, utcToday, ymd } from "../lib/validation.js";
import { addDays } from "../lib/period.js";
// Repeating rules describe entries, so their fields obey the same rules the
// transaction endpoints apply — one definition, in lib/entryFields.js.
import {
  checkAccountId,
  checkAmount,
  checkCategory,
  checkDescription,
  checkType,
} from "../lib/entryFields.js";

// Enough for a rent, a phone bill and every subscription a person actually
// keeps, without the list on the More page turning into something to scroll.
const MAX_RECURRING = 20;

/** Shape sent to the client. */
export const presentRule = (r) => ({
  id: r._id,
  description: r.description,
  amount: r.amount,
  type: r.type,
  category: r.category,
  accountId: r.accountId ? String(r.accountId) : null,
  frequency: r.frequency,
  dayOfMonth: r.dayOfMonth ?? null,
  weekday: r.weekday ?? null,
  startKey: r.startKey,
  lastRunKey: r.lastRunKey ?? null,
  paused: !!r.paused,
});

/**
 * Validate the fields a rule shares with a transaction, plus its schedule.
 * `base` supplies the current values when patching, so a partial update is
 * checked as a whole — changing only the type has to re-check the category
 * against it, or the rule starts producing entries the API would refuse.
 */
function checkRule(user, body, base = {}) {
  const merged = { ...base, ...body };

  // The first four are exactly a transaction's fields, checked by exactly the
  // same code — a rule that accepted something transactions refuse would sit
  // there producing entries the API would reject.
  const description = checkDescription(merged.description);
  if (description.message) return { message: description.message };

  const type = checkType(merged.type);
  if (type.message) return { message: type.message };

  const amount = checkAmount(merged.amount);
  if (amount.message) return { message: amount.message };

  const category = checkCategory(user, merged.type, merged.category);
  if (category.message) return { message: category.message };

  if (!["monthly", "weekly"].includes(merged.frequency)) {
    return { message: "Choose monthly or weekly" };
  }

  let dayOfMonth = null;
  let weekday = null;
  if (merged.frequency === "monthly") {
    dayOfMonth = Number(merged.dayOfMonth);
    if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
      return { message: "Choose a day of the month between 1 and 31" };
    }
  } else {
    weekday = Number(merged.weekday);
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      return { message: "Choose a day of the week" };
    }
  }

  const account = checkAccountId(user, merged.accountId);
  if (!account.ok) return { message: "Choose a valid account" };

  return {
    value: {
      description: description.value,
      amount: amount.value,
      type: type.value,
      category: category.value,
      accountId: account.value,
      frequency: merged.frequency,
      dayOfMonth,
      weekday,
    },
  };
}

/**
 * POST /api/auth/recurring -> create a repeating entry.
 *
 * `startKey` may be today or later, never earlier. A rule that back-filled
 * would write transactions into days the user has already lived through,
 * retroactively changing their daily budgets and their streak — the same trap
 * lib/savingsCarry.js exists to avoid. Past entries are added by hand.
 */
export async function addRecurring(req, res) {
  const user = req.user;
  const checked = checkRule(user, req.body);
  if (checked.message) return res.status(400).json({ message: checked.message });

  const todayKey = ymd(utcToday());
  const startKey = req.body.startKey ? parseYmd(req.body.startKey) : utcToday();
  if (!startKey) return res.status(400).json({ message: "Invalid start date" });

  // The client sends its own local date, which can legitimately read a day
  // behind the server's UTC date for anyone west of it. A day of skew is
  // timezone, not intent, so it clamps up to today rather than being refused;
  // anything older is a real attempt to back-date and is turned away.
  let startYmd = ymd(startKey);
  if (startYmd < todayKey) {
    if (startYmd < ymd(addDays(utcToday(), -1))) {
      return res.status(400).json({
        message: "A repeating entry can only start today or later.",
      });
    }
    startYmd = todayKey;
  }

  if (user.recurring.length >= MAX_RECURRING) {
    return res.status(400).json({ message: "Repeating entry limit reached" });
  }

  user.recurring.push({ ...checked.value, startKey: startYmd });
  await user.save();
  res.status(201).json(presentRule(user.recurring[user.recurring.length - 1]));
}

/**
 * PATCH /api/auth/recurring/:id
 *
 * Edits apply to what the rule produces next. Entries it has already written
 * are ordinary transactions and are left exactly as they are — putting up the
 * rent changes future rent, not the rent you already paid.
 */
export async function updateRecurring(req, res) {
  const user = req.user;
  const rule = user.recurring.id(req.params.id);
  if (!rule) return res.status(404).json({ message: "Repeating entry not found" });

  const { paused } = req.body;
  const editable = { ...req.body };
  delete editable.paused;
  delete editable.startKey;

  if (Object.keys(editable).length > 0) {
    const checked = checkRule(user, editable, {
      description: rule.description,
      amount: rule.amount,
      type: rule.type,
      category: rule.category,
      accountId: rule.accountId,
      frequency: rule.frequency,
      dayOfMonth: rule.dayOfMonth,
      weekday: rule.weekday,
    });
    if (checked.message) return res.status(400).json({ message: checked.message });
    Object.assign(rule, checked.value);
  }

  if (paused !== undefined) {
    if (typeof paused !== "boolean") {
      return res.status(400).json({ message: "Invalid paused flag" });
    }
    // Resuming picks up from today rather than back-filling the pause: those
    // entries genuinely didn't happen while it was switched off.
    if (rule.paused && !paused) rule.lastRunKey = ymd(utcToday());
    rule.paused = paused;
  }

  await user.save();
  res.json(presentRule(rule));
}

/**
 * DELETE /api/auth/recurring/:id
 *
 * Unlike an account, a rule can always be deleted. Nothing points back at it:
 * the transactions it produced are complete on their own and stay in the
 * ledger, which is what you want when you cancel a subscription — the months
 * you did pay for still happened.
 */
export async function removeRecurring(req, res) {
  const user = req.user;
  const rule = user.recurring.id(req.params.id);
  if (!rule) return res.status(404).json({ message: "Repeating entry not found" });

  user.recurring.pull(req.params.id);
  await user.save();
  res.json({ message: "Deleted", id: req.params.id });
}
