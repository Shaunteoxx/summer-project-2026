import webpush from "web-push";
import { env } from "../config/env.js";
import PushSubscription from "../models/PushSubscription.js";

export const pushEnabled = Boolean(env.vapidPublicKey && env.vapidPrivateKey);
if (pushEnabled) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
}

// Only these mean the push service has discarded the subscription for good.
const GONE = new Set([404, 410]);

/**
 * Push `payload` to the user's devices, deleting any the push service reports
 * as gone. With `type`, only devices that switched that notification on.
 * Returns `{ sent, pruned }`.
 *
 * `send` is injectable so the prune rules can be tested without a network.
 */
export async function sendToUser(
  userId,
  payload,
  { type, send = webpush.sendNotification } = {}
) {
  if (!pushEnabled) return { sent: 0, pruned: 0 };
  const subs = await PushSubscription.find({
    userId,
    ...(type ? { [`types.${type}`]: true } : {}),
  }).lean();
  const body = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await send(
          { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } },
          body,
          // A phone that is off at 9pm still gets it when it wakes, but not the
          // next morning. `topic` collapses an undelivered backlog to one.
          { TTL: 6 * 60 * 60, urgency: "normal", ...(payload.tag ? { topic: payload.tag } : {}) }
        );
        sent += 1;
        await PushSubscription.updateOne({ _id: sub._id }, { $set: { lastSuccessAt: new Date() } });
      } catch (err) {
        // A 429, 5xx or timeout is the push service having a bad day. Pruning on
        // those would silently unsubscribe a working device.
        if (GONE.has(err.statusCode)) {
          await PushSubscription.deleteOne({ _id: sub._id });
          pruned += 1;
        } else {
          console.error("Push send failed", {
            userId: String(userId),
            statusCode: err.statusCode,
            message: err.message,
          });
        }
      }
    })
  );

  return { sent, pruned };
}
