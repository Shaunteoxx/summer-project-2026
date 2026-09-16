// Push subscriptions and the notification runs. The cases worth guarding fail
// silently rather than loudly: a notification reaching the wrong account on a
// shared device, a working device unsubscribed over a transient error, a user
// nudged on a day they did log, or a morning figure that disagrees with the
// home screen.
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import webpush from "web-push";

const SECRET = "test-jwt-secret-at-least-32-characters-long";
const CRON_SECRET = "test-cron-secret-at-least-32-characters-long";

let mongo;
let server;
let base;
let User;
let Transaction;
let PushSubscription;
let signToken;
let sendToUser;
let runDailyReminders;
let runMorningBudget;

const call = async (path, token, method = "GET", body, headers = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

let seq = 0;
const makeUser = (overrides = {}) => {
  seq += 1;
  return User.create({
    googleId: `google-p${seq}`,
    username: `puser${seq}`,
    email: `puser${seq}@example.com`,
    ...overrides,
  });
};

const subscription = (n = 1) => ({
  endpoint: `https://push.example.com/send/device-${n}`,
  keys: { p256dh: `p256dh-${n}`, auth: `auth-${n}` },
});
const REMINDER_ONLY = { dailyReminder: true, morningBudget: false };
const BOTH = { dailyReminder: true, morningBudget: true };

/** A device row straight into the database, wanting `types`. */
const device = (user, n = 1, types = REMINDER_ONLY) =>
  PushSubscription.create({ userId: user._id, ...subscription(n), types });

// 13:00Z is 21:00 in Singapore on 16 Sep.
const SG_NINE_PM = new Date("2026-09-16T13:00:00Z");

const inSingapore = (overrides = {}) => makeUser({ timezone: "Asia/Singapore", ...overrides });

const logOn = (user, ymd, { type = "expense", amount = 5 } = {}) => {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  return Transaction.create({
    userId: user._id,
    description: type === "income" ? "Allowance" : "Lunch",
    amount,
    type,
    category: type === "income" ? "Allowance" : "F & B",
    date,
    month: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  });
};

const recorder = () => {
  const calls = [];
  const send = async (sub, body) => calls.push({ endpoint: sub.endpoint, body: JSON.parse(body) });
  return { calls, send };
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  const vapid = webpush.generateVAPIDKeys();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("pushtest"),
    JWT_SECRET: SECRET,
    CLIENT_URL: "http://localhost:5173",
    SERVER_URL: "http://localhost:5000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:5000/api/auth/google/callback",
    VAPID_PUBLIC_KEY: vapid.publicKey,
    VAPID_PRIVATE_KEY: vapid.privateKey,
    VAPID_SUBJECT: "mailto:test@example.com",
    DAILY_REMINDER_HOUR: "21",
    MORNING_BUDGET_HOUR: "8",
    CRON_SECRET,
  });

  const { app } = await import("../index.js");
  ({ default: User } = await import("../models/User.js"));
  ({ default: Transaction } = await import("../models/Transaction.js"));
  ({ default: PushSubscription } = await import("../models/PushSubscription.js"));
  ({ signToken } = await import("../middleware/auth.js"));
  ({ sendToUser } = await import("../lib/push.js"));
  ({ runDailyReminders } = await import("../jobs/dailyReminder.js"));
  ({ runMorningBudget } = await import("../jobs/morningBudget.js"));

  await mongoose.connect(process.env.MONGO_URI);
  await PushSubscription.init();
  server = app.listen(0);
  await once(server, "listening");
  base = `http://localhost:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    PushSubscription.deleteMany({}),
    Transaction.deleteMany({}),
    User.deleteMany({}),
  ]);
});

const readDevice = (token, n = 1) =>
  call(`/api/push/subscription?endpoint=${encodeURIComponent(subscription(n).endpoint)}`, token);

describe("subscribing", () => {
  it("hands out the public key and the notification hours", async () => {
    const token = signToken(await makeUser());
    assert.equal((await call("/api/push/key", token)).body.publicKey, process.env.VAPID_PUBLIC_KEY);
    const me = await call("/api/auth/me", token);
    assert.deepEqual(me.body.notificationHours, { dailyReminder: 21, morningBudget: 8 });
  });

  it("stores this device's choices and the zone, once per device", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const payload = { ...subscription(), types: REMINDER_ONLY, timezone: "Asia/Singapore" };

    assert.equal((await call("/api/push/subscription", token, "POST", payload)).status, 200);
    const again = await call("/api/push/subscription", token, "POST", { ...payload, types: BOTH });
    assert.deepEqual(again.body, { types: BOTH, timezone: "Asia/Singapore" });

    assert.equal(await PushSubscription.countDocuments({ userId: user._id }), 1);
    assert.deepEqual((await readDevice(token)).body, { types: BOTH });
  });

  it("keeps each device's choices separate", async () => {
    const token = signToken(await makeUser());
    await call("/api/push/subscription", token, "POST", { ...subscription(1), types: BOTH });
    await call("/api/push/subscription", token, "POST", {
      ...subscription(2),
      types: { dailyReminder: false, morningBudget: true },
    });
    assert.deepEqual((await readDevice(token, 1)).body, { types: BOTH });
  });

  it("moves a device to whoever subscribes on it last", async () => {
    const first = await makeUser();
    const second = await makeUser();
    await call("/api/push/subscription", signToken(first), "POST", { ...subscription(), types: BOTH });
    await call("/api/push/subscription", signToken(second), "POST", { ...subscription(), types: BOTH });

    const rows = await PushSubscription.find().lean();
    assert.equal(rows.length, 1);
    assert.equal(String(rows[0].userId), String(second._id));
    assert.equal((await readDevice(signToken(first))).status, 404);
  });

  it("rejects a malformed subscription, type or zone", async () => {
    const token = signToken(await makeUser());
    const cases = [
      { ...subscription(), endpoint: "http://push.example.com/x", types: BOTH },
      { endpoint: subscription().endpoint, types: BOTH },
      { ...subscription() },
      { ...subscription(), types: { weeklyDigest: true } },
      { ...subscription(), types: { dailyReminder: "yes" } },
      { ...subscription(), types: BOTH, timezone: "Mars/Olympus" },
    ];
    for (const body of cases) {
      const res = await call("/api/push/subscription", token, "POST", body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  it("refuses demo accounts", async () => {
    const token = signToken(await makeUser({ isDemo: true }));
    const res = await call("/api/push/subscription", token, "POST", { ...subscription(), types: BOTH });
    assert.equal(res.status, 403);
  });
});

describe("unsubscribing", () => {
  it("only removes the caller's own device", async () => {
    await device(await makeUser());
    await call("/api/push/unsubscribe", signToken(await makeUser()), "POST", {
      endpoint: subscription().endpoint,
    });
    assert.equal(await PushSubscription.countDocuments(), 1);
  });

  it("drops every device on sign-out", async () => {
    const user = await makeUser();
    await device(user, 1);
    await device(user, 2);
    await call("/api/auth/logout", signToken(user), "POST");
    assert.equal(await PushSubscription.countDocuments({ userId: user._id }), 0);
  });

  it("drops devices with the account", async () => {
    const user = await makeUser();
    await device(user);
    assert.equal((await call("/api/auth/me", signToken(user), "DELETE")).status, 200);
    assert.equal(await PushSubscription.countDocuments(), 0);
  });
});

describe("sending", () => {
  it("prunes only devices the push service reports gone", async () => {
    const user = await makeUser();
    await device(user, 1);
    await device(user, 2);
    await device(user, 3);
    const send = async (sub) => {
      if (sub.endpoint.endsWith("device-1")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      if (sub.endpoint.endsWith("device-2")) throw Object.assign(new Error("busy"), { statusCode: 500 });
    };

    const originalError = console.error;
    console.error = () => {};
    const result = await sendToUser(user._id, { title: "t" }, { send }).finally(() => {
      console.error = originalError;
    });

    assert.deepEqual(result, { sent: 1, pruned: 1 });
    const left = (await PushSubscription.find().lean()).map((s) => s.endpoint).sort();
    assert.deepEqual(left, [subscription(2).endpoint, subscription(3).endpoint]);
  });

  it("sends a type only to devices that want it", async () => {
    const user = await makeUser();
    await device(user, 1, { dailyReminder: true, morningBudget: false });
    await device(user, 2, { dailyReminder: false, morningBudget: true });
    const { calls, send } = recorder();
    await sendToUser(user._id, { title: "t" }, { type: "morningBudget", send });
    assert.deepEqual(calls.map((c) => c.endpoint), [subscription(2).endpoint]);
  });
});

describe("the evening reminder", () => {
  it("reminds only users with nothing logged on their local day", async () => {
    const idle = await inSingapore();
    const busy = await inSingapore();
    await device(idle, 1);
    await device(busy, 2);
    await logOn(busy, "2026-09-16");
    // Logged yesterday doesn't count for today.
    await logOn(idle, "2026-09-15");

    const { calls, send } = recorder();
    const result = await runDailyReminders(SG_NINE_PM, { send });

    assert.equal(result.recipients, 1);
    assert.deepEqual(calls.map((c) => c.endpoint), [subscription(1).endpoint]);
    assert.equal(calls[0].body.type, "dailyReminder");
  });

  it("sends once per local day however many times it runs", async () => {
    const user = await inSingapore();
    await device(user);

    const { calls, send } = recorder();
    await runDailyReminders(SG_NINE_PM, { send });
    await runDailyReminders(SG_NINE_PM, { send });
    assert.equal(calls.length, 1);
    assert.equal((await User.findById(user._id)).notifications.dailyReminder.lastSentKey, "2026-09-16");
  });

  it("leaves out demo accounts, devices that switched it off and users with no zone", async () => {
    await device(await inSingapore({ isDemo: true }), 1);
    await device(await inSingapore(), 2, { dailyReminder: false, morningBudget: true });
    await device(await inSingapore({ timezone: "" }), 3);

    const { calls, send } = recorder();
    const result = await runDailyReminders(SG_NINE_PM, { send });
    assert.equal(result.candidates, 0);
    assert.equal(calls.length, 0);
  });

  it("plans without claiming or sending on a dry run", async () => {
    const user = await inSingapore();
    await device(user);

    const { calls, send } = recorder();
    const result = await runDailyReminders(SG_NINE_PM, { send, dryRun: true });
    assert.deepEqual(result.recipientIds, [String(user._id)]);
    assert.equal(calls.length, 0);
    assert.equal((await User.findById(user._id)).notifications.dailyReminder.lastSentKey, null);
  });
});

describe("the morning budget", () => {
  // Real "now", because GET /api/streak only accepts a today within a day of
  // the server's. The user's zone is UTC and their morning hour is this hour.
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yesterdayKey = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
  const monthStart = `${todayKey.slice(0, 8)}01`;
  const MORNING_ONLY = { dailyReminder: false, morningBudget: true };

  const morningUser = () =>
    makeUser({
      timezone: "UTC",
      notifications: { morningBudget: { hour: now.getUTCHours() } },
    });

  it("reports the same figure the home screen shows", async () => {
    const user = await morningUser();
    await device(user, 1, MORNING_ONLY);
    await logOn(user, monthStart, { type: "income", amount: 900 });
    await logOn(user, yesterdayKey, { amount: 12.5 });

    const { calls, send } = recorder();
    const result = await runMorningBudget(now, { send });
    assert.equal(result.sent, 1);

    const streak = (await call(`/api/streak?today=${todayKey}`, signToken(user))).body;
    const remaining = Math.max(streak.today.remaining, 0).toLocaleString("en-SG", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    assert.equal(calls[0].body.title, `$${remaining} to spend today`);
    assert.match(calls[0].body.body, /days? left in this month\.$/);
    assert.equal((await User.findById(user._id)).notifications.morningBudget.lastSentKey, todayKey);
  });

  it("says so when nothing was logged yesterday", async () => {
    const user = await morningUser();
    await device(user, 1, MORNING_ONLY);
    // Income dated today, so yesterday has no entries of any kind.
    await logOn(user, todayKey, { type: "income", amount: 900 });

    const result = await runMorningBudget(now, { dryRun: true });
    assert.equal(result.messages.length, 1);
    assert.match(result.messages[0].body, /Nothing was logged yesterday/);
  });

  it("skips users with no budget to report, without claiming the day", async () => {
    const user = await morningUser();
    await device(user, 1, MORNING_ONLY);

    const { calls, send } = recorder();
    const result = await runMorningBudget(now, { send });
    assert.equal(calls.length, 0);
    assert.deepEqual(result.skipped, [{ id: String(user._id), reason: "no-budget" }]);
    assert.equal((await User.findById(user._id)).notifications.morningBudget.lastSentKey, null);
  });
});

describe("the scheduler endpoint", () => {
  it("rejects a missing or wrong secret", async () => {
    assert.equal((await call("/api/jobs/notifications", null, "POST")).status, 401);
    const wrong = await call("/api/jobs/notifications", null, "POST", undefined, {
      "X-Cron-Secret": "x".repeat(40),
    });
    assert.equal(wrong.status, 401);
  });

  it("runs both notifications with the right secret", async () => {
    const res = await call("/api/jobs/notifications", null, "POST", undefined, {
      "X-Cron-Secret": CRON_SECRET,
    });
    assert.equal(res.status, 200);
    assert.deepEqual(Object.keys(res.body).sort(), ["dailyReminder", "morningBudget"]);
  });
});
