import crypto from "node:crypto";
import { env } from "../config/env.js";
import { runNotifications } from "../jobs/index.js";
import { pushEnabled } from "../lib/push.js";

const digest = (value) => crypto.createHash("sha256").update(String(value)).digest();

/**
 * POST /api/jobs/notifications, header X-Cron-Secret -> send whatever is due
 * now. Called hourly by Cloud Scheduler.
 *
 * Responds only after the run finishes: Cloud Run may pause the CPU once a
 * response is sent, which would strand anything still in flight.
 */
export async function runNotificationsJob(req, res) {
  // Not configured means the route doesn't exist, rather than advertising it.
  if (!env.cronSecret) return res.status(404).json({ message: "Not found" });
  // Hashing first gives equal-length buffers, so the comparison is constant-time.
  if (!crypto.timingSafeEqual(digest(req.get("x-cron-secret") ?? ""), digest(env.cronSecret))) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  if (!pushEnabled) return res.status(503).json({ message: "Push is not configured" });

  const result = await runNotifications(new Date());
  const counts = Object.fromEntries(
    Object.entries(result).map(([type, { skipped, ...rest }]) => [type, rest])
  );
  res.json(counts);
}
