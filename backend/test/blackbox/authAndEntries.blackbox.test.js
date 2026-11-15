// Black-box API tests: sessions, the demo account, and transactions.
// Expectations come from the README's API table and design notes.
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { boot, SECRET } from "./_harness.js";

// Tuesday 10 March 2026, midday in Singapore.
const NOW = "2026-03-10T04:00:00.000Z";
const TODAY = "2026-03-10";

let api;
before(async () => { api = await boot("bbentries", { now: NOW }); });
after(async () => { await api.stop(); });

const PROTECTED = [
  ["GET", "/api/auth/me"], ["GET", "/api/auth/home"], ["POST", "/api/auth/refresh"], ["POST", "/api/auth/logout"],
  ["POST", "/api/auth/categories"], ["DELETE", "/api/auth/categories/507f1f77bcf86cd799439011"],
  ["POST", "/api/auth/accounts"], ["PATCH", "/api/auth/accounts/507f1f77bcf86cd799439011"], ["DELETE", "/api/auth/accounts/507f1f77bcf86cd799439011"],
  ["POST", "/api/auth/recurring"], ["PATCH", "/api/auth/recurring/507f1f77bcf86cd799439011"], ["DELETE", "/api/auth/recurring/507f1f77bcf86cd799439011"],
  ["PATCH", "/api/auth/profile"], ["PUT", "/api/auth/savings"], ["POST", "/api/auth/tours"], ["POST", "/api/auth/tours/forget"],
  ["POST", "/api/auth/demo/sample"], ["DELETE", "/api/auth/me"],
  ["GET", "/api/transactions"], ["POST", "/api/transactions"], ["PATCH", "/api/transactions/507f1f77bcf86cd799439011"], ["DELETE", "/api/transactions/507f1f77bcf86cd799439011"],
  ["GET", "/api/summary"], ["GET", "/api/summary/all"], ["GET", "/api/summary/lifetime"],
  ["GET", "/api/streak"], ["POST", "/api/streak/restore"],
  ["GET", "/api/period"], ["PUT", "/api/period/mode"], ["POST", "/api/period"], ["PATCH", "/api/period/507f1f77bcf86cd799439011"], ["DELETE", "/api/period/507f1f77bcf86cd799439011"],
  ["POST", "/api/period/term"], ["PATCH", "/api/period/term/507f1f77bcf86cd799439011"], ["DELETE", "/api/period/term/507f1f77bcf86cd799439011"],
  ["GET", "/api/accounts"], ["GET", "/api/transfers"], ["POST", "/api/transfers"], ["DELETE", "/api/transfers/507f1f77bcf86cd799439011"],
  ["GET", "/api/friends"], ["GET", "/api/friends/search?q=abc"], ["GET", "/api/friends/requests"], ["GET", "/api/friends/comparison"],
  ["POST", "/api/friends/request/507f1f77bcf86cd799439011"], ["POST", "/api/friends/accept/507f1f77bcf86cd799439011"], ["POST", "/api/friends/decline/507f1f77bcf86cd799439011"],
  ["GET", "/api/push/subscription?endpoint=x"], ["POST", "/api/push/subscription"], ["POST", "/api/push/unsubscribe"], ["POST", "/api/push/test"],
];

describe("health", () => {
  it("liveness, readiness and API health answer without a token", async () => {
    assert.equal((await api.call("/healthz")).status, 200);
    assert.equal((await api.call("/readyz")).status, 200);
    assert.equal((await api.call("/api/health")).status, 200);
  });

  it("an unknown API path is a JSON 404, not a crash", async () => {
    const r = await api.call("/api/does-not-exist");
    assert.equal(r.status, 404);
  });
});

describe("authentication", () => {
  it("every protected route refuses a request with no token", async () => {
    for (const [method, path] of PROTECTED) {
      const r = await api.call(path, null, method, method === "GET" ? undefined : {});
      assert.equal(r.status, 401, `${method} ${path} → ${r.status}`);
    }
  });

  it("refuses a malformed token", async () => {
    assert.equal((await api.call("/api/auth/me", "not-a-jwt")).status, 401);
    assert.equal((await api.call("/api/auth/me", "a.b.c")).status, 401);
  });

  it("refuses a token signed with another secret", async () => {
    const { id } = await api.makeUser();
    const forged = jwt.sign({ id, tv: 0, authAt: Math.floor(Date.now() / 1000) }, "some-other-secret-that-is-long-enough-000", {
      algorithm: "HS256", expiresIn: "7d", audience: "broke-no-more-web", issuer: "broke-no-more-api",
    });
    assert.equal((await api.call("/api/auth/me", forged)).status, 401);
  });

  it("refuses an unsigned (alg: none) token", async () => {
    const { id } = await api.makeUser();
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const nowS = Math.floor(Date.now() / 1000);
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64({ id, tv: 0, authAt: nowS, iat: nowS, exp: nowS + 3600, aud: "broke-no-more-web", iss: "broke-no-more-api" })}.`;
    assert.equal((await api.call("/api/auth/me", unsigned)).status, 401);
  });

  it("refuses a correctly signed token for the wrong audience", async () => {
    const { id } = await api.makeUser();
    const other = jwt.sign({ id, tv: 0, authAt: Math.floor(Date.now() / 1000) }, SECRET, {
      algorithm: "HS256", expiresIn: "7d", audience: "another-app", issuer: "broke-no-more-api",
    });
    assert.equal((await api.call("/api/auth/me", other)).status, 401);
  });

  it("refuses a token for a user that no longer exists", async () => {
    const { user, token } = await api.makeUser();
    await api.models.User.deleteOne({ _id: user._id });
    assert.equal((await api.call("/api/auth/me", token)).status, 401);
  });

  it("refuses a sign-in older than the 30-day ceiling, even with a fresh token", async () => {
    const { user } = await api.makeUser();
    const stale = api.signToken(user, Math.floor(Date.now() / 1000) - 31 * 86400);
    assert.equal((await api.call("/api/auth/me", stale)).status, 401);
    assert.notEqual((await api.call("/api/auth/refresh", stale, "POST")).status, 200);
  });

  it("/me returns the profile and nothing secret", async () => {
    const { token, user } = await api.makeUser();
    const { status, body } = await api.call("/api/auth/me", token);
    assert.equal(status, 200);
    assert.equal(body.username, user.username);
    assert.equal(body.budgetMode, "month");
    assert.equal(body.isDemo, false);
    assert.deepEqual(body.accounts, []);
    assert.deepEqual(body.customCategories, []);
    assert.deepEqual(body.savingsByMonth, {});
    const text = JSON.stringify(body);
    assert.ok(!text.includes(user.googleId), "googleId leaked");
    assert.ok(!("tokenVersion" in body));
  });

  it("refresh hands back a token that works", async () => {
    const { token } = await api.makeUser();
    const r = await api.call("/api/auth/refresh", token, "POST");
    assert.equal(r.status, 200);
    assert.equal((await api.call("/api/auth/me", r.body.token)).status, 200);
  });

  it("refresh keeps the original sign-in time, so the ceiling cannot be reset", async () => {
    const { user } = await api.makeUser();
    const authAt = Math.floor(Date.now() / 1000) - 20 * 86400;
    const r = await api.call("/api/auth/refresh", api.signToken(user, authAt), "POST");
    assert.equal(r.status, 200);
    assert.equal(jwt.decode(r.body.token).authAt, authAt);
  });

  it("signing out revokes every token already issued", async () => {
    const { token, user } = await api.makeUser();
    const second = api.signToken(user);
    assert.equal((await api.call("/api/auth/logout", token, "POST")).status, 200);
    assert.equal((await api.call("/api/auth/me", token)).status, 401);
    assert.equal((await api.call("/api/auth/me", second)).status, 401);
  });
});

// The README still calls this a "shared read-only demo account". What the app
// serves today is a private sandbox per visitor, so that is what is pinned here.
describe("the demo is a private sandbox per visitor", () => {
  it("logs in without credentials and says it is a demo", async () => {
    const r = await api.call("/api/auth/demo", null, "POST");
    assert.equal(r.status, 200);
    const me = await api.call("/api/auth/me", r.body.token);
    assert.equal(me.status, 200);
    assert.equal(me.body.isDemo, true);
  });

  it("can read every page's data", async () => {
    const demo = (await api.call("/api/auth/demo", null, "POST")).body.token;
    for (const path of ["/api/auth/home", "/api/streak", "/api/period", "/api/transactions", "/api/summary/all", "/api/summary/lifetime", "/api/accounts", "/api/friends", "/api/friends/comparison"]) {
      const r = await api.call(`${path}?today=${TODAY}`, demo);
      assert.equal(r.status, 200, path);
    }
  });

  it("two visitors never share data", async () => {
    const one = (await api.call("/api/auth/demo", null, "POST")).body.token;
    const two = (await api.call("/api/auth/demo", null, "POST")).body.token;
    const a = (await api.call("/api/auth/me", one)).body;
    const b = (await api.call("/api/auth/me", two)).body;
    assert.notEqual(a.id, b.id);
    assert.equal((await api.expense(one, TODAY, 7, { description: "visitor one only" })).status, 201);
    const seen = await api.call("/api/transactions?start=2026-03-01&end=2026-03-31", two);
    assert.ok(!seen.body.some((t) => t.description === "visitor one only"));
  });

  it("cannot register for push notifications", async () => {
    const demo = (await api.call("/api/auth/demo", null, "POST")).body.token;
    const r = await api.call("/api/push/subscription", demo, "POST", { endpoint: "https://push.example.com/x", keys: { p256dh: "a", auth: "b" } });
    assert.equal(r.status, 403);
  });

  it("is not discoverable by real users' friend search", async () => {
    const demo = (await api.call("/api/auth/demo", null, "POST")).body.token;
    const name = (await api.call("/api/auth/me", demo)).body.username;
    const real = await api.makeUser();
    const r = await api.call(`/api/friends/search?q=${encodeURIComponent(name.slice(0, 6))}`, real.token);
    assert.ok(!r.body.some((u) => u.username === name), "a throwaway demo user showed up in search");
  });

  it("signing out throws the sandbox away", async () => {
    const demo = (await api.call("/api/auth/demo", null, "POST")).body.token;
    const id = (await api.call("/api/auth/me", demo)).body.id;
    await api.expense(demo, TODAY, 7);
    assert.equal((await api.call("/api/auth/logout", demo, "POST")).status, 200);
    assert.equal((await api.call("/api/auth/me", demo)).status, 401);
    assert.equal(await api.models.User.countDocuments({ _id: id }), 0);
    assert.equal(await api.models.Transaction.countDocuments({ userId: id }), 0);
  });
});

describe("transactions: creating", () => {
  let token;
  before(async () => { ({ token } = await api.makeUser()); });

  it("stores the entry at UTC midnight with a 0-based month", async () => {
    const r = await api.expense(token, "2026-03-05", 12.5, { description: "Lunch" });
    assert.equal(r.status, 201);
    assert.equal(r.body.date, "2026-03-05T00:00:00.000Z");
    assert.equal(r.body.month, 2);
    assert.equal(r.body.year, 2026);
    assert.equal(r.body.amount, 12.5);
    assert.equal(r.body.type, "expense");
    assert.equal(r.body.paidBack, 0);
    assert.equal(r.body.accountId, null);
  });

  it("trims the description and rounds the amount to cents", async () => {
    const r = await api.expense(token, "2026-03-05", 12.345, { description: "  Kopi  " });
    assert.equal(r.status, 201);
    assert.equal(r.body.description, "Kopi");
    assert.equal(r.body.amount, 12.35);
  });

  it("accepts today and — for clients ahead of UTC — tomorrow", async () => {
    assert.equal((await api.expense(token, TODAY, 1)).status, 201);
    assert.equal((await api.expense(token, "2026-03-11", 1)).status, 201);
  });

  it("refuses a date further in the future", async () => {
    assert.equal((await api.expense(token, "2026-03-12", 1)).status, 400);
    assert.equal((await api.expense(token, "2027-01-01", 1)).status, 400);
  });

  it("refuses impossible and malformed dates", async () => {
    for (const date of ["2026-02-30", "not-a-date", "2026-13-01", "03/05/2026", 20260305, { $gt: "" }]) {
      const r = await api.expense(token, date, 1);
      assert.equal(r.status, 400, `date ${JSON.stringify(date)} → ${r.status}`);
    }
  });

  it("refuses zero, negative, non-finite and over-cap amounts", async () => {
    for (const amount of [0, -5, 1e9 + 1, "abc", null]) {
      const r = await api.expense(token, TODAY, amount);
      assert.equal(r.status, 400, `amount ${JSON.stringify(amount)} → ${r.status}`);
    }
  });

  it("refuses an unknown type", async () => {
    const r = await api.add(token, { type: "transfer", date: TODAY, amount: 5, category: "F & B", description: "x" });
    assert.equal(r.status, 400);
  });

  it("refuses a category from the other type, and one that does not exist", async () => {
    assert.equal((await api.expense(token, TODAY, 5, { category: "Allowance" })).status, 400);
    assert.equal((await api.income(token, TODAY, 5, { category: "Transport" })).status, 400);
    assert.equal((await api.expense(token, TODAY, 5, { category: "Made Up" })).status, 400);
  });

  it("refuses a description over 120 characters", async () => {
    assert.equal((await api.expense(token, TODAY, 5, { description: "x".repeat(121) })).status, 400);
    assert.equal((await api.expense(token, TODAY, 5, { description: "x".repeat(120) })).status, 201);
  });

  it("refuses query-operator objects in place of a category or type", async () => {
    for (const field of ["category", "type"]) {
      const r = await api.add(token, { type: "expense", date: TODAY, amount: 5, category: "F & B", description: "x", [field]: { $ne: null } });
      assert.equal(r.status, 400, `${field} → ${r.status}`);
    }
  });

  it("refuses an object or array in place of a description", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    for (const description of [{ $ne: null }, { a: 1 }, ["x", "y"]]) {
      const r = await api.add(token, { type: "expense", date: TODAY, amount: 5, category: "F & B", description });
      assert.equal(r.status, 400, `${JSON.stringify(description)} → ${r.status}, saved as ${JSON.stringify(r.body.description)}`);
    }
  });

  it("refuses a boolean or array in place of an amount", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    for (const amount of [true, [5]]) {
      const r = await api.expense(token, TODAY, amount);
      assert.equal(r.status, 400, `${JSON.stringify(amount)} → ${r.status}, saved as ${JSON.stringify(r.body.amount)}`);
    }
  });

  it("refuses an amount that would be stored as $0.00", async () => {
    const r = await api.expense(token, TODAY, 0.004);
    assert.equal(r.status, 400, `saved as ${JSON.stringify(r.body.amount)}`);
  });

  it("refuses a body that is not JSON without a 500", async () => {
    const r = await api.call("/api/transactions", token, "POST", "{not json");
    assert.equal(r.status, 400);
  });

  it("ignores an attempt to write for another user", async () => {
    const other = await api.makeUser();
    const r = await api.add(token, { type: "expense", date: TODAY, amount: 5, category: "F & B", description: "mine", userId: other.id });
    assert.equal(r.status, 201);
    assert.notEqual(r.body.userId, other.id);
    const theirs = await api.call(`/api/transactions?start=2026-03-01&end=2026-03-31`, other.token);
    assert.equal(theirs.body.length, 0);
  });

  it("a custom category works once created, for its own type only", async () => {
    const cat = await api.call("/api/auth/categories", token, "POST", { name: "Pets", type: "expense", color: "#aabbcc" });
    assert.equal(cat.status, 201);
    assert.equal((await api.expense(token, TODAY, 5, { category: "Pets" })).status, 201);
    assert.equal((await api.income(token, TODAY, 5, { category: "Pets" })).status, 400);
  });

  it("a custom category belongs to its owner only", async () => {
    const other = await api.makeUser();
    assert.equal((await api.expense(other.token, TODAY, 5, { category: "Pets" })).status, 400);
  });
});

describe("transactions: paid back", () => {
  let token;
  before(async () => { ({ token } = await api.makeUser()); });

  it("an expense can carry an amount paid back", async () => {
    const r = await api.expense(token, TODAY, 40, { paidBack: 15 });
    assert.equal(r.status, 201);
    assert.equal(r.body.paidBack, 15);
  });

  it("income cannot be paid back", async () => {
    assert.equal((await api.income(token, TODAY, 40, { paidBack: 15 })).status, 400);
  });

  it("a negative paid-back amount is refused", async () => {
    assert.equal((await api.expense(token, TODAY, 40, { paidBack: -1 })).status, 400);
  });

  it("the period counts the expense net of what came back", async () => {
    const fresh = await api.makeUser();
    await api.income(fresh.token, "2026-03-01", 500);
    await api.expense(fresh.token, "2026-03-03", 40, { paidBack: 15 });
    const home = await api.call(`/api/auth/home?today=${TODAY}`, fresh.token);
    assert.equal(home.body.periodExpenses, 25);
    assert.equal(home.body.periodIncome, 500);
    assert.equal(home.body.leftToSpend, 475);
  });
});

describe("transactions: listing", () => {
  let token;
  before(async () => {
    ({ token } = await api.makeUser());
    await api.income(token, "2026-02-27", 100, { description: "feb late" });
    await api.expense(token, "2026-02-28", 5, { description: "feb last" });
    await api.expense(token, "2026-03-01", 6, { description: "mar first" });
    await api.expense(token, "2026-03-05", 7, { description: "mar mid" });
    await api.expense(token, "2026-03-10", 8, { description: "mar today" });
  });

  const names = (r) => r.body.map((t) => t.description);

  it("a date range includes both of its ends", async () => {
    const r = await api.call("/api/transactions?start=2026-02-28&end=2026-03-05", token);
    assert.equal(r.status, 200);
    assert.deepEqual(names(r).sort(), ["feb last", "mar first", "mar mid"]);
  });

  it("a range crossing a month boundary returns both months' entries", async () => {
    const r = await api.call("/api/transactions?start=2026-02-20&end=2026-03-10", token);
    assert.equal(r.body.length, 5);
  });

  it("a one-day range returns that day only", async () => {
    const r = await api.call("/api/transactions?start=2026-03-01&end=2026-03-01", token);
    assert.deepEqual(names(r), ["mar first"]);
  });

  it("lists newest first", async () => {
    const r = await api.call("/api/transactions?start=2026-02-01&end=2026-03-31", token);
    const dates = r.body.map((t) => t.date);
    assert.deepEqual(dates, [...dates].sort().reverse());
  });

  it("month and year select one calendar month (0-based month)", async () => {
    const feb = await api.call("/api/transactions?month=1&year=2026", token);
    assert.deepEqual(names(feb).sort(), ["feb last", "feb late"]);
    const mar = await api.call("/api/transactions?month=2&year=2026", token);
    assert.equal(mar.body.length, 3);
  });

  it("an empty range is an empty list, not an error", async () => {
    const r = await api.call("/api/transactions?start=2025-01-01&end=2025-01-31", token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, []);
  });

  it("refuses a malformed or backwards range", async () => {
    assert.equal((await api.call("/api/transactions?start=junk&end=2026-03-05", token)).status, 400);
    assert.equal((await api.call("/api/transactions?start=2026-03-05&end=junk", token)).status, 400);
    assert.equal((await api.call("/api/transactions?start=2026-03-10&end=2026-03-01", token)).status, 400);
    assert.equal((await api.call("/api/transactions?month=12&year=2026", token)).status, 400);
  });

  it("refuses operator injection through the query string", async () => {
    const r = await api.call("/api/transactions?start[$gt]=&end[$gt]=", token);
    assert.equal(r.status, 400);
  });

  it("never shows another user's entries", async () => {
    const other = await api.makeUser();
    const r = await api.call("/api/transactions?start=2026-01-01&end=2026-03-31", other.token);
    assert.deepEqual(r.body, []);
  });
});

describe("transactions: editing", () => {
  let token; let row;
  before(async () => {
    ({ token } = await api.makeUser());
    row = (await api.expense(token, "2026-03-05", 20, { description: "Dinner", category: "F & B" })).body;
  });

  it("changes only the fields that were sent", async () => {
    const r = await api.call(`/api/transactions/${row._id}`, token, "PATCH", { amount: 22.5 });
    assert.equal(r.status, 200);
    assert.equal(r.body.amount, 22.5);
    assert.equal(r.body.description, "Dinner");
    assert.equal(r.body.category, "F & B");
    assert.equal(r.body.date, "2026-03-05T00:00:00.000Z");
  });

  it("moves month and year with the date", async () => {
    const r = await api.call(`/api/transactions/${row._id}`, token, "PATCH", { date: "2026-02-27" });
    assert.equal(r.status, 200);
    assert.equal(r.body.date, "2026-02-27T00:00:00.000Z");
    assert.equal(r.body.month, 1);
    assert.equal(r.body.year, 2026);
    const feb = await api.call("/api/transactions?month=1&year=2026", token);
    assert.ok(feb.body.some((t) => t._id === row._id));
    const mar = await api.call("/api/transactions?month=2&year=2026", token);
    assert.ok(!mar.body.some((t) => t._id === row._id));
  });

  it("refuses to change the type", async () => {
    const r = await api.call(`/api/transactions/${row._id}`, token, "PATCH", { type: "income" });
    assert.equal(r.status, 400);
    const again = await api.call("/api/transactions?start=2026-02-01&end=2026-03-31", token);
    assert.equal(again.body.find((t) => t._id === row._id).type, "expense");
  });

  it("applies the same validation as creating", async () => {
    for (const patch of [{ amount: 0 }, { amount: -3 }, { amount: 1e10 }, { description: "" }, { description: "x".repeat(121) }, { category: "Allowance" }, { category: "Nope" }, { date: "2026-02-30" }, { date: "2026-03-12" }]) {
      const r = await api.call(`/api/transactions/${row._id}`, token, "PATCH", patch);
      assert.equal(r.status, 400, `${JSON.stringify(patch)} → ${r.status}`);
    }
  });

  it("cannot be used to move an entry to another user", async () => {
    const other = await api.makeUser();
    const r = await api.call(`/api/transactions/${row._id}`, token, "PATCH", { userId: other.id, amount: 30 });
    assert.notEqual(r.body.userId, other.id);
    const theirs = await api.call("/api/transactions?start=2026-01-01&end=2026-03-31", other.token);
    assert.deepEqual(theirs.body, []);
  });

  it("is 404 for someone else's entry, and leaves it untouched", async () => {
    const other = await api.makeUser();
    const r = await api.call(`/api/transactions/${row._id}`, other.token, "PATCH", { amount: 999 });
    assert.equal(r.status, 404);
    const mine = await api.call("/api/transactions?start=2026-01-01&end=2026-03-31", token);
    assert.notEqual(mine.body.find((t) => t._id === row._id).amount, 999);
  });

  it("is 404 for an id that does not exist and 400/404 for a malformed one", async () => {
    assert.equal((await api.call("/api/transactions/507f1f77bcf86cd799439011", token, "PATCH", { amount: 5 })).status, 404);
    const bad = await api.call("/api/transactions/not-an-id", token, "PATCH", { amount: 5 });
    assert.ok([400, 404].includes(bad.status), `got ${bad.status}`);
  });
});

describe("transactions: deleting", () => {
  it("removes the entry, and a second delete is 404", async () => {
    const { token } = await api.makeUser();
    const row = (await api.expense(token, "2026-03-05", 20)).body;
    assert.equal((await api.call(`/api/transactions/${row._id}`, token, "DELETE")).status, 200);
    assert.deepEqual((await api.call("/api/transactions?start=2026-03-01&end=2026-03-31", token)).body, []);
    assert.equal((await api.call(`/api/transactions/${row._id}`, token, "DELETE")).status, 404);
  });

  it("cannot delete someone else's entry", async () => {
    const owner = await api.makeUser();
    const other = await api.makeUser();
    const row = (await api.expense(owner.token, "2026-03-05", 20)).body;
    assert.equal((await api.call(`/api/transactions/${row._id}`, other.token, "DELETE")).status, 404);
    assert.equal((await api.call("/api/transactions?start=2026-03-01&end=2026-03-31", owner.token)).body.length, 1);
  });

  it("a malformed id is refused without a 500", async () => {
    const { token } = await api.makeUser();
    const r = await api.call("/api/transactions/not-an-id", token, "DELETE");
    assert.ok([400, 404].includes(r.status), `got ${r.status}`);
  });
});

describe("deleting an account removes everything it owned", () => {
  it("cascades to entries, periods and friend references", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    await api.income(a.token, "2026-03-01", 100);
    await api.call("/api/period/mode", a.token, "PUT", { mode: "days" });
    await api.call("/api/period", a.token, "POST", { start: "2026-03-01", length: 14, today: TODAY });
    await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {});
    await api.call(`/api/friends/accept/${a.id}`, b.token, "POST", {});
    assert.equal((await api.call("/api/friends", b.token)).body.length, 1);

    assert.equal((await api.call("/api/auth/me", a.token, "DELETE")).status, 200);

    assert.equal((await api.call("/api/auth/me", a.token)).status, 401);
    assert.equal(await api.models.Transaction.countDocuments({ userId: a.user._id }), 0);
    assert.equal(await api.models.BudgetPeriod.countDocuments({ userId: a.user._id }), 0);
    assert.deepEqual((await api.call("/api/friends", b.token)).body, []);
    assert.equal((await api.call("/api/friends/comparison", b.token)).body.leaderboard.length, 1);
  });

  it("leaves other users' data alone", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    await api.income(b.token, "2026-03-01", 100);
    await api.call("/api/auth/me", a.token, "DELETE");
    assert.equal((await api.call("/api/transactions?start=2026-03-01&end=2026-03-31", b.token)).body.length, 1);
  });
});
