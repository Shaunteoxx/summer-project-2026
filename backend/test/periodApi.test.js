// The /api/period endpoints, against the real Express app and an in-memory
// MongoDB. The cases worth guarding are the ones that corrupt state rather
// than just erroring: overlapping periods, and mode switches losing data.
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
    googleId: `google-p${userSeq}`,
    username: `puser${userSeq}`,
    email: `puser${userSeq}@example.com`,
    ...overrides,
  });
};

// The API clamps `today` to the server's clock, so tests anchor on the real
// date rather than a fixed one.
const todayYmd = () => new Date().toISOString().slice(0, 10);
const shift = (days) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("periodtest"),
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

const addTxn = (userId, ymd, type, amount) => {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  return Transaction.create({
    userId,
    description: `${type} ${ymd}`,
    amount,
    type,
    category: type === "income" ? "Allowance" : "Food & Drinks",
    date,
    month: date.getUTCMonth(),
    year: date.getUTCFullYear(),
  });
};

describe("reading the period", () => {
  it("reports month mode with no stored history", async () => {
    const token = signToken(await makeUser());
    const { status, body } = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(status, 200);
    assert.equal(body.mode, "month");
    assert.equal(body.status, "active");
    assert.deepEqual(body.history, []);
  });

  it("reports 'none' for a days-mode user who hasn't started one", async () => {
    const token = signToken(await makeUser({ budgetMode: "days" }));
    const { body } = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(body.status, "none");
    assert.equal(body.current, null);
  });

  it("reports 'lapsed' once the last period has ended", async () => {
    const user = await makeUser({ budgetMode: "days" });
    await BudgetPeriod.create({
      userId: user._id,
      start: shift(-20),
      end: shift(-6),
      length: 15,
    });
    const { body } = await call(`/api/period?today=${todayYmd()}`, signToken(user));
    assert.equal(body.status, "lapsed");
    assert.equal(body.current, null);
    assert.equal(body.previous.end, shift(-6));
  });
});

describe("starting a period", () => {
  it("creates one and switches the user into days mode", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const { status, body } = await call("/api/period", token, "POST", {
      start: todayYmd(),
      length: 15,
      savingsTarget: 50,
    });

    assert.equal(status, 201);
    assert.equal(body.days, 15);
    assert.equal(body.end, shift(14), "end is derived from start + length");
    assert.equal(body.savesTotal, 2, "restores scale with length");
    assert.equal((await User.findById(user._id)).budgetMode, "days");
  });

  it("rejects a period that overlaps an existing one", async () => {
    const token = signToken(await makeUser());
    // Spans -20..-6. Starts are capped at today, so overlap cases are built
    // out of past dates.
    await call("/api/period", token, "POST", { start: shift(-20), length: 15 });

    // Starts inside the first period's span.
    const clash = await call("/api/period", token, "POST", {
      start: shift(-10),
      length: 15,
    });
    assert.equal(clash.status, 409);

    // Butting up against the end exactly is fine.
    const adjacent = await call("/api/period", token, "POST", {
      start: shift(-5),
      length: 15,
    });
    assert.equal(adjacent.status, 201);
  });

  it("rejects an earlier period that would swallow a later one", async () => {
    const token = signToken(await makeUser());
    await call("/api/period", token, "POST", { start: shift(-10), length: 5 });
    const clash = await call("/api/period", token, "POST", {
      start: shift(-20),
      length: 40,
    });
    assert.equal(clash.status, 409);
  });

  it("validates length and start date", async () => {
    const token = signToken(await makeUser());
    for (const length of [0, 367, 2.5, "abc"]) {
      const res = await call("/api/period", token, "POST", { start: todayYmd(), length });
      assert.equal(res.status, 400, `length ${length} should be rejected`);
    }
    const badStart = await call("/api/period", token, "POST", {
      start: "not-a-date",
      length: 15,
    });
    assert.equal(badStart.status, 400);
  });

  it("allows gaps between periods, since they're started by hand", async () => {
    const token = signToken(await makeUser());
    await call("/api/period", token, "POST", { start: shift(-30), length: 10 });
    const later = await call("/api/period", token, "POST", { start: shift(0), length: 10 });
    assert.equal(later.status, 201);
  });
});

describe("editing a period", () => {
  it("moves the end date when the length changes", async () => {
    const token = signToken(await makeUser());
    const { body: created } = await call("/api/period", token, "POST", {
      start: todayYmd(),
      length: 10,
    });
    const { status, body } = await call(`/api/period/${created.id}`, token, "PATCH", {
      length: 20,
    });
    assert.equal(status, 200);
    assert.equal(body.end, shift(19));
  });

  it("refuses a length change that would collide with the next period", async () => {
    const token = signToken(await makeUser());
    const { body: first } = await call("/api/period", token, "POST", {
      start: shift(-20),
      length: 10,
    });
    await call("/api/period", token, "POST", { start: shift(-10), length: 10 });

    const res = await call(`/api/period/${first.id}`, token, "PATCH", { length: 15 });
    assert.equal(res.status, 409);
  });

  it("moves the end date when the start is corrected", async () => {
    const token = signToken(await makeUser());
    const { body: created } = await call("/api/period", token, "POST", {
      start: shift(-2),
      length: 10,
      savingsTarget: 40,
    });
    const { status, body } = await call(`/api/period/${created.id}`, token, "PATCH", {
      start: shift(-5),
    });
    assert.equal(status, 200);
    assert.equal(body.start, shift(-5));
    assert.equal(body.end, shift(4), "end follows the new start");
    assert.equal(body.savings, 40, "the savings target survives a re-date");
  });

  it("rejects a start date in the future", async () => {
    const token = signToken(await makeUser());
    const { body: created } = await call("/api/period", token, "POST", {
      start: todayYmd(),
      length: 10,
    });
    // A future start would leave today in no period at all.
    const res = await call(`/api/period/${created.id}`, token, "PATCH", {
      start: shift(5),
    });
    assert.equal(res.status, 400);
    const onCreate = await call("/api/period", token, "POST", {
      start: shift(30),
      length: 10,
    });
    assert.equal(onCreate.status, 400);
  });

  it("refuses a re-date that collides with a neighbour", async () => {
    const token = signToken(await makeUser());
    await call("/api/period", token, "POST", { start: shift(-30), length: 10 });
    const { body: second } = await call("/api/period", token, "POST", {
      start: shift(-5),
      length: 6,
    });
    const res = await call(`/api/period/${second.id}`, token, "PATCH", {
      start: shift(-25),
    });
    assert.equal(res.status, 409);
  });

  it("404s on someone else's period", async () => {
    const owner = signToken(await makeUser());
    const stranger = signToken(await makeUser());
    const { body: created } = await call("/api/period", owner, "POST", {
      start: todayYmd(),
      length: 10,
    });
    const res = await call(`/api/period/${created.id}`, stranger, "PATCH", { length: 12 });
    assert.equal(res.status, 404);
  });
});

describe("deleting a period", () => {
  it("removes the window but keeps the transactions", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const { body: created } = await call("/api/period", token, "POST", {
      start: shift(-3),
      length: 10,
    });
    await addTxn(user._id, shift(-2), "income", 300);
    await addTxn(user._id, shift(-1), "expense", 40);

    const res = await call(`/api/period/${created.id}`, token, "DELETE");
    assert.equal(res.status, 200);
    assert.equal(await BudgetPeriod.countDocuments({ userId: user._id }), 0);
    assert.equal(
      await Transaction.countDocuments({ userId: user._id }),
      2,
      "the money stays in the ledger"
    );

    // Those days are now untracked: no budget, and nothing to judge.
    const streak = await call(`/api/streak?today=${todayYmd()}`, token);
    assert.equal(streak.body.periodStatus, "inactive");
    assert.equal(streak.body.today.budget, 0);

    const period = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(period.body.status, "none", "back to nothing set up");
  });

  it("frees the span so a corrected period can take its place", async () => {
    const token = signToken(await makeUser());
    const { body: wrong } = await call("/api/period", token, "POST", {
      start: shift(-10),
      length: 20,
    });
    // Blocked while the mistake is still there...
    const blocked = await call("/api/period", token, "POST", {
      start: shift(-5),
      length: 10,
    });
    assert.equal(blocked.status, 409);

    await call(`/api/period/${wrong.id}`, token, "DELETE");
    const retry = await call("/api/period", token, "POST", {
      start: shift(-5),
      length: 10,
    });
    assert.equal(retry.status, 201);
  });

  it("404s on someone else's period and blocks the demo account", async () => {
    const owner = signToken(await makeUser());
    const stranger = signToken(await makeUser());
    const demo = signToken(await makeUser({ isDemo: true }));
    const { body: created } = await call("/api/period", owner, "POST", {
      start: todayYmd(),
      length: 10,
    });
    assert.equal((await call(`/api/period/${created.id}`, stranger, "DELETE")).status, 404);
    assert.equal((await call(`/api/period/${created.id}`, demo, "DELETE")).status, 403);
  });
});

describe("forgetting to start the next period", () => {
  it("lets you backfill the gap afterwards, and the days get graded", async () => {
    const user = await makeUser();
    const token = signToken(user);
    // A period that ended 6 days ago, then nothing — the user forgot.
    await call("/api/period", token, "POST", { start: shift(-16), length: 10 });
    await addTxn(user._id, shift(-16), "income", 500);
    await addTxn(user._id, shift(-4), "expense", 12); // spent during the gap

    const lapsed = await call(`/api/streak?today=${todayYmd()}`, token);
    assert.equal(lapsed.body.periodStatus, "inactive");
    const before = Object.fromEntries(
      lapsed.body.last7.map((d) => [d.date, d.status])
    );
    assert.equal(before[shift(-4)], "untracked", "gap day starts ungraded");

    // Remembering later: start the next period back-dated to when the last
    // one ended. Past start dates are allowed precisely for this.
    const created = await call("/api/period", token, "POST", {
      start: shift(-6),
      length: 20,
    });
    assert.equal(created.status, 201);
    await addTxn(user._id, shift(-6), "income", 400);

    const after = await call(`/api/streak?today=${todayYmd()}`, token);
    assert.equal(after.body.periodStatus, "active");
    const graded = Object.fromEntries(
      after.body.last7.map((d) => [d.date, d.status])
    );
    assert.equal(graded[shift(-4)], "win", "the forgotten days are graded now");
    assert.ok(after.body.today.budget > 0, "daily budget is back");
  });

  it("still refuses to overlap the period that already ended", async () => {
    const token = signToken(await makeUser());
    await call("/api/period", token, "POST", { start: shift(-16), length: 10 });
    // Back-dating too far would double-count days already budgeted.
    const clash = await call("/api/period", token, "POST", {
      start: shift(-10),
      length: 20,
    });
    assert.equal(clash.status, 409);
  });
});

describe("switching modes", () => {
  it("keeps both modes' data, so switching back restores everything", async () => {
    const user = await makeUser({ savingsByMonth: { "2026-7": 250 } });
    const token = signToken(user);
    await call("/api/period", token, "POST", { start: todayYmd(), length: 15 });

    const back = await call("/api/period/mode", token, "PUT", { mode: "month" });
    assert.equal(back.status, 200);

    const asMonth = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(asMonth.body.mode, "month");
    assert.equal(asMonth.body.status, "active");

    const reloaded = await User.findById(user._id);
    assert.equal(reloaded.savingsByMonth.get("2026-7"), 250, "month savings survived");
    assert.equal(await BudgetPeriod.countDocuments({ userId: user._id }), 1, "periods survived");

    const asDays = await call("/api/period/mode", token, "PUT", { mode: "days" });
    assert.equal(asDays.status, 200);
    const again = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(again.body.status, "active");
    assert.equal(again.body.current.days, 15);
  });

  it("rejects an unknown mode", async () => {
    const token = signToken(await makeUser());
    const res = await call("/api/period/mode", token, "PUT", { mode: "fortnight" });
    assert.equal(res.status, 400);
  });

  it("blocks the demo account from mutating anything", async () => {
    const token = signToken(await makeUser({ isDemo: true }));
    assert.equal((await call("/api/period/mode", token, "PUT", { mode: "days" })).status, 403);
    assert.equal(
      (await call("/api/period", token, "POST", { start: todayYmd(), length: 15 })).status,
      403
    );
  });
});

describe("days mode end to end", () => {
  it("budgets home and streak against the period, not the calendar month", async () => {
    const user = await makeUser();
    const token = signToken(user);
    // A 10-day period starting 3 days ago, with $300 of income in it.
    await call("/api/period", token, "POST", {
      start: shift(-3),
      length: 10,
      savingsTarget: 100,
    });
    await addTxn(user._id, shift(-3), "income", 300);
    await addTxn(user._id, shift(-2), "expense", 20);

    const home = await call(`/api/auth/home?today=${todayYmd()}`, token);
    assert.equal(home.status, 200);
    assert.equal(home.body.periodIncome, 300);
    assert.equal(home.body.periodExpenses, 20);
    assert.equal(home.body.periodSavings, 100);
    assert.equal(home.body.leftToSpend, 180, "income - spent - savings target");
    assert.equal(home.body.period.days, 10);
    assert.equal(home.body.period.daysLeft, 7);

    const streak = await call(`/api/streak?today=${todayYmd()}`, token);
    assert.equal(streak.body.periodStatus, "active");
    assert.equal(streak.body.period.days, 10);
    assert.equal(streak.body.savesLeftThisPeriod, 1, "10 days -> 1 restore");
    // $300 - $100 target - $20 already spent, spread over the 7 days left.
    assert.equal(Math.round(streak.body.today.budget * 100) / 100, 25.71);
    assert.equal(streak.body.periodDays.length, 4, "start through today");
  });

  it("excludes income from outside the period", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await call("/api/period", token, "POST", { start: shift(0), length: 5 });
    await addTxn(user._id, shift(-10), "income", 999); // before the period
    await addTxn(user._id, shift(0), "income", 500);

    const home = await call(`/api/auth/home?today=${todayYmd()}`, token);
    assert.equal(home.body.periodIncome, 500);
    // Lifetime savings still counts everything the user ever logged.
    assert.equal(home.body.totalSavings, 1499);
  });

  it("reports no budget once the period has lapsed", async () => {
    const user = await makeUser({ budgetMode: "days" });
    await BudgetPeriod.create({
      userId: user._id,
      start: shift(-20),
      end: shift(-11),
      length: 10,
    });
    await addTxn(user._id, shift(-20), "income", 400);
    const token = signToken(user);

    const home = await call(`/api/auth/home?today=${todayYmd()}`, token);
    assert.equal(home.body.status, "lapsed");
    assert.equal(home.body.period, null);
    assert.equal(home.body.leftToSpend, 0);

    const streak = await call(`/api/streak?today=${todayYmd()}`, token);
    assert.equal(streak.body.periodStatus, "inactive");
    assert.equal(streak.body.today.budget, 0);
    assert.equal(streak.body.hasIncome, false);
    assert.deepEqual(streak.body.periodDays, []);
  });

  it("lists transactions by date range", async () => {
    const user = await makeUser();
    const token = signToken(user);
    await addTxn(user._id, shift(-10), "expense", 11);
    await addTxn(user._id, shift(-2), "expense", 22);
    await addTxn(user._id, shift(0), "expense", 33);

    const res = await call(
      `/api/transactions?start=${shift(-3)}&end=${todayYmd()}`,
      token
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.map((t) => t.amount).sort(), [22, 33]);

    const bad = await call(`/api/transactions?start=${todayYmd()}&end=${shift(-5)}`, token);
    assert.equal(bad.status, 400);
  });

  it("scores the leaderboard on each person's own period", async () => {
    const me = await makeUser();
    const friend = await makeUser();
    me.friends.push(friend._id);
    await me.save();

    // Me: a 10-day period, 20% saved. Friend: still on calendar months.
    await call("/api/period", signToken(me), "POST", { start: shift(-2), length: 10 });
    await addTxn(me._id, shift(-2), "income", 100);
    await addTxn(me._id, shift(-1), "expense", 80);
    await addTxn(friend._id, shift(0), "income", 200);
    await addTxn(friend._id, shift(0), "expense", 50);

    const res = await call(`/api/friends/comparison?today=${todayYmd()}`, signToken(me));
    assert.equal(res.status, 200);
    const rows = Object.fromEntries(
      res.body.leaderboard.map((r) => [r.username, r])
    );
    assert.equal(rows[me.username].percentageSaved, 20);
    assert.equal(rows[me.username].period.days, 10);
    assert.equal(rows[friend.username].percentageSaved, 75);
  });
});

// Repeating savings targets, end to end. The unit tests in savingsCarry.test.js
// cover the rules; these cover the wiring — that opening the app is what
// materialises the month, and that a deliberate zero survives it.
const monthKeyAt = (date) => `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
const thisMonthKey = () => monthKeyAt(new Date());
const lastMonthKey = () => {
  const now = new Date();
  return monthKeyAt(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
};

describe("repeating the savings target", () => {
  it("stores a zero target instead of dropping the key", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const res = await call("/api/auth/savings", token, "PUT", {
      key: thisMonthKey(),
      amount: 0,
    });
    assert.equal(res.status, 200);
    // Deleting it here is what used to make "saving nothing" indistinguishable
    // from "not set yet", which the carry would then overwrite.
    const reloaded = await User.findById(user._id);
    assert.equal(reloaded.savingsByMonth.get(thisMonthKey()), 0);
  });

  it("turns the repeat on from the savings form and reports it back", async () => {
    const user = await makeUser();
    const token = signToken(user);
    const res = await call("/api/auth/savings", token, "PUT", {
      key: thisMonthKey(),
      amount: 200,
      repeat: true,
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.repeatSavings, true);

    const me = await call("/api/auth/me", token);
    assert.equal(me.body.repeatSavings, true);
    assert.equal(me.body.savingsByMonth[thisMonthKey()], 200);
  });

  it("rejects a non-boolean repeat flag", async () => {
    const token = signToken(await makeUser());
    const res = await call("/api/auth/savings", token, "PUT", {
      key: thisMonthKey(),
      amount: 200,
      repeat: "yes",
    });
    assert.equal(res.status, 400);
  });

  it("fills the new month the first time the app is opened", async () => {
    const user = await makeUser({
      repeatSavings: true,
      savingsByMonth: { [lastMonthKey()]: 320 },
    });
    const token = signToken(user);

    const before = await User.findById(user._id);
    assert.equal(before.savingsByMonth.has(thisMonthKey()), false);

    const res = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(res.status, 200);

    const after = await User.findById(user._id);
    assert.equal(after.savingsByMonth.get(thisMonthKey()), 320);
    assert.equal(after.savingsByMonth.get(lastMonthKey()), 320, "last month untouched");
  });

  it("feeds the carried target straight into the daily budget", async () => {
    const user = await makeUser({
      repeatSavings: true,
      savingsByMonth: { [lastMonthKey()]: 320 },
    });
    await addTxn(user._id, todayYmd(), "income", 1000);

    const res = await call(`/api/streak?today=${todayYmd()}`, signToken(user));
    assert.equal(res.status, 200);
    assert.equal(res.body.periodSavings, 320);
  });

  it("leaves a deliberate zero alone when the app is opened", async () => {
    const user = await makeUser({
      repeatSavings: true,
      savingsByMonth: { [lastMonthKey()]: 320, [thisMonthKey()]: 0 },
    });
    await call(`/api/period?today=${todayYmd()}`, signToken(user));

    const after = await User.findById(user._id);
    assert.equal(after.savingsByMonth.get(thisMonthKey()), 0);
  });

  it("does nothing for a user who hasn't asked for it", async () => {
    const user = await makeUser({ savingsByMonth: { [lastMonthKey()]: 320 } });
    await call(`/api/period?today=${todayYmd()}`, signToken(user));

    const after = await User.findById(user._id);
    assert.equal(after.savingsByMonth.has(thisMonthKey()), false);
  });

  it("never writes to a friend's account from the leaderboard", async () => {
    // getComparison resolves periods for friends' documents too. If the carry
    // lived in loadPeriodContext, reading this board would write to them.
    const friend = await makeUser({
      repeatSavings: true,
      savingsByMonth: { [lastMonthKey()]: 320 },
    });
    const me = await makeUser();
    me.friends.push(friend._id);
    await me.save();

    const res = await call(`/api/friends/comparison?today=${todayYmd()}`, signToken(me));
    assert.equal(res.status, 200);

    const after = await User.findById(friend._id);
    assert.equal(after.savingsByMonth.has(thisMonthKey()), false);
  });
});
