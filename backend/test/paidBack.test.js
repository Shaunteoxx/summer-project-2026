// Paid back: money friends returned for a shared bill, recorded on the bill.
//
// The case this exists for: a $12.80 group dinner on Trust PayWave, $5.90 of it
// PayNowed back into DBS. The budget must see a $6.90 day with no new income,
// while the account columns still show what really moved through each bank —
// $12.80 out of Trust, $5.90 into DBS.
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
const makeUser = () => {
  userSeq += 1;
  return User.create({
    googleId: `google-p${userSeq}`,
    username: `puser${userSeq}`,
    email: `puser${userSeq}@example.com`,
  });
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

const makeAccount = async (token, name) => {
  const { status, body } = await call("/api/auth/accounts", token, "POST", {
    name,
    color: "#3b82f6",
  });
  assert.equal(status, 201, JSON.stringify(body));
  return body.id;
};

const dinner = (extra = {}) => ({
  description: "Group dinner",
  amount: 12.8,
  type: "expense",
  category: "F & B",
  date: todayYmd(),
  ...extra,
});

/** Trust and DBS, an allowance into DBS, and the dinner paid back into DBS. */
const setUp = async ({ paidBack = 5.9 } = {}) => {
  const token = signToken(await makeUser());
  const trust = await makeAccount(token, "Trust");
  const dbs = await makeAccount(token, "DBS");
  const allowance = await call("/api/transactions", token, "POST", {
    description: "Allowance",
    amount: 500,
    type: "income",
    category: "Allowance",
    date: todayYmd(),
    accountId: dbs,
  });
  assert.equal(allowance.status, 201);
  const meal = await call(
    "/api/transactions",
    token,
    "POST",
    dinner({ accountId: trust, paidBack, paidBackAccountId: dbs })
  );
  assert.equal(meal.status, 201, JSON.stringify(meal.body));
  return { token, trust, dbs, meal: meal.body };
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("paidbacktest"),
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

describe("recording it", () => {
  it("keeps the whole bill and what came back, and where it came back to", async () => {
    const { meal, trust, dbs } = await setUp();
    assert.equal(meal.amount, 12.8);
    assert.equal(meal.paidBack, 5.9);
    assert.equal(String(meal.accountId), trust);
    assert.equal(String(meal.paidBackAccountId), dbs);
  });

  it("defaults to nothing paid back", async () => {
    const token = signToken(await makeUser());
    const res = await call("/api/transactions", token, "POST", dinner());
    assert.equal(res.status, 201);
    assert.equal(res.body.paidBack, 0);
    assert.equal(res.body.paidBackAccountId, null);
  });

  it("only takes less than the bill", async () => {
    const token = signToken(await makeUser());
    for (const paidBack of [12.8, 20, -1, "lots"]) {
      const res = await call("/api/transactions", token, "POST", dinner({ paidBack }));
      assert.equal(res.status, 400, `paidBack ${paidBack}`);
    }
  });

  it("refuses it on income, which nobody pays back", async () => {
    const token = signToken(await makeUser());
    const res = await call("/api/transactions", token, "POST", {
      description: "Allowance",
      amount: 100,
      type: "income",
      category: "Allowance",
      date: todayYmd(),
      paidBack: 10,
    });
    assert.equal(res.status, 400);
  });

  it("refuses an account that isn't the user's", async () => {
    const token = signToken(await makeUser());
    const res = await call(
      "/api/transactions",
      token,
      "POST",
      dinner({ paidBack: 5, paidBackAccountId: new mongoose.Types.ObjectId().toString() })
    );
    assert.equal(res.status, 400);
  });
});

describe("adding it later", () => {
  // Friends pay a few days after the meal, so an edit is the usual way in.
  it("sets it on an existing bill", async () => {
    const { token, meal, dbs } = await setUp({ paidBack: 0 });
    const res = await call(`/api/transactions/${meal._id}`, token, "PATCH", {
      paidBack: 5.9,
      paidBackAccountId: dbs,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.paidBack, 5.9);
    assert.equal(String(res.body.paidBackAccountId), dbs);
  });

  it("won't let the bill drop to or below what was paid back", async () => {
    const { token, meal } = await setUp();
    const res = await call(`/api/transactions/${meal._id}`, token, "PATCH", { amount: 5.9 });
    assert.equal(res.status, 400);
    const row = await Transaction.findById(meal._id).lean();
    assert.equal(row.amount, 12.8);
  });

  it("keeps it through an unrelated edit, even into an account since archived", async () => {
    const { token, meal, dbs } = await setUp();
    const archived = await call(`/api/auth/accounts/${dbs}`, token, "PATCH", { archived: true });
    assert.equal(archived.status, 200, JSON.stringify(archived.body));

    const res = await call(`/api/transactions/${meal._id}`, token, "PATCH", { amount: 14 });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.paidBack, 5.9);
    assert.equal(String(res.body.paidBackAccountId), dbs);
  });

  it("clears the account along with the amount", async () => {
    const { token, meal } = await setUp();
    const res = await call(`/api/transactions/${meal._id}`, token, "PATCH", { paidBack: 0 });
    assert.equal(res.status, 200);
    assert.equal(res.body.paidBack, 0);
    assert.equal(res.body.paidBackAccountId, null);
  });
});

describe("what the budget sees", () => {
  it("counts the bill less what came back, on the bill's own day", async () => {
    const { token } = await setUp();
    const { body } = await call(`/api/streak?today=${todayYmd()}`, token);
    const today = body.periodDays.find((d) => d.date === todayYmd());
    assert.equal(today.spent, 6.9);
  });

  it("doesn't turn the repayment into income", async () => {
    const { token } = await setUp();
    const { body } = await call(`/api/auth/home?today=${todayYmd()}`, token);
    assert.equal(body.periodIncome, 500);
    assert.equal(body.periodExpenses, 6.9);
    assert.equal(body.leftToSpend, 493.1);
  });

  it("uses the same figure in the monthly summaries", async () => {
    const { token } = await setUp();
    const now = new Date();
    const { body } = await call(
      `/api/summary?month=${now.getUTCMonth()}&year=${now.getUTCFullYear()}`,
      token
    );
    assert.equal(body.totalExpenses, 6.9);
    assert.equal(body.totalIncome, 500);
  });
});

describe("what the accounts see", () => {
  it("takes the whole bill out of one account and puts the repayment into the other", async () => {
    const { token, trust, dbs } = await setUp();
    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    const byId = Object.fromEntries(body.accounts.map((a) => [a.id, a]));

    assert.equal(byId[trust].spent, 12.8);
    assert.equal(byId[trust].paidBackIn, 0);
    assert.equal(byId[dbs].income, 500);
    assert.equal(byId[dbs].paidBackIn, 5.9);
    assert.equal(body.totals.spent, 6.9);

    // The identity the card relies on: account nets sum to income − spent.
    const netSum = body.accounts.reduce((n, a) => n + a.net, 0);
    assert.equal(Math.round(netSum * 100) / 100, body.totals.net);
    assert.equal(body.totals.net, 493.1);
  });

  it("files a repayment with no account under Not Assigned, and still ties out", async () => {
    const token = signToken(await makeUser());
    const trust = await makeAccount(token, "Trust");
    await call("/api/transactions", token, "POST", dinner({ accountId: trust, paidBack: 5.9 }));

    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    assert.equal(body.unassigned.paidBackIn, 5.9);
    const netSum = body.accounts.reduce((n, a) => n + a.net, 0) + body.unassigned.net;
    assert.equal(Math.round(netSum * 100) / 100, body.totals.net);
    assert.equal(body.totals.spent, 6.9);
  });
});
