import { env } from "../config/env.js";
import PushSubscription from "../models/PushSubscription.js";
import User from "../models/User.js";
import { planReminders } from "./reminderPlan.js";

export const NOTIFICATION_TYPES = Object.freeze({
  dailyReminder: { defaultHour: () => env.dailyReminderHour },
  morningBudget: { defaultHour: () => env.morningBudgetHour },
});

/**
 * Everyone with at least one device wanting `type` whose local hour for it is
 * `now` and who hasn't had it today. Loads what the planner needs and nothing
 * else; `userIds` narrows the run.
 */
export async function findDue(type, now, { userIds } = {}) {
  const wanting = await PushSubscription.distinct("userId", {
    [`types.${type}`]: true,
    ...(userIds ? { userId: { $in: userIds } } : {}),
  });
  if (!wanting.length) return { candidates: 0, due: [], skipped: [] };

  const users = await User.find({
    _id: { $in: wanting },
    isDemo: { $ne: true },
    // Never captured: guessing UTC would notify someone in the middle of the night.
    timezone: { $ne: "" },
  })
    .select(`_id timezone notifications.${type}`)
    .lean();

  const { due, skipped } = planReminders(
    users.map((u) => ({
      id: String(u._id),
      timezone: u.timezone,
      hour: u.notifications?.[type]?.hour ?? NOTIFICATION_TYPES[type].defaultHour(),
      lastSentKey: u.notifications?.[type]?.lastSentKey ?? null,
    })),
    now
  );
  return { candidates: users.length, due, skipped };
}

/**
 * Mark `type` sent for this local day, if nothing else already has.
 *
 * Callers claim before sending, so overlapping runs or a second instance can't
 * both send. Deliberately at-most-once: a crash between claim and send costs
 * one missed notification, which beats sending it twice.
 */
export async function claim(type, userId, dayKey) {
  const field = `notifications.${type}.lastSentKey`;
  const result = await User.updateOne(
    { _id: userId, [field]: { $ne: dayKey } },
    { $set: { [field]: dayKey } }
  );
  return result.modifiedCount === 1;
}
