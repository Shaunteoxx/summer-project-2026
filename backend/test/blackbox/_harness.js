// Shared boot for the black-box API suites: the real Express app over an
// in-memory MongoDB, driven through HTTP only.
//
// The clock can be pinned (`now`) because the API clamps the client's `today`
// to within a day of the server's, so a month boundary is otherwise untestable.
// Only `Date` is mocked — timers stay real, so sockets and the driver behave.
import { mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

export const SECRET = "test-jwt-secret-at-least-32-characters-long";
export const CRON_SECRET = "test-cron-secret-at-least-32-characters-long";

export async function boot(dbName, { now } = {}) {
  if (now) mock.timers.enable({ apis: ["Date"], now: Date.parse(now) });

  const mongo = await MongoMemoryServer.create();
  // Set before the app loads, so nothing in a local .env can point this at a
  // real database.
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri(dbName),
    JWT_SECRET: SECRET,
    CRON_SECRET,
    CLIENT_URL: "http://localhost:5173",
    SERVER_URL: "http://localhost:5000",
    GOOGLE_CLIENT_ID: "test-client-id",
    GOOGLE_CLIENT_SECRET: "test-client-secret",
    GOOGLE_CALLBACK_URL: "http://localhost:5000/api/auth/google/callback",
  });

  const { app } = await import("../../index.js");
  const models = {};
  for (const name of ["User", "Transaction", "Transfer", "BudgetPeriod", "BudgetTerm", "PushSubscription"]) {
    ({ default: models[name] } = await import(`../../models/${name}.js`));
  }
  const { signToken } = await import("../../middleware/auth.js");

  await mongoose.connect(process.env.MONGO_URI);
  // Belt and braces: these suites delete freely, so refuse to run anywhere
  // but the throwaway server started above.
  assert.equal(mongoose.connection.name, dbName);
  assert.ok(["127.0.0.1", "localhost"].includes(mongoose.connection.host));

  const server = app.listen(0);
  await once(server, "listening");
  const base = `http://localhost:${server.address().port}`;

  const call = async (path, token, method = "GET", body, headers = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body !== undefined ? { body: typeof body === "string" ? body : JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    return { status: res.status, body: parsed, headers: res.headers };
  };

  let seq = 0;
  const makeUser = async (overrides = {}) => {
    seq += 1;
    const user = await models.User.create({
      googleId: `google-${dbName}-${seq}`,
      username: `${dbName}user${seq}`,
      email: `${dbName}${seq}@example.com`,
      ...overrides,
    });
    return { user, id: String(user._id), token: signToken(user) };
  };

  const setNow = (iso) => mock.timers.setTime(Date.parse(iso));
  const today = () => new Date().toISOString().slice(0, 10);
  const shift = (n, from = today()) => {
    const d = new Date(`${from}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  // Entries go in through the API like any client's would.
  const add = (token, fields) =>
    call("/api/transactions", token, "POST", {
      description: fields.description ?? `${fields.type} ${fields.date}`,
      category: fields.category ?? (fields.type === "income" ? "Allowance" : "F & B"),
      ...fields,
    });
  const income = (token, date, amount, extra = {}) => add(token, { type: "income", date, amount, ...extra });
  const expense = (token, date, amount, extra = {}) => add(token, { type: "expense", date, amount, ...extra });

  const stop = async () => {
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
    if (now) mock.timers.reset();
  };

  const wipe = async () => {
    await Promise.all(Object.values(models).map((M) => M.deleteMany({})));
  };

  return { call, makeUser, setNow, today, shift, add, income, expense, stop, wipe, models, signToken, base };
}

export const near = (actual, expected, eps = 0.006) =>
  assert.ok(Math.abs(actual - expected) <= eps, `expected ≈ ${expected}, got ${actual}`);
