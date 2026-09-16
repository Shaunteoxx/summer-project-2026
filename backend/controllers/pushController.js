import { env } from "../config/env.js";
import { isValidTimeZone } from "../lib/localTime.js";
import { pushEnabled, sendToUser } from "../lib/push.js";
import PushSubscription from "../models/PushSubscription.js";
import { NOTIFICATION_TYPES } from "../jobs/notify.js";

const NOT_CONFIGURED = { message: "Notifications aren't set up on this server." };
const DEMO_BLOCKED = { message: "Notifications aren't available in the demo." };
const TYPE_NAMES = Object.keys(NOTIFICATION_TYPES);

const presentTypes = (sub) =>
  Object.fromEntries(TYPE_NAMES.map((name) => [name, !!sub?.types?.[name]]));

/** GET /api/push/key -> the VAPID public key, or null when push is off. */
export async function getPublicKey(req, res) {
  res.json({ publicKey: pushEnabled ? env.vapidPublicKey : null });
}

/**
 * GET /api/push/subscription?endpoint= -> which notifications this device has
 * on, or 404 if the server doesn't know it for this user.
 */
export async function getSubscription(req, res) {
  const { endpoint } = req.query;
  if (typeof endpoint !== "string" || !endpoint) {
    return res.status(400).json({ message: "endpoint is required" });
  }
  const sub = await PushSubscription.findOne({ endpoint, userId: req.user._id }).lean();
  if (!sub) return res.status(404).json({ message: "Not subscribed" });
  res.json({ types: presentTypes(sub) });
}

/**
 * POST /api/push/subscription { endpoint, keys, types, timezone? } -> register
 * this device with the notifications it wants.
 */
export async function saveSubscription(req, res) {
  if (!pushEnabled) return res.status(503).json(NOT_CONFIGURED);
  if (req.user.isDemo) return res.status(403).json(DEMO_BLOCKED);

  const { endpoint, keys, types, timezone } = req.body || {};
  if (
    typeof endpoint !== "string" ||
    !endpoint.startsWith("https://") ||
    endpoint.length > 2000 ||
    typeof keys?.p256dh !== "string" ||
    typeof keys?.auth !== "string" ||
    keys.p256dh.length > 200 ||
    keys.auth.length > 100
  ) {
    return res.status(400).json({ message: "Invalid subscription" });
  }
  if (
    !types ||
    typeof types !== "object" ||
    Object.keys(types).some((name) => !TYPE_NAMES.includes(name)) ||
    Object.values(types).some((value) => typeof value !== "boolean")
  ) {
    return res.status(400).json({ message: "Invalid notification types" });
  }
  if (timezone !== undefined && !isValidTimeZone(timezone)) {
    return res.status(400).json({ message: "Invalid time zone" });
  }

  // Upsert on endpoint alone, so a device that belonged to another account
  // moves here instead of notifying both.
  const sub = await PushSubscription.findOneAndUpdate(
    { endpoint },
    {
      $set: {
        userId: req.user._id,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        types: presentTypes({ types }),
        userAgent: String(req.get("user-agent") || "").slice(0, 300),
      },
    },
    { upsert: true, new: true, runValidators: true }
  ).lean();

  if (timezone && timezone !== req.user.timezone) {
    req.user.timezone = timezone;
    await req.user.save();
  }

  res.json({ types: presentTypes(sub), timezone: req.user.timezone });
}

/** POST /api/push/unsubscribe { endpoint } -> forget this device. */
export async function removeSubscription(req, res) {
  const { endpoint } = req.body || {};
  if (typeof endpoint !== "string" || !endpoint) {
    return res.status(400).json({ message: "endpoint is required" });
  }
  await PushSubscription.deleteOne({ endpoint, userId: req.user._id });
  res.json({ message: "Unsubscribed" });
}

/** POST /api/push/test -> send a sample notification to the caller's devices. */
export async function sendTestNotification(req, res) {
  if (!pushEnabled) return res.status(503).json(NOT_CONFIGURED);
  const result = await sendToUser(req.user._id, {
    type: "test",
    title: "Notifications are working",
    body: "This is where your morning budget and evening reminder will appear.",
    url: "/more",
    tag: "test",
  });
  res.json(result);
}
