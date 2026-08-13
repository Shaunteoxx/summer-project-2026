// Bank accounts: creating them, tagging transactions, and filtering the ledger.
// The cases worth guarding are the ones that corrupt data rather than error —
// an account deleted out from under its history, or a transaction pointing at
// somebody else's account.
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
    googleId: `google-a${userSeq}`,
    username: `auser${userSeq}`,
    email: `auser${userSeq}@example.com`,
    ...overrides,
  });
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

/** Create an account through the API and return its id. */
const makeAccount = async (token, name, color = "#3b82f6") => {
  const { status, body } = await call("/api/auth/accounts", token, "POST", {
    name,
    color,
  });
  assert.equal(status, 201, `creating ${name}: ${JSON.stringify(body)}`);
  return body.id;
};

const addTxn = (token, accountId, type = "expense", amount = 10) =>
  call("/api/transactions", token, "POST", {
    description: "Test",
    amount,
    type,
    category: type === "income" ? "Allowance" : "F & B",
    date: todayYmd(),
    ...(accountId === undefined ? {} : { accountId }),
  });

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("accountstest"),
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

describe("creating accounts", () => {
  it("creates one and returns it on the profile", async () => {
    const token = signToken(await makeUser());
    const id = await makeAccount(token, "Trust", "#ef4444");

    const me = await call("/api/auth/me", token);
    assert.deepEqual(me.body.accounts, [
      { id, name: "Trust", color: "#ef4444", archived: false },
    ]);
  });

  it("rejects a duplicate name whatever the casing", async () => {
    const token = signToken(await makeUser());
    await makeAccount(token, "Trust");
    const clash = await call("/api/auth/accounts", token, "POST", {
      name: "  trust  ",
      color: "#3b82f6",
    });
    assert.equal(clash.status, 409);
  });

  it("rejects a bad colour and an over-long name", async () => {
    const token = signToken(await makeUser());
    const badColor = await call("/api/auth/accounts", token, "POST", {
      name: "Trust",
      color: "red",
    });
    assert.equal(badColor.status, 400);

    const longName = await call("/api/auth/accounts", token, "POST", {
      name: "x".repeat(25),
      color: "#3b82f6",
    });
    assert.equal(longName.status, 400);
  });

  it("stops at eight, so the picker stays one row of chips", async () => {
    const token = signToken(await makeUser());
    for (let i = 0; i < 8; i += 1) await makeAccount(token, `Bank ${i}`);
    const ninth = await call("/api/auth/accounts", token, "POST", {
      name: "Bank 9",
      color: "#3b82f6",
    });
    assert.equal(ninth.status, 400);
  });

  it("frees a slot when one is archived", async () => {
    const token = signToken(await makeUser());
    const ids = [];
    for (let i = 0; i < 8; i += 1) ids.push(await makeAccount(token, `Bank ${i}`));

    await call(`/api/auth/accounts/${ids[0]}`, token, "PATCH", { archived: true });
    const ninth = await call("/api/auth/accounts", token, "POST", {
      name: "Bank 9",
      color: "#3b82f6",
    });
    assert.equal(ninth.status, 201);
  });

  it("won't let un-archiving sneak past the limit", async () => {
    const token = signToken(await makeUser());
    const ids = [];
    for (let i = 0; i < 8; i += 1) ids.push(await makeAccount(token, `Bank ${i}`));
    await call(`/api/auth/accounts/${ids[0]}`, token, "PATCH", { archived: true });
    await makeAccount(token, "Bank 9");

    const back = await call(`/api/auth/accounts/${ids[0]}`, token, "PATCH", {
      archived: false,
    });
    assert.equal(back.status, 400);
  });

  it("blocks the demo account", async () => {
    const token = signToken(await makeUser({ isDemo: true }));
    const res = await call("/api/auth/accounts", token, "POST", {
      name: "Trust",
      color: "#3b82f6",
    });
    assert.equal(res.status, 403);
  });
});

describe("editing and removing", () => {
  it("renames and recolours", async () => {
    const token = signToken(await makeUser());
    const id = await makeAccount(token, "Trust");
    const res = await call(`/api/auth/accounts/${id}`, token, "PATCH", {
      name: "Trust Bank",
      color: "#10b981",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.name, "Trust Bank");
    assert.equal(res.body.color, "#10b981");
  });

  it("won't rename onto another account's name", async () => {
    const token = signToken(await makeUser());
    await makeAccount(token, "Trust");
    const dbs = await makeAccount(token, "DBS");
    const res = await call(`/api/auth/accounts/${dbs}`, token, "PATCH", {
      name: "trust",
    });
    assert.equal(res.status, 409);
  });

  it("deletes one that was never used", async () => {
    const token = signToken(await makeUser());
    const id = await makeAccount(token, "Trust");
    const res = await call(`/api/auth/accounts/${id}`, token, "DELETE");
    assert.equal(res.status, 200);

    const me = await call("/api/auth/me", token);
    assert.equal(me.body.accounts.length, 0);
  });

  it("refuses to delete one with history, and points at archiving", async () => {
    // Deleting it would leave its transactions pointing at nothing: they would
    // vanish from the per-account totals while still counting in the budget.
    const token = signToken(await makeUser());
    const id = await makeAccount(token, "Trust");
    await addTxn(token, id);

    const res = await call(`/api/auth/accounts/${id}`, token, "DELETE");
    assert.equal(res.status, 409);
    assert.equal(res.body.inUse, true);

    const me = await call("/api/auth/me", token);
    assert.equal(me.body.accounts.length, 1, "the account survived");
  });

  it("404s on an unknown id", async () => {
    const token = signToken(await makeUser());
    const res = await call(
      `/api/auth/accounts/${new mongoose.Types.ObjectId()}`,
      token,
      "DELETE"
    );
    assert.equal(res.status, 404);
  });
});

describe("tagging transactions", () => {
  it("stores the account on the transaction", async () => {
    const token = signToken(await makeUser());
    const id = await makeAccount(token, "Trust");
    const res = await addTxn(token, id);
    assert.equal(res.status, 201);
    assert.equal(String(res.body.accountId), id);
  });

  it("still accepts an untagged transaction", async () => {
    const token = signToken(await makeUser());
    await makeAccount(token, "Trust");
    const res = await addTxn(token, undefined);
    assert.equal(res.status, 201);
    assert.equal(res.body.accountId, null);
  });

  it("rejects an account that isn't yours", async () => {
    const mine = signToken(await makeUser());
    const theirs = signToken(await makeUser());
    const theirAccount = await makeAccount(theirs, "Someone else's");

    const res = await addTxn(mine, theirAccount);
    assert.equal(res.status, 400);
  });

  it("rejects an archived account", async () => {
    const token = signToken(await makeUser());
    const id = await makeAccount(token, "Old card");
    await call(`/api/auth/accounts/${id}`, token, "PATCH", { archived: true });

    const res = await addTxn(token, id);
    assert.equal(res.status, 400);
  });

  it("rejects a malformed id rather than storing it", async () => {
    const token = signToken(await makeUser());
    const res = await addTxn(token, "not-an-id");
    assert.equal(res.status, 400);
  });
});

describe("filtering the ledger", () => {
  it("narrows to one account", async () => {
    const token = signToken(await makeUser());
    const trust = await makeAccount(token, "Trust");
    const dbs = await makeAccount(token, "DBS");
    await addTxn(token, trust, "expense", 10);
    await addTxn(token, dbs, "expense", 20);

    const res = await call(`/api/transactions?accountId=${trust}`, token);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].amount, 10);
  });

  it("returns everything when no account is given", async () => {
    const token = signToken(await makeUser());
    const trust = await makeAccount(token, "Trust");
    await addTxn(token, trust, "expense", 10);
    await addTxn(token, undefined, "expense", 20);

    const res = await call("/api/transactions", token);
    assert.equal(res.body.length, 2);
  });

  it("finds the untagged ones with accountId=none", async () => {
    const token = signToken(await makeUser());
    const trust = await makeAccount(token, "Trust");
    await addTxn(token, trust, "expense", 10);
    await addTxn(token, undefined, "expense", 20);

    const res = await call("/api/transactions?accountId=none", token);
    assert.equal(res.body.length, 1);
    assert.equal(res.body[0].amount, 20);
  });

  it("rejects an unknown account rather than silently returning nothing", async () => {
    const token = signToken(await makeUser());
    const res = await call(
      `/api/transactions?accountId=${new mongoose.Types.ObjectId()}`,
      token
    );
    assert.equal(res.status, 400);
  });
});
