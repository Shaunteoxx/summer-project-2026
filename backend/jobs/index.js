import cron from "node-cron";
import { env } from "../config/env.js";
import { pushEnabled } from "../lib/push.js";
import { runDailyReminders } from "./dailyReminder.js";
import { runMorningBudget } from "./morningBudget.js";

/**
 * Send whichever notifications are due at `now`. Safe to call more often than
 * hourly: each type is claimed per user per local day.
 */
export async function runNotifications(now = new Date(), options = {}) {
  return {
    morningBudget: await runMorningBudget(now, options),
    dailyReminder: await runDailyReminders(now, options),
  };
}

let task = null;

export function startJobs() {
  if (task) return;
  if (!pushEnabled) {
    console.log("VAPID keys not set; notifications not scheduled");
    return;
  }
  if (env.cronSecret) {
    console.log("CRON_SECRET set; notifications wait for POST /api/jobs/notifications");
    return;
  }
  task = cron.schedule(
    "0 * * * *",
    async () => {
      try {
        const result = await runNotifications(new Date());
        for (const [type, { skipped, ...counts }] of Object.entries(result)) {
          if (counts.recipients) console.log(`Notifications: ${type}`, counts);
        }
      } catch (err) {
        console.error("Notification job failed", { message: err.message });
      }
    },
    // UTC so the tick doesn't move with the host's zone; each user's own zone
    // decides whether it's their hour.
    { name: "notifications", timezone: "UTC", noOverlap: true }
  );
}

export function stopJobs() {
  task?.destroy();
  task = null;
}
