const VALID_NODE_ENVS = new Set(["development", "test", "production"]);
const nodeEnv = process.env.NODE_ENV || "development";

if (!VALID_NODE_ENVS.has(nodeEnv)) {
  throw new Error(`Invalid NODE_ENV: ${nodeEnv}`);
}

const production = nodeEnv === "production";
const requiredInProduction = [
  "MONGO_URI",
  "JWT_SECRET",
  "CLIENT_URL",
  "SERVER_URL",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
];

if (production) {
  const missing = requiredInProduction.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing production environment variables: ${missing.join(", ")}`);
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters");
  }
}

function origin(name, fallback) {
  const value = (process.env[name] || fallback).replace(/\/$/, "");
  const parsed = new URL(value);
  if (parsed.origin !== value || (production && parsed.protocol !== "https:")) {
    throw new Error(`${name} must be an ${production ? "HTTPS " : ""}origin without a path`);
  }
  return value;
}

const clientUrl = origin("CLIENT_URL", "http://localhost:5173");
const serverUrl = origin("SERVER_URL", "http://localhost:5000");
const port = Number(process.env.PORT || 5000);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

const googleCallbackUrl =
  process.env.GOOGLE_CALLBACK_URL || `${serverUrl}/api/auth/google/callback`;
const callback = new URL(googleCallbackUrl);
if (
  callback.origin !== serverUrl ||
  callback.pathname !== "/api/auth/google/callback" ||
  (production && callback.protocol !== "https:")
) {
  throw new Error(
    "GOOGLE_CALLBACK_URL must use SERVER_URL and /api/auth/google/callback"
  );
}

// Push is optional: without a VAPID pair the reminder job never schedules and
// /api/push/key hands back null. Half a pair is a misconfiguration, though.
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || "";
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY || "";
if (Boolean(vapidPublicKey) !== Boolean(vapidPrivateKey)) {
  throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set together");
}
const vapidSubject = process.env.VAPID_SUBJECT || "mailto:admin@example.com";
if (vapidPublicKey && !/^(mailto:|https:\/\/)/.test(vapidSubject)) {
  throw new Error("VAPID_SUBJECT must be a mailto: address or an https URL");
}
function hourVar(name, fallback) {
  const hour = Number(process.env[name] || fallback);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new Error(`${name} must be an integer between 0 and 23`);
  }
  return hour;
}
const dailyReminderHour = hourVar("DAILY_REMINDER_HOUR", 21);
const morningBudgetHour = hourVar("MORNING_BUDGET_HOUR", 8);

// Set this when something outside the process (Cloud Scheduler) calls
// POST /api/jobs/notifications. The built-in timer then stays off, because a
// host that sleeps between requests would skip its ticks anyway.
const cronSecret = process.env.CRON_SECRET || "";
if (cronSecret && cronSecret.length < 32) {
  throw new Error("CRON_SECRET must contain at least 32 characters");
}

export const env = Object.freeze({
  nodeEnv,
  production,
  port,
  mongoUri: process.env.MONGO_URI || "mongodb://localhost:27017/brokenomore",
  jwtSecret: process.env.JWT_SECRET || "dev_jwt_secret",
  clientUrl,
  serverUrl,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
  googleCallbackUrl,
  vapidPublicKey,
  vapidPrivateKey,
  vapidSubject,
  dailyReminderHour,
  morningBudgetHour,
  cronSecret,
});