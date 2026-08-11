// Repeating entries: rules that write real transactions on their due dates.
//
// Two things here are worth more than the rest. A rule must produce each
// occurrence exactly once however many times the materialiser runs — a
// duplicate rent silently halves the month's budget. And a rule must never
// produce an entry for a day the user has already lived through, because
// computeStreak walks every day since the first transaction, so a back-filled
// row rewrites a streak that has already been seen.
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
let ensureRecurringDue;
let occurrencesFor;
let FIXED_CATEGORIES;

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
    googleId: `google-r${userSeq}`,
    username: `ruser${userSeq}`,
    email: `ruser${userSeq}@example.com`,
    ...overrides,
  });
};

const todayYmd = () => new Date().toISOString().slice(0, 10);

const RENT = {
  description: "Rent",
  amount: 800,
  type: "expense",
  category: "Shopping",
  frequency: "monthly",
  dayOfMonth: 1,
};

/** Create a rule through the API and hand back its id. */
const makeRule = async (token, overrides = {}) => {
  const { status, body } = await call("/api/auth/recurring", token, "POST", {
    ...RENT,
    ...overrides,
  });
  assert.equal(status, 201, `creating rule: ${JSON.stringify(body)}`);
  return body.id;
};

/**
 * Run the materialiser directly at a chosen date. The HTTP layer only ever
 * passes today, so travelling forward in time is the only way to see a rule
 * come due without waiting a month.
 */
const runAt = async (userId, ymd) => {
  const fresh = await User.findById(userId);
  const written = await ensureRecurringDue(fresh, ymd);
  return written;
};

const rowsFor = (userId) =>
  Transaction.find({ userId }).sort({ date: 1 }).lean();

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("recurringtest"),
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
  ({ ensureRecurringDue, occurrencesFor } = await import("../lib/recurring.js"));
  ({ FIXED_CATEGORIES } = await import("../lib/entryFields.js"));

  await mongoose.connect(process.env.MONGO_URI);
  // The idempotency guard is a unique index, so the tests are only meaningful
  // once it exists.
  await Transaction.init();
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

describe("working out when a rule is due", () => {
  const monthly = (dayOfMonth) => ({ frequency: "monthly", dayOfMonth });

  it("fires once a month on the chosen day", () => {
    assert.deepEqual(occurrencesFor(monthly(15), "2026-08-14", "2026-10-20"), [
      "2026-08-15",
      "2026-09-15",
      "2026-10-15",
    ]);
  });

  it("takes the last day of the month when the day doesn't exist", () => {
    // Rent on the 31st still has to come out in February, so it clamps rather
    // than skipping the month entirely.
    assert.deepEqual(occurrencesFor(monthly(31), "2027-01-31", "2027-04-01"), [
      "2027-02-28",
      "2027-03-31",
    ]);
    assert.deepEqual(occurrencesFor(monthly(30), "2028-01-31", "2028-03-01"), [
      "2028-02-29",
    ]);
  });

  it("excludes the day it starts from and includes the day it ends on", () => {
    // The lower bound is the last day already written, so re-running on the
    // same day must produce nothing.
    assert.deepEqual(occurrencesFor(monthly(5), "2026-08-05", "2026-08-05"), []);
    assert.deepEqual(occurrencesFor(monthly(5), "2026-08-04", "2026-08-05"), [
      "2026-08-05",
    ]);
  });

  it("fires weekly on the chosen weekday", () => {
    // 2026-08-12 is a Wednesday; weekday 3 is Wednesday.
    const weekly = { frequency: "weekly", weekday: 3 };
    assert.deepEqual(occurrencesFor(weekly, "2026-08-10", "2026-09-01"), [
      "2026-08-12",
      "2026-08-19",
      "2026-08-26",
    ]);
  });
});

describe("materialising", () => {
  it("writes the entry on its due date, once", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await makeRule(token, { ...RENT, dayOfMonth: 1, startKey: todayYmd() });

    // A month on, rent has come due once.
    const written = await runAt(user._id, "2026-09-05");
    assert.equal(written, 1);

    const rows = await rowsFor(user._id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].description, "Rent");
    assert.equal(rows[0].amount, 800);
    assert.equal(rows[0].dueKey, "2026-09-01");
    assert.equal(rows[0].date.toISOString().slice(0, 10), "2026-09-01");
    // The history views group by these, so they have to match the due date
    // rather than the day it happened to be written.
    assert.equal(rows[0].month, 8);
    assert.equal(rows[0].year, 2026);
  });

  it("stays at one row however many times it runs", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await makeRule(token, { startKey: todayYmd() });

    for (let i = 0; i < 4; i += 1) await runAt(user._id, "2026-09-05");

    assert.equal((await rowsFor(user._id)).length, 1);
  });

  it("survives two requests materialising at the same moment", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await makeRule(token, { startKey: todayYmd() });

    // Both load the rule before either writes, so both compute the same
    // occurrence — exactly the app-open race. The unique index is what stops
    // the second one landing.
    const [a, b] = await Promise.all([
      runAt(user._id, "2026-09-05"),
      runAt(user._id, "2026-09-05"),
    ]);

    assert.equal(a + b, 2, "both runs should have attempted the write");
    assert.equal((await rowsFor(user._id)).length, 1);
  });

  it("catches up every occurrence missed while the app was closed", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await makeRule(token, { startKey: todayYmd() });

    // Away for three months, then one visit.
    await runAt(user._id, "2026-11-10");

    const rows = await rowsFor(user._id);
    assert.deepEqual(
      rows.map((r) => r.dueKey),
      ["2026-09-01", "2026-10-01", "2026-11-01"]
    );
  });

  it("never writes an entry for a day already lived through", async () => {
    const user = await makeUser();
    const token = signToken(user);
    // Created today, due on the 1st — the 1st of this month has already been
    // and gone, and back-filling it would rewrite a streak the user has seen.
    await makeRule(token, { dayOfMonth: 1, startKey: todayYmd() });

    await runAt(user._id, todayYmd());

    assert.equal((await rowsFor(user._id)).length, 0);
  });

  it("leaves a paused rule alone", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const id = await makeRule(token, { startKey: todayYmd() });

    await call(`/api/auth/recurring/${id}`, token, "PATCH", { paused: true });
    await runAt(user._id, "2026-11-10");

    assert.equal((await rowsFor(user._id)).length, 0);
  });

  it("starts from the day it resumes rather than back-filling the pause", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const id = await makeRule(token, { startKey: todayYmd() });

    // Stand the rule up as one paused a long time ago: its watermark is
    // months behind, which is what a back-fill would work from.
    await User.updateOne(
      { _id: user._id },
      { $set: { "recurring.0.paused": true, "recurring.0.lastRunKey": "2026-01-05" } }
    );

    const resumed = await call(`/api/auth/recurring/${id}`, token, "PATCH", {
      paused: false,
    });

    // Resuming drags the watermark up to now, so the months it was switched
    // off can never be written — they genuinely didn't happen.
    assert.equal(resumed.body.lastRunKey, todayYmd());
    await runAt(user._id, todayYmd());
    assert.equal((await rowsFor(user._id)).length, 0);
  });

  it("doesn't repeat a day after the entry's date is changed", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await makeRule(token, { startKey: todayYmd() });
    await runAt(user._id, "2026-09-05");
    const [row] = await rowsFor(user._id);

    // The row is moved off its due date, and the rule is rewound so it really
    // does reconsider that occurrence.
    await Transaction.updateOne(
      { _id: row._id },
      { $set: { date: new Date("2026-09-03T00:00:00.000Z") } }
    );
    await User.updateOne(
      { _id: user._id },
      { $set: { "recurring.0.lastRunKey": "2026-08-25" } }
    );

    await runAt(user._id, "2026-09-05");

    // Only dueKey decides whether an occurrence exists. Had it keyed off the
    // date, correcting a row would quietly earn you a second rent.
    assert.equal((await rowsFor(user._id)).length, 1);
  });

  it("does nothing at all for a user with no rules", async () => {
    const user = await makeUser();
    assert.equal(await runAt(user._id, "2026-09-05"), 0);
  });

  it("reaches the streak as an ordinary expense on its due date", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await call("/api/transactions", token, "POST", {
      description: "Allowance",
      amount: 1000,
      type: "income",
      category: "Allowance",
      date: todayYmd(),
    });

    const before = await call(`/api/streak?today=${todayYmd()}`, token);
    // Due today, so opening the app writes it and the budget moves.
    await makeRule(token, {
      dayOfMonth: Number(todayYmd().slice(8, 10)),
      startKey: todayYmd(),
    });
    const after = await call(`/api/streak?today=${todayYmd()}`, token);

    assert.equal(before.body.today.spent, 0);
    assert.equal(after.body.today.spent, 800);
  });
});

describe("managing rules", () => {
  it("returns them on the profile", async () => {
    const token = signToken(await makeUser());
    const id = await makeRule(token, { startKey: todayYmd() });

    const me = await call("/api/auth/me", token);
    assert.equal(me.body.recurring.length, 1);
    assert.deepEqual(me.body.recurring[0], {
      id,
      description: "Rent",
      amount: 800,
      type: "expense",
      category: "Shopping",
      accountId: null,
      frequency: "monthly",
      dayOfMonth: 1,
      weekday: null,
      startKey: todayYmd(),
      lastRunKey: todayYmd(),
      paused: false,
    });
  });

  it("refuses a start date in the past", async () => {
    const token = signToken(await makeUser());
    const res = await call("/api/auth/recurring", token, "POST", {
      ...RENT,
      startKey: "2020-01-01",
    });
    assert.equal(res.status, 400);
    assert.match(res.body.message, /today or later/i);
  });

  it("treats a day of timezone skew as today rather than a back-date", async () => {
    const token = signToken(await makeUser());
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // Evening anywhere west of UTC reads a day behind the server. Refusing it
    // would tell those users their own today is in the past.
    const res = await call("/api/auth/recurring", token, "POST", {
      ...RENT,
      startKey: yesterday,
    });

    assert.equal(res.status, 201);
    assert.equal(res.body.startKey, todayYmd(), "clamped up to today, not stored behind it");
  });

  it("checks every field as strictly as a transaction does", async () => {
    const token = signToken(await makeUser());
    const cases = [
      [{ amount: 0 }, "zero amount"],
      [{ amount: -5 }, "negative amount"],
      [{ description: "  " }, "blank description"],
      [{ category: "Nonsense" }, "unknown category"],
      [{ category: "Allowance" }, "category from the other type"],
      [{ type: "transfer" }, "invalid type"],
      [{ frequency: "yearly" }, "unsupported frequency"],
      [{ dayOfMonth: 0 }, "day 0"],
      [{ dayOfMonth: 32 }, "day 32"],
      [{ frequency: "weekly", weekday: 9, dayOfMonth: undefined }, "weekday 9"],
      [{ accountId: "64b7f9f9f9f9f9f9f9f9f9f9" }, "somebody else's account"],
    ];

    for (const [patch, label] of cases) {
      const res = await call("/api/auth/recurring", token, "POST", { ...RENT, ...patch });
      assert.equal(res.status, 400, `${label} should be refused`);
    }
  });

  it("accepts exactly the categories a transaction does", async () => {
    const token = signToken(await makeUser());
    const custom = await call("/api/auth/categories", token, "POST", {
      name: "Rent",
      type: "expense",
      color: "#3b82f6",
    });
    assert.equal(custom.status, 201);

    // A rule produces transactions, so anything it accepts the transaction
    // endpoints must accept too. Both read one list; this fails the moment
    // either grows a private copy of it.
    for (const [type, categories] of Object.entries(FIXED_CATEGORIES)) {
      for (const category of [...categories, ...(type === "expense" ? ["Rent"] : [])]) {
        const txn = await call("/api/transactions", token, "POST", {
          description: category,
          amount: 5,
          type,
          category,
          date: todayYmd(),
        });
        const rule = await call("/api/auth/recurring", token, "POST", {
          ...RENT,
          type,
          category,
          startKey: todayYmd(),
        });
        assert.equal(txn.status, 201, `transaction rejected ${type}/${category}`);
        assert.equal(rule.status, 201, `rule rejected ${type}/${category}`);
      }
    }
  });

  it("stops at twenty", async () => {
    const token = signToken(await makeUser());
    for (let i = 0; i < 20; i += 1) {
      await makeRule(token, { description: `Rule ${i}`, startKey: todayYmd() });
    }
    const extra = await call("/api/auth/recurring", token, "POST", {
      ...RENT,
      startKey: todayYmd(),
    });
    assert.equal(extra.status, 400);
  });

  it("re-checks the category against the type when only the type changes", async () => {
    const token = signToken(await makeUser());
    // Shopping is an expense category, so flipping the rule to income has to be
    // refused rather than leaving it producing entries the API would reject.
    const id = await makeRule(token, { startKey: todayYmd() });
    const res = await call(`/api/auth/recurring/${id}`, token, "PATCH", {
      type: "income",
    });
    assert.equal(res.status, 400);

    const ok = await call(`/api/auth/recurring/${id}`, token, "PATCH", {
      type: "income",
      category: "Job",
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.type, "income");
  });

  it("changes what comes next, never what has already been written", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const id = await makeRule(token, { startKey: todayYmd() });
    await runAt(user._id, "2026-09-05");

    await call(`/api/auth/recurring/${id}`, token, "PATCH", { amount: 950 });
    const rows = await rowsFor(user._id);

    // The rent you already paid was 800, whatever it costs from now on.
    assert.equal(rows.length, 1);
    assert.equal(rows[0].amount, 800);

    await runAt(user._id, "2026-10-05");
    const after = await rowsFor(user._id);
    assert.deepEqual(after.map((r) => r.amount), [800, 950]);
  });

  it("keeps the entries it has written when the rule is deleted", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const id = await makeRule(token, { startKey: todayYmd() });
    await runAt(user._id, "2026-09-05");

    const res = await call(`/api/auth/recurring/${id}`, token, "DELETE");
    assert.equal(res.status, 200);

    // Cancelling a subscription doesn't unspend the months you paid for.
    assert.equal((await rowsFor(user._id)).length, 1);
    const me = await call("/api/auth/me", token);
    assert.equal(me.body.recurring.length, 0);
  });

  it("won't delete an account a rule still points at", async () => {
    const token = signToken(await makeUser());
    const account = await call("/api/auth/accounts", token, "POST", {
      name: "Trust",
      color: "#3b82f6",
    });
    await makeRule(token, { startKey: todayYmd(), accountId: account.body.id });

    const res = await call(`/api/auth/accounts/${account.body.id}`, token, "DELETE");

    assert.equal(res.status, 409);
    assert.match(res.body.message, /repeating entry/i);
  });

  it("won't touch somebody else's rule", async () => {
    const owner = signToken(await makeUser());
    const id = await makeRule(owner, { startKey: todayYmd() });
    const stranger = signToken(await makeUser());

    const patch = await call(`/api/auth/recurring/${id}`, stranger, "PATCH", {
      amount: 1,
    });
    assert.equal(patch.status, 404);
    const remove = await call(`/api/auth/recurring/${id}`, stranger, "DELETE");
    assert.equal(remove.status, 404);
  });

  it("blocks the demo account", async () => {
    const token = signToken(await makeUser({ isDemo: true }));
    const res = await call("/api/auth/recurring", token, "POST", {
      ...RENT,
      startKey: todayYmd(),
    });
    assert.equal(res.status, 403);
  });
});
