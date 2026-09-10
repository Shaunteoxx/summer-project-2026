// The /api/period/term endpoints, against the real Express app and an in-memory
// MongoDB. Term mode is the one where a window has money without any income row
// of its own, so the cases worth guarding are the ones where that money either
// goes missing or gets counted twice.
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
    googleId: `google-t${userSeq}`,
    username: `tuser${userSeq}`,
    email: `tuser${userSeq}@example.com`,
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
/** The 1st of the calendar month `n` months back from today. */
const monthStart = (back = 0) => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - back, 1))
    .toISOString()
    .slice(0, 10);
};

before(async () => {
  mongo = await MongoMemoryServer.create();
  Object.assign(process.env, {
    NODE_ENV: "development",
    MONGO_URI: mongo.getUri("termtest"),
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

/** A user three months into a six-month term funded with one lump sum. */
async function midTerm({ lump = 6000, months = 6, back = 2 } = {}) {
  const user = await makeUser();
  const token = signToken(user);
  const start = monthStart(back);
  const created = await call("/api/period/term", token, "POST", { start, months });
  await addTxn(user._id, start, "income", lump);
  return { user, token, start, term: created.body };
}

describe("setting up a term", () => {
  it("creates one and switches the user into term mode", async () => {
    const user = await makeUser();
    const token = signToken(user);

    const { status, body } = await call("/api/period/term", token, "POST", {
      start: monthStart(1),
      months: 6,
    });
    assert.equal(status, 201);
    assert.equal(body.months, 6);
    assert.ok(body.id);

    const fresh = await User.findById(user._id);
    assert.equal(fresh.budgetMode, "term");
  });

  it("derives the end date from the month count", async () => {
    const token = signToken(await makeUser());
    const { body } = await call("/api/period/term", token, "POST", {
      start: "2026-01-01",
      months: 6,
    });
    assert.equal(body.end, "2026-06-30");
  });

  it("refuses a length outside one to twelve months", async () => {
    const token = signToken(await makeUser());
    for (const months of [0, 13, 2.5, "six"]) {
      const { status } = await call("/api/period/term", token, "POST", {
        start: monthStart(1),
        months,
      });
      assert.equal(status, 400, `months=${months} should be rejected`);
    }
  });

  it("refuses a start date in the future", async () => {
    const token = signToken(await makeUser());
    const { status } = await call("/api/period/term", token, "POST", {
      start: shift(30),
      months: 6,
    });
    assert.equal(status, 400);
  });

  it("refuses one that overlaps a term already set up", async () => {
    const token = signToken(await makeUser());
    await call("/api/period/term", token, "POST", { start: monthStart(2), months: 6 });

    const { status, body } = await call("/api/period/term", token, "POST", {
      start: monthStart(1),
      months: 6,
    });
    assert.equal(status, 409);
    assert.match(body.message, /overlaps/);
  });

  it("is open to a demo sandbox, like any other account", async () => {
    const token = signToken(await makeUser({ isDemo: true }));
    const { status } = await call("/api/period/term", token, "POST", {
      start: monthStart(1),
      months: 6,
    });
    assert.equal(status, 201);
  });
});

describe("editing and removing a term", () => {
  it("re-derives the end date when the length changes", async () => {
    const { token, term } = await midTerm();
    const { status, body } = await call(`/api/period/term/${term.id}`, token, "PATCH", {
      months: 3,
    });
    assert.equal(status, 200);
    assert.equal(body.months, 3);
    assert.notEqual(body.end, term.end);
  });

  it("refuses a re-date that collides with another term", async () => {
    const token = signToken(await makeUser());
    await call("/api/period/term", token, "POST", { start: "2026-01-01", months: 3 });
    const second = await call("/api/period/term", token, "POST", {
      start: "2026-04-01",
      months: 3,
    });

    const { status } = await call(`/api/period/term/${second.body.id}`, token, "PATCH", {
      start: "2026-02-01",
    });
    assert.equal(status, 409);
  });

  it("keeps the transactions when the window goes", async () => {
    const { user, token, term, start } = await midTerm();
    const { status } = await call(`/api/period/term/${term.id}`, token, "DELETE");
    assert.equal(status, 200);

    assert.equal(await BudgetTerm.countDocuments({ userId: user._id }), 0);
    assert.equal(await Transaction.countDocuments({ userId: user._id }), 1);
    assert.ok(start);
  });

  it("404s on someone else's term", async () => {
    const { term } = await midTerm();
    const stranger = signToken(await makeUser());
    const { status } = await call(`/api/period/term/${term.id}`, stranger, "DELETE");
    assert.equal(status, 404);
  });
});

describe("reading a term", () => {
  it("reports the cycle running now, not the whole term", async () => {
    const { token } = await midTerm();
    const { body } = await call(`/api/period?today=${todayYmd()}`, token);

    assert.equal(body.mode, "term");
    assert.equal(body.status, "active");
    assert.equal(body.term.months, 6);
    // The window the user lives in is this calendar month.
    assert.equal(body.current.start, monthStart(0));
    assert.equal(body.current.cycle, 3);
    assert.equal(body.current.cycles, 6);
  });

  it("lists the cycles as history without mangling them", async () => {
    const { token } = await midTerm();
    const { body } = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(body.history.length, 6);
    // toPeriod would have read `length` off a cycle and returned undefined.
    assert.ok(body.history.every((c) => c.days > 0));
    assert.ok(body.history.every((c) => c.start && c.end));
  });

  it("says lapsed once the term has run out", async () => {
    const token = signToken(await makeUser());
    await call("/api/period/term", token, "POST", { start: "2026-01-01", months: 2 });
    // Ask about today, which is long past that term.
    const { body } = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(body.status, "lapsed");
    assert.equal(body.current, null);
    assert.ok(body.previous);
  });
});

describe("the money a cycle has", () => {
  it("splits a lump sum evenly across the months it covers", async () => {
    const { token } = await midTerm({ lump: 6000, months: 6, back: 0 });
    const { body } = await call(`/api/auth/home?today=${todayYmd()}`, token);
    assert.equal(body.periodFunding, 1000);
  });

  it("funds a later cycle from a lump sum logged in the first", async () => {
    const { token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    const { body } = await call(`/api/auth/home?today=${todayYmd()}`, token);

    // No income landed in this cycle at all, yet it has money. Nothing was spent
    // in the two cycles before it either, so the whole $6,000 is still there and
    // spreads over the four months that are left — underspending earlier months
    // is supposed to make the later ones bigger.
    assert.equal(body.periodIncome, 0);
    assert.equal(body.periodFunding, 1500);
    assert.equal(body.leftToSpend, 1500);
  });

  it("does not sit an empty state on top of a live budget", async () => {
    const { token } = await midTerm();
    const { body } = await call(`/api/streak?today=${todayYmd()}`, token);
    // The bug this guards: gating on income logged *this* window would tell a
    // funded user to go and add their income.
    assert.equal(body.hasIncome, true);
    assert.ok(body.period.funding > 0);
  });

  it("shrinks a later cycle after an overspend", async () => {
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    const before = await call(`/api/auth/home?today=${todayYmd()}`, token);

    // Blow the first cycle: $2,000 against a $1,000 slice.
    await addTxn(user._id, monthStart(2), "expense", 2000);
    const after = await call(`/api/auth/home?today=${todayYmd()}`, token);

    assert.ok(
      after.body.periodFunding < before.body.periodFunding,
      `${after.body.periodFunding} should be under ${before.body.periodFunding}`
    );
  });

  it("leaves a thrifty cycle better off than a spent one", async () => {
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });

    // $100 spent in the first cycle, well under its slice.
    await addTxn(user._id, monthStart(2), "expense", 100);
    const thrifty = await call(`/api/auth/home?today=${todayYmd()}`, token);

    // Now take it up to a full slice's worth and the later cycle has less.
    await addTxn(user._id, monthStart(2), "expense", 900);
    const spent = await call(`/api/auth/home?today=${todayYmd()}`, token);

    assert.ok(
      thrifty.body.periodFunding > spent.body.periodFunding,
      `${thrifty.body.periodFunding} should beat ${spent.body.periodFunding}`
    );
  });

  it("counts a mid-term top-up into the pot", async () => {
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    const before = await call(`/api/auth/home?today=${todayYmd()}`, token);

    await addTxn(user._id, monthStart(1), "income", 400);
    const after = await call(`/api/auth/home?today=${todayYmd()}`, token);
    assert.ok(after.body.periodFunding > before.body.periodFunding);
  });
});

describe("term mode and the accounts card", () => {
  it("shows the cycle's funding and still reconciles", async () => {
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    await addTxn(user._id, todayYmd(), "expense", 200);

    const { body } = await call(`/api/accounts?today=${todayYmd()}`, token);
    assert.equal(body.totals.funding, 1500);
    // Nothing came in this cycle, so what moved through the accounts is negative
    // while the budget is not — which is exactly why the card needs the row.
    assert.equal(body.totals.net, -200);
    assert.equal(body.totals.leftToSpend, 1300);

    // The identity the card rests on is untouched: funding is in no account.
    const summed =
      body.accounts.reduce((n, a) => n + a.net, 0) + (body.unassigned?.net ?? 0);
    assert.equal(summed, body.totals.net);
  });
});

describe("switching modes", () => {
  it("keeps all three modes' data through a round trip", async () => {
    const user = await makeUser();
    const token = signToken(user);

    // Month mode's savings target.
    await call("/api/auth/savings", token, "PUT", { key: "2026-0", amount: 150 });
    // A days-mode period.
    await call("/api/period", token, "POST", { start: "2026-01-01", length: 30 });
    // And a term.
    await call("/api/period/term", token, "POST", { start: "2026-03-01", months: 3 });

    for (const mode of ["month", "days", "term", "month"]) {
      const { status } = await call("/api/period/mode", token, "PUT", { mode });
      assert.equal(status, 200);
    }

    const fresh = await User.findById(user._id);
    assert.equal(fresh.budgetMode, "month");
    assert.equal(fresh.savingsByMonth.get("2026-0"), 150);
    assert.equal(await BudgetPeriod.countDocuments({ userId: user._id }), 1);
    assert.equal(await BudgetTerm.countDocuments({ userId: user._id }), 1);
  });

  it("rejects a mode it doesn't have", async () => {
    const token = signToken(await makeUser());
    const { status } = await call("/api/period/mode", token, "PUT", { mode: "yearly" });
    assert.equal(status, 400);
  });
});

describe("term mode on the leaderboard", () => {
  it("scores a term-mode friend on the money their cycle actually has", async () => {
    const me = await makeUser();
    const friend = await makeUser();
    me.friends.push(friend._id);
    await me.save();

    // The friend is in month three of a six-month allowance, with the lump sum
    // logged back in month one and $500 spent this month.
    const friendToken = signToken(friend);
    const start = monthStart(2);
    await call("/api/period/term", friendToken, "POST", { start, months: 6 });
    await addTxn(friend._id, start, "income", 6000);
    await addTxn(friend._id, todayYmd(), "expense", 500);

    // Me: plain month mode, $200 in and $50 out.
    await addTxn(me._id, todayYmd(), "income", 200);
    await addTxn(me._id, todayYmd(), "expense", 50);

    const res = await call(`/api/friends/comparison?today=${todayYmd()}`, signToken(me));
    assert.equal(res.status, 200);
    const rows = Object.fromEntries(res.body.leaderboard.map((r) => [r.username, r]));

    // Nothing was spent in the first two cycles, so the whole $6,000 spreads
    // over the four that are left: $1,500 this month, $500 of it gone.
    assert.equal(rows[friend.username].totalSaved, 1000);
    assert.equal(rows[friend.username].percentageSaved, 67);
    // Scoring on logged income would have made this 0 with -$500 saved.
    assert.equal(rows[me.username].percentageSaved, 75);
  });

  it("does not write to a term-mode friend's account from the leaderboard", async () => {
    const friend = await makeUser({ repeatSavings: true });
    const friendToken = signToken(friend);
    await call("/api/period/term", friendToken, "POST", { start: monthStart(1), months: 6 });

    const me = await makeUser();
    me.friends.push(friend._id);
    await me.save();

    const res = await call(`/api/friends/comparison?today=${todayYmd()}`, signToken(me));
    assert.equal(res.status, 200);

    const now = new Date();
    const thisMonthKey = `${now.getUTCFullYear()}-${now.getUTCMonth()}`;
    const after = await User.findById(friend._id);
    assert.equal(after.savingsByMonth.has(thisMonthKey), false);
  });
});

describe("where the whole term stands", () => {
  it("reports the term's running totals alongside the cycle's", async () => {
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    await addTxn(user._id, monthStart(2), "expense", 800);
    await addTxn(user._id, monthStart(1), "expense", 700);
    await addTxn(user._id, todayYmd(), "expense", 150);

    const { body } = await call(`/api/period?today=${todayYmd()}`, token);

    // The cycle is this month; the term is all six.
    assert.equal(body.current.start, monthStart(0));
    assert.equal(body.term.months, 6);
    assert.equal(body.term.income, 6000);
    assert.equal(body.term.spent, 1650);
    assert.equal(body.term.left, 4350);
  });

  it("counts spending later in the term, not just up to today", async () => {
    // The aggregation buckets against the cycle rather than filtering to it;
    // a row after the active cycle used to fall outside the scan entirely.
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    await addTxn(user._id, monthStart(-1), "expense", 90);

    const { body } = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(body.term.spent, 90);
    assert.equal(body.term.left, 5910);
  });

  it("leaves the totals null outside term mode", async () => {
    const token = signToken(await makeUser());
    const { body } = await call(`/api/period?today=${todayYmd()}`, token);
    assert.equal(body.term, null);
  });
});

// The tracker lists what each month of the allowance was given. Past months
// have an answer; a month still to come does not, because its share depends on
// spending that hasn't happened yet.
describe("what each cycle was given", () => {
  it("prices every month up to and including this one", async () => {
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    await addTxn(user._id, monthStart(2), "expense", 600);
    await addTxn(user._id, monthStart(1), "expense", 900);

    const { body } = await call(`/api/period?today=${todayYmd()}`, token);
    const by = Object.fromEntries(body.history.map((c) => [c.start, c.funding]));

    // $6,000 over 6 -> $1,000. Then $6,000-600 over 5 -> $1,080. Then
    // $6,000-1,500 over 4 -> $1,125: underspending twice lifted this month.
    assert.equal(by[monthStart(2)], 1000);
    assert.equal(by[monthStart(1)], 1080);
    assert.equal(by[monthStart(0)], 1125);
    assert.equal(body.current.funding, 1125);
  });

  it("leaves a month still to come unpriced", async () => {
    const { token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    const { body } = await call(`/api/period?today=${todayYmd()}`, token);

    const future = body.history.filter((c) => c.start > monthStart(0));
    assert.equal(future.length, 3);
    assert.ok(
      future.every((c) => c.funding === null),
      "a cycle after this one can't be priced yet"
    );
  });

  it("adds up: every settled month's share plus what's left equals the pot", async () => {
    const { user, token } = await midTerm({ lump: 6000, months: 6, back: 2 });
    await addTxn(user._id, monthStart(2), "expense", 1000);
    await addTxn(user._id, monthStart(1), "expense", 1000);

    const { body } = await call(`/api/period?today=${todayYmd()}`, token);
    // Spending exactly each month's share leaves the next one unchanged.
    const settled = body.history.filter((c) => c.funding !== null);
    assert.equal(settled.length, 3);
    assert.ok(settled.every((c) => c.funding === 1000));
  });
});
