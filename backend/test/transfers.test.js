// Transfers between the user's own accounts, and the per-account totals.
//
// The load-bearing test here is the first one: a transfer must leave the streak
// byte-identical. That is the entire justification for keeping transfers out of
// the Transaction collection, and it is what would rot silently if someone
// later "simplified" the model by adding a third value to `type`.
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
let Transaction;
let Transfer;
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
    googleId: `google-t${userSeq}`,
    username: `tuser${userSeq}`,
    email: `tuser${userSeq}@example.com`,
    ...overrides,
  });
};

const todayYmd = () => new Date().toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const makeAccount = async (token, name, color = "#3b82f6") => {
  const { body } = await call("/api/auth/accounts", token, "POST", { name, color });
  return body.id;
};

const addTxn = (token, accountId, type, amount, date = todayYmd()) =>
  call("/api/transactions", token, "POST", {
    description: "Test",
    amount,
    type,
    category: type === "income" ? "Allowance" : "F & B",
    date,
    accountId,
  });

const transfer = (token, from, to, amount, date = todayYmd()) =>
  call("/api/transfers", token, "POST", { from, to, amount, date });

/** A user with two accounts, income in DBS, and some spending from each. */
const scenario = async () => {
  const user = await makeUser();
  const token = signToken(user);
  const dbs = await makeAccount(token, "DBS");
  const trust = await makeAccount(token, "Trust");
  await addTxn(token, dbs, "income", 800);
  await addTxn(token, dbs, "expense", 100);
  await addTxn(token, trust, "expense", 40);
  return { user, token, dbs, trust };
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("transferstest"),
    JWT_SECRET: SECRET,
    CLIENT_URL: "http://localhost:5173",
    SERVER_URL: "http://localhost:5000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:5000/api/auth/google/callback",
  });

  const { app } = await import("../index.js");
  ({ default: User } = await import("../models/User.js"));
  ({ default: Transaction } = await import("../models/Transaction.js"));
  ({ default: Transfer } = await import("../models/Transfer.js"));
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
  await Promise.all([Transaction.deleteMany({}), Transfer.deleteMany({})]);
});

describe("a transfer is invisible to the budget", () => {
  it("leaves the streak byte-identical", async () => {
    const { token, dbs, trust } = await scenario();

    const before = await call(`/api/streak?today=${todayYmd()}`, token);
    const moved = await transfer(token, dbs, trust, 50);
    assert.equal(moved.status, 201);
    const after = await call(`/api/streak?today=${todayYmd()}`, token);

    assert.deepEqual(after.body, before.body);
  });

  it("leaves the monthly summaries alone", async () => {
    const { token, dbs, trust } = await scenario();

    const before = await call("/api/summary/all", token);
    await transfer(token, dbs, trust, 50);
    const after = await call("/api/summary/all", token);

    assert.deepEqual(after.body, before.body);
  });

  it("leaves the home figures alone", async () => {
    const { token, dbs, trust } = await scenario();

    const before = await call(`/api/auth/home?today=${todayYmd()}`, token);
    await transfer(token, dbs, trust, 50);
    const after = await call(`/api/auth/home?today=${todayYmd()}`, token);

    assert.deepEqual(after.body, before.body);
  });

  it("leaves the friends leaderboard alone", async () => {
    const { token, dbs, trust } = await scenario();

    const before = await call(`/api/friends/comparison?today=${todayYmd()}`, token);
    await transfer(token, dbs, trust, 50);
    const after = await call(`/api/friends/comparison?today=${todayYmd()}`, token);

    assert.deepEqual(after.body, before.body);
  });
});

describe("creating a transfer", () => {
  it("moves the money between the two accounts", async () => {
    const { token, dbs, trust } = await scenario();
    await transfer(token, dbs, trust, 50);

    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    const by = Object.fromEntries(body.accounts.map((a) => [a.name, a]));

    // DBS: 800 in, 100 out, 50 sent.  Trust: 40 out, 50 received.
    assert.equal(by.DBS.net, 650);
    assert.equal(by.Trust.net, 10);
    assert.equal(by.DBS.transfersOut, 50);
    assert.equal(by.Trust.transfersIn, 50);
  });

  it("refuses the same account twice", async () => {
    const { token, dbs } = await scenario();
    const res = await transfer(token, dbs, dbs, 50);
    assert.equal(res.status, 400);
  });

  it("refuses somebody else's account", async () => {
    const { token, dbs } = await scenario();
    const other = signToken(await makeUser());
    const theirs = await makeAccount(other, "Theirs");

    const res = await transfer(token, dbs, theirs, 50);
    assert.equal(res.status, 400);
  });

  it("refuses an archived account", async () => {
    const { token, dbs, trust } = await scenario();
    await call(`/api/auth/accounts/${trust}`, token, "PATCH", { archived: true });

    const res = await transfer(token, dbs, trust, 50);
    assert.equal(res.status, 400);
  });

  it("refuses zero, negative and absurd amounts", async () => {
    const { token, dbs, trust } = await scenario();
    for (const amount of [0, -10, 1e9 + 1]) {
      const res = await transfer(token, dbs, trust, amount);
      assert.equal(res.status, 400, `amount ${amount}`);
    }
  });

  it("refuses a future date", async () => {
    const { token, dbs, trust } = await scenario();
    const res = await transfer(token, dbs, trust, 50, shift(3));
    assert.equal(res.status, 400);
  });

  it("blocks the demo account", async () => {
    const demo = signToken(await makeUser({ isDemo: true }));
    const res = await call("/api/transfers", demo, "POST", {
      from: new mongoose.Types.ObjectId(),
      to: new mongoose.Types.ObjectId(),
      amount: 10,
      date: todayYmd(),
    });
    assert.equal(res.status, 403);
  });

  it("deletes one, putting the money back", async () => {
    const { token, dbs, trust } = await scenario();
    const made = await transfer(token, dbs, trust, 50);

    const gone = await call(`/api/transfers/${made.body._id}`, token, "DELETE");
    assert.equal(gone.status, 200);

    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    const by = Object.fromEntries(body.accounts.map((a) => [a.name, a]));
    assert.equal(by.DBS.net, 700);
    assert.equal(by.Trust.net, -40);
  });
});

describe("per-account totals", () => {
  it("reconciles with the period totals", async () => {
    const { token, dbs, trust } = await scenario();
    await transfer(token, dbs, trust, 50);

    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    const summed = body.accounts.reduce((s, a) => s + a.net, 0);

    // The identity the whole card rests on: transfers cancel across accounts,
    // so the per-account nets add up to income − spent.
    assert.equal(summed, body.totals.net);
    assert.equal(body.totals.net, body.totals.income - body.totals.spent);
    assert.equal(body.totals.leftToSpend, body.totals.net - body.totals.reserved);
  });

  it("counts untagged rows in their own bucket so nothing goes missing", async () => {
    const { token, dbs } = await scenario();
    await call("/api/transactions", token, "POST", {
      description: "Cash lunch",
      amount: 12,
      type: "expense",
      category: "F & B",
      date: todayYmd(),
    });

    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    assert.equal(body.unassigned.spent, 12);

    const summed =
      body.accounts.reduce((s, a) => s + a.net, 0) + body.unassigned.net;
    assert.equal(summed, body.totals.net);
    assert.ok(dbs);
  });

  it("omits the unassigned bucket once everything is tagged", async () => {
    const { token } = await scenario();
    const { status, body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    // Assert the status too: a 500 body also has no `unassigned` key, which is
    // exactly how this passed while the aggregation was broken.
    assert.equal(status, 200);
    assert.equal(body.accounts.length, 2);
    assert.equal(body.unassigned, undefined);
  });

  it("ignores transfers dated outside the period", async () => {
    const { token, dbs, trust } = await scenario();
    // 40 days back is outside any calendar month containing today.
    await transfer(token, dbs, trust, 50, shift(-40));

    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    const by = Object.fromEntries(body.accounts.map((a) => [a.name, a]));
    assert.equal(by.DBS.transfersOut, 0);
    assert.equal(by.Trust.transfersIn, 0);
  });

  it("reports zeroes rather than failing when no period is running", async () => {
    const user = await makeUser({ budgetMode: "days" });
    const token = signToken(user);
    await makeAccount(token, "Trust");

    const { status, body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    assert.equal(status, 200);
    assert.equal(body.period, null);
    assert.equal(body.accounts.length, 1);
    assert.equal(body.totals.net, 0);
  });

  it("goes with the user when the account is deleted", async () => {
    const { user, token, dbs, trust } = await scenario();
    await transfer(token, dbs, trust, 50);
    assert.equal(await Transfer.countDocuments({ userId: user._id }), 1);

    await call("/api/auth/me", token, "DELETE");
    assert.equal(await Transfer.countDocuments({ userId: user._id }), 0);
  });
});
