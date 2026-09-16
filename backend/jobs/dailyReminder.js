import { parseYmd } from "../lib/validation.js";
import { sendToUser } from "../lib/push.js";
import Transaction from "../models/Transaction.js";
import { withoutLogged } from "./reminderPlan.js";
import { claim, findDue } from "./notify.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const TYPE = "dailyReminder";

export const DAILY_REMINDER_PAYLOAD = Object.freeze({
  type: TYPE,
  title: "Nothing logged today",
  body: "Add today's spending before the day ends so tomorrow's budget stays right.",
  url: "/transactions",
  tag: "daily-reminder",
});

/** User ids (as strings) among `ids` with at least one entry on `dayKey`. */
export async function loggedOn(dayKey, ids) {
  const day = parseYmd(dayKey);
  const logged = await Transaction.distinct("userId", {
    userId: { $in: ids },
    // year and month put this on the userId/year/month index.
    year: day.getUTCFullYear(),
    month: day.getUTCMonth(),
    // Transaction.date is a UTC midnight labelling a calendar day, so a local
    // day key maps straight onto it with no offset arithmetic.
    date: { $gte: day, $lt: new Date(day.getTime() + DAY_MS) },
  });
  return new Set(logged.map(String));
}

/**
 * Evening reminder: to everyone whose local reminder hour is `now` and who has
 * no entries on their local day. `dryRun` plans without claiming or sending;
 * `send` replaces the network call in tests.
 */
export async function runDailyReminders(now = new Date(), { dryRun = false, userIds, send } = {}) {
  const { candidates, due, skipped } = await findDue(TYPE, now, { userIds });

  // Around midnight UTC, due users can sit on two different day keys.
  const byDay = new Map();
  for (const { id, dayKey } of due) {
    if (!byDay.has(dayKey)) byDay.set(dayKey, []);
    byDay.get(dayKey).push(id);
  }
  const logged = new Set();
  for (const [dayKey, ids] of byDay) {
    for (const id of await loggedOn(dayKey, ids)) logged.add(id);
  }

  const recipients = withoutLogged(due, logged);
  const summary = { candidates, due: due.length, recipients: recipients.length, sent: 0, pruned: 0, skipped };
  if (dryRun) return { ...summary, dryRun: true, recipientIds: recipients.map((r) => r.id) };

  for (const { id, dayKey } of recipients) {
    if (!(await claim(TYPE, id, dayKey))) continue;
    const result = await sendToUser(id, DAILY_REMINDER_PAYLOAD, { type: TYPE, send });
    summary.sent += result.sent;
    summary.pruned += result.pruned;
  }
  return summary;
}
