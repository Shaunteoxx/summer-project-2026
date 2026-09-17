// Restoring a streak through the real API: GET /api/streak offers the day, and
// POST /api/streak/restore has to actually repair it — persisted, reflected on
// the next read, and matching what the confirmation promised. Real Express app,
// in-memory MongoDB, dates anchored on the server's clock (the API rejects a
// `today` more than a day away from it).
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

const SECRET = "test-jwt-secret-at-least-32-characters-long";

let mongo;
let server;
let base;
let User;
let BudgetPeriod;
let Transaction;
let signToken;
let periodEnd;

const call = async (path, token, method = "GET", body) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const todayYmd = () => new Date().toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

let userSeq = 0;
const makeUser = (overrides = {}) => {
  userSeq += 1;
  return User.create({
    googleId: `google-s${userSeq}`,
    username: `suser${userSeq}`,
    email: `suser${userSeq}@example.com`,
    ...overrides,
  });
};

const addTxn = (userId, ymd, type, amount) => {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  return Transaction.create({
    userId,
    description: `${type} ${ymd}`,
    amount,
    type,
    category: type === "income" ? "Allowance" : "F & B",
    date,
    month: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  });
};

/** A days-mode user with the given periods ([startOffset, length] pairs). */
const daysModeUser = async (periods) => {
  const user = await makeUser({ budgetMode: "days" });
  await BudgetPeriod.insertMany(
    periods.map(([offset, length]) => ({
      userId: user._id,
      start: shift(offset),
      end: periodEnd(shift(offset), length),
      length,
    }))
  );
  return { user, token: signToken(user) };
};

const getStreak = (token) => call(`/api/streak?today=${todayYmd()}`, token);
const restore = (token, date, today = todayYmd()) =>
  call("/api/streak/restore", token, "POST", { date, today });
const storedRestores = async (user) => (await User.findById(user._id)).restoredDays;

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("streaktest"),
    JWT_SECRET: SECRET,
    CLIENT_URL: "http://localhost:5173",
    SERVER_URL: "http://localhost:5000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:5000/api/auth/google/callback",
  });

  const { app } = await import("../index.js");
  ({ default: User } = await import("../models/User.js"));
  ({ default: BudgetPeriod } = await import("../models/BudgetPeriod.js"));
  ({ default: Transaction } = await import("../models/Transaction.js"));
  ({ signToken } = await import("../middleware/auth.js"));
  ({ periodEnd } = await import("../lib/period.js"));

  await mongoose.connect(process.env.MONGO_URI);
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
  await Promise.all([BudgetPeriod.deleteMany({}), Transaction.deleteMany({})]);
});

describe("restoring the day that broke the streak", () => {
  it("repairs it, persists it, and lands on the streak the offer promised", async () => {
    // A 30-day period (3 restores) that began 6 days ago. Yesterday blew far
    // past its budget; every other day was a no-spend win.
    const { user, token } = await daysModeUser([[-6, 30]]);
    await addTxn(user._id, shift(-6), "income", 3000);
    await addTxn(user._id, shift(-1), "expense", 500);

    const before = await getStreak(token);
    assert.equal(before.status, 200);
    assert.equal(before.body.currentStreak, 1, "only today, the break cuts the rest off");
    assert.equal(before.body.savesLeftThisPeriod, 3);
    assert.deepEqual(before.body.restore, {
      date: shift(-1),
      savesLeft: 3,
      savesTotal: 3,
      period: { start: shift(-6), end: periodEnd(shift(-6), 30) },
      inActivePeriod: true,
      streakAfter: 7,
    });

    const restored = await restore(token, shift(-1));
    assert.equal(restored.status, 200);
    assert.equal(restored.body.currentStreak, before.body.restore.streakAfter);
    assert.equal(restored.body.savesLeftThisPeriod, 2);
    assert.equal(restored.body.restore, null, "nothing else is broken");
    assert.equal(
      restored.body.last7.find((d) => d.date === shift(-1)).status,
      "saved"
    );
    assert.deepEqual([...(await storedRestores(user))], [shift(-1)]);

    // A fresh load (another page, an app restart) sees the same thing.
    const reread = await getStreak(token);
    assert.equal(reread.body.currentStreak, 7);
    assert.equal(reread.body.savesLeftThisPeriod, 2);
    assert.equal(reread.body.restore, null);
  });

  it("walks back through consecutive breaks until the period's saves run out", async () => {
    // 20 days -> 2 restores, against three broken days in a row.
    const { user, token } = await daysModeUser([[-5, 20]]);
    await addTxn(user._id, shift(-5), "income", 2000);
    for (const n of [-3, -2, -1]) await addTxn(user._id, shift(n), "expense", 900);

    let streak = (await getStreak(token)).body;
    const spent = [];
    while (streak.restore) {
      const offer = streak.restore;
      assert.equal(offer.savesLeft, streak.savesLeftThisPeriod, "popup matches the card");
      const res = await restore(token, offer.date);
      assert.equal(res.status, 200);
      assert.equal(res.body.currentStreak, offer.streakAfter);
      spent.push(offer.date);
      streak = res.body;
    }

    assert.deepEqual(spent, [shift(-1), shift(-2)], "newest break first");
    assert.equal(streak.savesLeftThisPeriod, 0);
    assert.equal(streak.currentStreak, 3, "today plus the two repaired days");

    // The third break stays broken: no saves left to pay for it.
    const refused = await restore(token, shift(-3));
    assert.equal(refused.status, 400);
    assert.deepEqual([...(await storedRestores(user))], spent);
  });

  it("spends an earlier period's save when that's where the break is", async () => {
    // Two 7-day periods, one restore each. This period's was already spent on
    // 2 days ago; the day breaking the streak is the last day of the previous.
    const { user, token } = await daysModeUser([[-10, 7], [-3, 7]]);
    await addTxn(user._id, shift(-10), "income", 70);
    await addTxn(user._id, shift(-4), "expense", 500);
    await addTxn(user._id, shift(-3), "income", 70);
    await addTxn(user._id, shift(-2), "expense", 500);
    await User.updateOne({ _id: user._id }, { restoredDays: [shift(-2)] });

    const before = (await getStreak(token)).body;
    assert.equal(before.savesLeftThisPeriod, 0);
    assert.equal(before.restore?.date, shift(-4));
    assert.equal(before.restore.inActivePeriod, false);

    const res = await restore(token, shift(-4));
    assert.equal(res.status, 200);
    assert.equal(res.body.currentStreak, before.restore.streakAfter);
    assert.equal(res.body.savesLeftThisPeriod, 0, "this period's count is unchanged");
  });

  it("works in month mode, the default for new users", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await addTxn(user._id, shift(-3), "income", 3000);
    await addTxn(user._id, shift(-1), "expense", 2500);

    const before = (await getStreak(token)).body;
    assert.equal(before.restore?.date, shift(-1));

    const res = await restore(token, shift(-1));
    assert.equal(res.status, 200);
    assert.equal(res.body.currentStreak, before.restore.streakAfter);
    assert.equal((await getStreak(token)).body.currentStreak, before.restore.streakAfter);
  });

  it("counts a double tap once", async () => {
    const { user, token } = await daysModeUser([[-4, 30]]);
    await addTxn(user._id, shift(-4), "income", 3000);
    await addTxn(user._id, shift(-1), "expense", 2000);

    const results = await Promise.all([restore(token, shift(-1)), restore(token, shift(-1))]);
    assert.ok(results.some((r) => r.status === 200));
    assert.ok(results.every((r) => r.status < 500), "neither request crashes");
    assert.deepEqual([...(await storedRestores(user))], [shift(-1)]);
    assert.equal((await getStreak(token)).body.savesLeftThisPeriod, 2);
  });
});

describe("refusing restores that aren't on offer", () => {
  const setup = async () => {
    // Breaks 3 days ago and yesterday; only yesterday is breaking the streak.
    const ctx = await daysModeUser([[-5, 30]]);
    await addTxn(ctx.user._id, shift(-5), "income", 3000);
    await addTxn(ctx.user._id, shift(-3), "expense", 900);
    await addTxn(ctx.user._id, shift(-1), "expense", 900);
    await addTxn(ctx.user._id, todayYmd(), "expense", 900);
    return ctx;
  };

  const cases = [
    ["an older break hidden behind the current one", () => shift(-3)],
    ["a day that was within budget", () => shift(-2)],
    ["today, which isn't over until it's over", () => todayYmd()],
    ["a future day", () => shift(1)],
    ["a malformed date", () => "yesterday"],
  ];
  for (const [name, date] of cases) {
    it(`rejects ${name}`, async () => {
      const { user, token } = await setup();
      const res = await restore(token, date());
      assert.equal(res.status, 400);
      assert.deepEqual([...(await storedRestores(user))], []);
    });
  }

  it("rejects a client date far from the server's", async () => {
    const { token } = await setup();
    assert.equal((await restore(token, shift(-1), shift(-5))).status, 400);
  });

  it("requires sign-in", async () => {
    const res = await call("/api/streak/restore", null, "POST", { date: shift(-1) });
    assert.equal(res.status, 401);
  });

  it("doesn't offer today when today is the day over budget", async () => {
    const { user, token } = await daysModeUser([[-2, 30]]);
    await addTxn(user._id, shift(-2), "income", 300);
    await addTxn(user._id, todayYmd(), "expense", 900);
    const streak = (await getStreak(token)).body;
    assert.equal(streak.today.within, false);
    assert.equal(streak.restore, null);
  });
});
