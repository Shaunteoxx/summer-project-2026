// Editing a logged transaction.
//
// The cases worth guarding are the ones that leave the ledger holding a row the
// API would have refused to create in the first place: an edit that skips a
// validation the original entry passed, or a date change that doesn't carry
// month/year with it — that one is silent, since the row still reads correctly
// and only the history views, which group by those fields, disagree.
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
    googleId: `google-e${userSeq}`,
    username: `euser${userSeq}`,
    email: `euser${userSeq}@example.com`,
    ...overrides,
  });
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

const makeAccount = async (token, name, color = "#3b82f6") => {
  const { status, body } = await call("/api/auth/accounts", token, "POST", {
    name,
    color,
  });
  assert.equal(status, 201, `creating ${name}: ${JSON.stringify(body)}`);
  return body.id;
};

/** Log an expense and hand back the created row. */
const addTxn = async (token, overrides = {}) => {
  const { status, body } = await call("/api/transactions", token, "POST", {
    description: "Lunch",
    amount: 12,
    type: "expense",
    category: "F & B",
    date: todayYmd(),
    ...overrides,
  });
  assert.equal(status, 201, `adding: ${JSON.stringify(body)}`);
  return body;
};

const edit = (token, id, patch) =>
  call(`/api/transactions/${id}`, token, "PATCH", patch);

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("edittest"),
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
  await Transaction.deleteMany({});
});

describe("editing a transaction", () => {
  it("corrects the amount and description, leaving everything else alone", async () => {
    const token = signToken(await makeUser());
    const created = await addTxn(token);

    const { status, body } = await edit(token, created._id, {
      amount: 8.5,
      description: "Lunch with Ben",
    });

    assert.equal(status, 200);
    assert.equal(body.amount, 8.5);
    assert.equal(body.description, "Lunch with Ben");
    assert.equal(body.category, "F & B");
    assert.equal(body.type, "expense");
    assert.equal(body.date, created.date);
  });

  it("tags a row that predates accounts, without resending the rest", async () => {
    const token = signToken(await makeUser());
    const created = await addTxn(token);
    assert.equal(created.accountId, null);
    const trust = await makeAccount(token, "Trust");

    const { status, body } = await edit(token, created._id, { accountId: trust });

    assert.equal(status, 200);
    assert.equal(body.accountId, trust);
    assert.equal(body.description, "Lunch");
    assert.equal(body.amount, 12);
  });

  it("clears the tag when the account is sent as null", async () => {
    const token = signToken(await makeUser());
    const trust = await makeAccount(token, "Trust");
    const created = await addTxn(token, { accountId: trust });

    const { status, body } = await edit(token, created._id, { accountId: null });

    assert.equal(status, 200);
    assert.equal(body.accountId, null);
  });

  it("carries month and year with the date, so the history views follow", async () => {
    const token = signToken(await makeUser());
    const created = await addTxn(token, { date: "2026-07-15" });
    assert.equal(created.month, 6);

    const { status, body } = await edit(token, created._id, { date: "2026-06-30" });

    assert.equal(status, 200);
    assert.equal(body.month, 5);
    assert.equal(body.year, 2026);

    // The grouped view is the thing that would silently disagree, so check it
    // rather than trusting the fields.
    const june = await call("/api/transactions?month=5&year=2026", token);
    assert.equal(june.body.length, 1);
    const july = await call("/api/transactions?month=6&year=2026", token);
    assert.equal(july.body.length, 0);
  });

  it("moves the daily budget with the corrected amount", async () => {
    const token = signToken(await makeUser());
    await addTxn(token, { type: "income", amount: 900, category: "Allowance" });
    const spend = await addTxn(token, { amount: 300 });

    const before = await call(`/api/streak?today=${todayYmd()}`, token);
    await edit(token, spend._id, { amount: 30 });
    const after = await call(`/api/streak?today=${todayYmd()}`, token);

    assert.equal(before.body.today.spent, 300);
    assert.equal(after.body.today.spent, 30);
    assert.ok(after.body.today.remaining > before.body.today.remaining);
  });

  it("re-checks every field as strictly as adding one does", async () => {
    const token = signToken(await makeUser());
    const created = await addTxn(token);

    const cases = [
      [{ amount: 0 }, "zero"],
      [{ amount: -5 }, "negative"],
      [{ amount: 1e9 + 1 }, "absurd"],
      [{ amount: "abc" }, "not a number"],
      [{ description: "   " }, "blank description"],
      [{ description: "x".repeat(121) }, "over-long description"],
      [{ category: "Not a category" }, "unknown category"],
      [{ category: "Allowance" }, "category from the other type"],
      [{ date: "2030-01-01" }, "future date"],
      [{ date: "nonsense" }, "unparseable date"],
    ];

    for (const [patch, label] of cases) {
      const res = await edit(token, created._id, patch);
      assert.equal(res.status, 400, `${label} should be refused`);
    }

    // …and none of it landed.
    const after = await Transaction.findById(created._id);
    assert.equal(after.amount, 12);
    assert.equal(after.description, "Lunch");
    assert.equal(after.category, "F & B");
  });

  it("refuses to flip an expense into income", async () => {
    const token = signToken(await makeUser());
    const created = await addTxn(token);

    const res = await edit(token, created._id, { type: "income" });

    assert.equal(res.status, 400);
    assert.match(res.body.message, /type/i);
    // Sending the type it already has is not a change, so it passes through.
    const same = await edit(token, created._id, { type: "expense", amount: 5 });
    assert.equal(same.status, 200);
    assert.equal(same.body.amount, 5);
  });

  it("refuses an account that isn't the user's own, or is archived", async () => {
    const token = signToken(await makeUser());
    const created = await addTxn(token);

    const strangerToken = signToken(await makeUser());
    const theirs = await makeAccount(strangerToken, "Theirs");
    const notMine = await edit(token, created._id, { accountId: theirs });
    assert.equal(notMine.status, 400);

    const old = await makeAccount(token, "Closed");
    await call(`/api/auth/accounts/${old}`, token, "PATCH", { archived: true });
    const archived = await edit(token, created._id, { accountId: old });
    assert.equal(archived.status, 400);
  });

  it("won't touch somebody else's transaction", async () => {
    const owner = signToken(await makeUser());
    const created = await addTxn(owner);
    const stranger = signToken(await makeUser());

    const res = await edit(stranger, created._id, { amount: 1 });

    assert.equal(res.status, 404);
    const after = await Transaction.findById(created._id);
    assert.equal(after.amount, 12);
  });

  it("answers cleanly for an id that is missing or malformed", async () => {
    const token = signToken(await makeUser());

    const missing = await edit(token, new mongoose.Types.ObjectId(), { amount: 1 });
    assert.equal(missing.status, 404);

    const malformed = await edit(token, "not-an-id", { amount: 1 });
    assert.equal(malformed.status, 400);
  });

  it("accepts an empty patch as a no-op rather than erroring", async () => {
    const token = signToken(await makeUser());
    const created = await addTxn(token);

    const { status, body } = await edit(token, created._id, {});

    assert.equal(status, 200);
    assert.equal(body.amount, 12);
    assert.equal(body.description, "Lunch");
  });

  it("blocks the demo account", async () => {
    const token = signToken(await makeUser({ isDemo: true }));
    const id = new mongoose.Types.ObjectId();

    const res = await edit(token, id, { amount: 1 });

    assert.equal(res.status, 403);
  });
});
