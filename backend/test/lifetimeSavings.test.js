// All-time savings, end to end.
//
// The rule under test is one sentence — money in the window you are still
// living in has not been saved yet, it is merely unspent — but it has to hold
// across three different shapes of window, and /summary/all has to go on
// including the running month while these totals exclude it.
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
let BudgetTerm;
let Transaction;
let signToken;

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

let userSeq = 0;
const makeUser = (overrides = {}) => {
  userSeq += 1;
  return User.create({
    googleId: `google-l${userSeq}`,
    username: `luser${userSeq}`,
    email: `luser${userSeq}@example.com`,
    ...overrides,
  });
};

const todayYmd = () => new Date().toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
// The first of the month `n` months back, which is where a cycle opens.
const monthStart = (back) => {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1))
    .toISOString()
    .slice(0, 10);
};
const dayBefore = (ymd) => {
  const d = new Date(`${ymd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("lifetimetest"),
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
  ({ default: BudgetTerm } = await import("../models/BudgetTerm.js"));
  ({ default: Transaction } = await import("../models/Transaction.js"));
  ({ signToken } = await import("../middleware/auth.js"));

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
  await Promise.all([
    BudgetPeriod.deleteMany({}),
    BudgetTerm.deleteMany({}),
    Transaction.deleteMany({}),
  ]);
});

const addTxn = (userId, ymd, type, amount, extra = {}) => {
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
    ...extra,
  });
};

describe("GET /api/summary/lifetime", () => {
  it("stops at the month still running", async () => {
    const user = await makeUser();
    // Two finished months, then this one.
    await addTxn(user._id, monthStart(2), "income", 1000);
    await addTxn(user._id, monthStart(2), "expense", 400);
    await addTxn(user._id, monthStart(1), "income", 1000);
    await addTxn(user._id, monthStart(1), "expense", 600);
    await addTxn(user._id, todayYmd(), "income", 1000);
    await addTxn(user._id, todayYmd(), "expense", 20);

    const { status, body } = await call(
      `/api/summary/lifetime?today=${todayYmd()}`,
      signToken(user)
    );
    assert.equal(status, 200);
    assert.equal(body.earned, 2000);
    assert.equal(body.spent, 1000);
    assert.equal(body.saved, 1000);
    assert.equal(body.rate, 50);
    assert.equal(body.through, dayBefore(monthStart(0)));
  });

  it("leaves /summary/all whole, running month and all", async () => {
    const user = await makeUser();
    await addTxn(user._id, monthStart(1), "income", 100);
    await addTxn(user._id, todayYmd(), "income", 500);

    const token = signToken(user);
    const all = await call("/api/summary/all", token);
    assert.equal(all.body.length, 2, "the chart still needs its last bar");
    assert.equal(all.body.at(-1).totalIncome, 500);

    const lifetime = await call(`/api/summary/lifetime?today=${todayYmd()}`, token);
    assert.equal(lifetime.body.earned, 100);
  });

  it("nets off what friends paid back, as everywhere else", async () => {
    const user = await makeUser();
    await addTxn(user._id, monthStart(1), "income", 100);
    await addTxn(user._id, monthStart(1), "expense", 40, { paidBack: 25 });

    const { body } = await call(
      `/api/summary/lifetime?today=${todayYmd()}`,
      signToken(user)
    );
    assert.equal(body.spent, 15);
    assert.equal(body.saved, 85);
  });

  it("reports zeroes rather than a rate out of nothing", async () => {
    const user = await makeUser();
    await addTxn(user._id, todayYmd(), "income", 500);

    const { body } = await call(
      `/api/summary/lifetime?today=${todayYmd()}`,
      signToken(user)
    );
    assert.deepEqual(
      { earned: body.earned, spent: body.spent, saved: body.saved, rate: body.rate },
      { earned: 0, spent: 0, saved: 0, rate: 0 }
    );
  });

  it("rejects a today it can't read", async () => {
    const { status } = await call("/api/summary/lifetime?today=last-tuesday", signToken(await makeUser()));
    assert.equal(status, 400);
  });

  it("stops at the start of a days-mode period, not at a month boundary", async () => {
    const user = await makeUser({ budgetMode: "days" });
    const token = signToken(user);
    await call("/api/period", token, "POST", { start: shift(0), length: 5 });
    await addTxn(user._id, shift(-10), "income", 999); // before the period
    await addTxn(user._id, shift(0), "income", 500); // inside it

    const { body } = await call(`/api/summary/lifetime?today=${todayYmd()}`, token);
    // The $999 is banked; the $500 is still this period's to spend. A month
    // boundary would have kept both or dropped both.
    assert.equal(body.earned, 999);
    assert.equal(body.through, shift(-1));
  });

  it("counts everything once no period is running", async () => {
    const user = await makeUser({ budgetMode: "days" });
    await BudgetPeriod.create({
      userId: user._id,
      start: shift(-20),
      end: shift(-11),
      length: 10,
    });
    await addTxn(user._id, shift(-20), "income", 400);
    await addTxn(user._id, shift(-15), "expense", 100);
    // In the gap after the period ended — nothing is in progress to hold back,
    // so even today's entries count.
    await addTxn(user._id, shift(-2), "income", 50);

    const { body } = await call(
      `/api/summary/lifetime?today=${todayYmd()}`,
      signToken(user)
    );
    assert.equal(body.saved, 350);
    assert.equal(body.through, null);
  });

  it("counts a term by what its finished cycles were given", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const start = monthStart(2);
    await call("/api/period/term", token, "POST", { start, months: 6 });
    // The whole allowance lands in month one and $500 goes out this month.
    await addTxn(user._id, start, "income", 6000);
    await addTxn(user._id, todayYmd(), "expense", 500);

    const { body } = await call(`/api/summary/lifetime?today=${todayYmd()}`, token);
    // Cycle one drew $1,000 of the $6,000 and cycle two $1,200. The rest is
    // still the term's to release, so it is not yet anybody's savings.
    assert.equal(body.earned, 2200);
    assert.equal(body.spent, 0);
    assert.equal(body.saved, 2200);
  });

  it("charges a finished cycle's spending against its own funding", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const start = monthStart(2);
    await call("/api/period/term", token, "POST", { start, months: 6 });
    await addTxn(user._id, start, "income", 6000);
    await addTxn(user._id, monthStart(1), "expense", 300);

    const { body } = await call(`/api/summary/lifetime?today=${todayYmd()}`, token);
    // $1,000 for cycle one; cycle two is priced off what was left, so the
    // $300 comes off both the funding it drew and the spending.
    assert.equal(body.spent, 300);
    assert.equal(body.saved, body.earned - 300);
  });
});
