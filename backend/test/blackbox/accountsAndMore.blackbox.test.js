// Black-box API tests: bank accounts, transfers, categories, repeating
// entries, friends, tours, the profile, push subscriptions and the
// notification jobs. Expectations come from ACCOUNTS_PLAN.md and the README.
import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { boot, near, CRON_SECRET } from "./_harness.js";

const NOW = "2026-03-10T04:00:00.000Z";
const TODAY = "2026-03-10";
const MARCH = "start=2026-03-01&end=2026-03-31";

let api;
before(async () => { api = await boot("bbmore", { now: NOW }); });
after(async () => { await api.stop(); });
beforeEach(() => { api.setNow(NOW); });

const me = async (token) => (await api.call("/api/auth/me", token)).body;
const addAccount = (token, name, color = "#aabbcc") => api.call("/api/auth/accounts", token, "POST", { name, color });
const accountsOf = async (token, today = TODAY) => (await api.call(`/api/accounts?today=${today}`, token)).body;
const transfer = (token, body) => api.call("/api/transfers", token, "POST", body);
const rows = async (token, range = MARCH) => (await api.call(`/api/transactions?${range}`, token)).body;

// ─────────────────────────────── accounts ────────────────────────────────

describe("bank accounts", () => {
  it("creates an account and lists it on the profile", async () => {
    const { token } = await api.makeUser();
    const r = await addAccount(token, "  DBS  ", "#AABBCC");
    assert.equal(r.status, 201);
    assert.equal(r.body.name, "DBS");
    assert.equal(r.body.archived, false);
    assert.ok(r.body.id);
    const list = (await me(token)).accounts;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, r.body.id);
  });

  it("refuses a missing, empty or over-long name", async () => {
    const { token } = await api.makeUser();
    for (const name of [undefined, "", "   ", "x".repeat(25)]) {
      const r = await api.call("/api/auth/accounts", token, "POST", { name, color: "#aabbcc" });
      assert.equal(r.status, 400, `name ${JSON.stringify(name)} → ${r.status}`);
    }
    assert.equal((await addAccount(token, "x".repeat(24))).status, 201);
  });

  it("refuses a name that is not text", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const { token } = await api.makeUser();
    for (const name of [{ $ne: "" }, ["a", "b"], 42]) {
      const r = await api.call("/api/auth/accounts", token, "POST", { name, color: "#aabbcc" });
      assert.equal(r.status, 400, `name ${JSON.stringify(name)} → ${r.status}, saved as ${JSON.stringify(r.body.name)}`);
    }
  });

  it("refuses a colour that is not six-digit hex", async () => {
    const { token } = await api.makeUser();
    for (const color of [undefined, "", "red", "#abc", "aabbcc", "#gggggg", "#aabbcc;x"]) {
      const r = await api.call("/api/auth/accounts", token, "POST", { name: "Card", color });
      assert.equal(r.status, 400, `colour ${JSON.stringify(color)} → ${r.status}`);
    }
  });

  it("refuses a duplicate name, whatever the capitalisation", async () => {
    const { token } = await api.makeUser();
    await addAccount(token, "Trust");
    assert.equal((await addAccount(token, "trust")).status, 409);
    assert.equal((await addAccount(token, " TRUST ")).status, 409);
    assert.equal((await me(token)).accounts.length, 1);
  });

  it("two users can each have an account of the same name", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    await addAccount(a.token, "DBS");
    assert.equal((await addAccount(b.token, "DBS")).status, 201);
  });

  it("allows eight live accounts and refuses a ninth", async () => {
    const { token } = await api.makeUser();
    for (let i = 1; i <= 8; i += 1) assert.equal((await addAccount(token, `Acct ${i}`)).status, 201, `account ${i}`);
    assert.equal((await addAccount(token, "Acct 9")).status, 400);
  });

  it("archiving one makes room for another", async () => {
    const { token } = await api.makeUser();
    const ids = [];
    for (let i = 1; i <= 8; i += 1) ids.push((await addAccount(token, `Acct ${i}`)).body.id);
    assert.equal((await api.call(`/api/auth/accounts/${ids[0]}`, token, "PATCH", { archived: true })).status, 200);
    assert.equal((await addAccount(token, "Acct 9")).status, 201);
  });

  it("renames, recolours and archives", async () => {
    const { token } = await api.makeUser();
    const id = (await addAccount(token, "DBS")).body.id;
    const r = await api.call(`/api/auth/accounts/${id}`, token, "PATCH", { name: "DBS Multiplier", color: "#112233" });
    assert.equal(r.status, 200);
    assert.equal(r.body.name, "DBS Multiplier");
    assert.equal(r.body.color, "#112233");
    assert.equal(r.body.archived, false);
    assert.equal((await api.call(`/api/auth/accounts/${id}`, token, "PATCH", { archived: true })).body.archived, true);
    assert.equal((await api.call(`/api/auth/accounts/${id}`, token, "PATCH", { archived: true })).body.name, "DBS Multiplier");
  });

  it("can fix the capitalisation of its own name, but not take another's", async () => {
    const { token } = await api.makeUser();
    const id = (await addAccount(token, "dbs")).body.id;
    await addAccount(token, "Trust");
    assert.equal((await api.call(`/api/auth/accounts/${id}`, token, "PATCH", { name: "DBS" })).status, 200);
    assert.equal((await api.call(`/api/auth/accounts/${id}`, token, "PATCH", { name: "trust" })).status, 409);
  });

  it("refuses bad edits", async () => {
    const { token } = await api.makeUser();
    const id = (await addAccount(token, "DBS")).body.id;
    for (const body of [{ name: "" }, { name: "x".repeat(25) }, { color: "blue" }]) {
      const r = await api.call(`/api/auth/accounts/${id}`, token, "PATCH", body);
      assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    }
  });

  it("is 404 for an account that is not yours", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    const id = (await addAccount(a.token, "DBS")).body.id;
    assert.equal((await api.call(`/api/auth/accounts/${id}`, b.token, "PATCH", { name: "Mine now" })).status, 404);
    assert.equal((await api.call(`/api/auth/accounts/${id}`, b.token, "DELETE")).status, 404);
    assert.equal((await me(a.token)).accounts[0].name, "DBS");
  });

  it("deletes an unused account", async () => {
    const { token } = await api.makeUser();
    const id = (await addAccount(token, "DBS")).body.id;
    assert.equal((await api.call(`/api/auth/accounts/${id}`, token, "DELETE")).status, 200);
    assert.deepEqual((await me(token)).accounts, []);
  });

  it("refuses to delete one with entries, pointing at archive instead", async () => {
    const { token } = await api.makeUser();
    const id = (await addAccount(token, "DBS")).body.id;
    await api.expense(token, "2026-03-05", 5, { accountId: id });
    const r = await api.call(`/api/auth/accounts/${id}`, token, "DELETE");
    assert.equal(r.status, 409);
    assert.match(r.body.message, /archive/i);
    assert.equal((await me(token)).accounts.length, 1);
  });

  it("refuses to delete one that only a transfer touches, at either end", async () => {
    const { token } = await api.makeUser();
    const a = (await addAccount(token, "A")).body.id;
    const b = (await addAccount(token, "B")).body.id;
    await transfer(token, { from: a, to: b, amount: 10, date: "2026-03-05" });
    assert.equal((await api.call(`/api/auth/accounts/${a}`, token, "DELETE")).status, 409);
    assert.equal((await api.call(`/api/auth/accounts/${b}`, token, "DELETE")).status, 409);
  });

  it("refuses to delete one that a repayment was paid into", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const { token } = await api.makeUser();
    const c = (await addAccount(token, "C")).body.id;
    const row = await api.expense(token, "2026-03-05", 20, { paidBack: 5, paidBackAccountId: c });
    assert.equal(row.body.paidBackAccountId, c);
    const r = await api.call(`/api/auth/accounts/${c}`, token, "DELETE");
    assert.equal(r.status, 409, "the account was deleted, leaving the entry pointing at nothing");
    const [left] = await rows(token);
    assert.ok((await me(token)).accounts.some((x) => x.id === left.paidBackAccountId), "entry points at an account that no longer exists");
  });
});

describe("tagging entries with an account", () => {
  let token; let live; let gone;
  before(async () => {
    ({ token } = await api.makeUser());
    live = (await addAccount(token, "Live")).body.id;
    gone = (await addAccount(token, "Gone")).body.id;
  });

  it("accepts a live account of your own", async () => {
    const r = await api.expense(token, "2026-03-05", 5, { accountId: live });
    assert.equal(r.status, 201);
    assert.equal(r.body.accountId, live);
  });

  it("refuses an unknown, malformed or someone else's account", async () => {
    const other = await api.makeUser();
    const theirs = (await addAccount(other.token, "Theirs")).body.id;
    for (const accountId of ["507f1f77bcf86cd799439011", "nope", theirs, { $ne: null }]) {
      const r = await api.expense(token, "2026-03-05", 5, { accountId });
      assert.equal(r.status, 400, `accountId ${JSON.stringify(accountId)} → ${r.status}`);
    }
  });

  it("refuses an archived account for a new entry", async () => {
    const tagged = await api.expense(token, "2026-03-05", 9, { accountId: gone, description: "tagged before archiving" });
    await api.call(`/api/auth/accounts/${gone}`, token, "PATCH", { archived: true });
    assert.equal((await api.expense(token, "2026-03-05", 5, { accountId: gone })).status, 400);

    // …but an entry already tagged to it survives an unrelated edit.
    const edit = await api.call(`/api/transactions/${tagged.body._id}`, token, "PATCH", { amount: 11 });
    assert.equal(edit.status, 200);
    assert.equal(edit.body.accountId, gone);
  });

  it("an explicit null clears the tag; leaving the key out keeps it", async () => {
    const row = (await api.expense(token, "2026-03-05", 5, { accountId: live })).body;
    const kept = await api.call(`/api/transactions/${row._id}`, token, "PATCH", { description: "renamed" });
    assert.equal(kept.body.accountId, live);
    const cleared = await api.call(`/api/transactions/${row._id}`, token, "PATCH", { accountId: null });
    assert.equal(cleared.status, 200);
    assert.equal(cleared.body.accountId, null);
  });

  it("the ledger can be filtered by account", async () => {
    const u = await api.makeUser();
    const a = (await addAccount(u.token, "A")).body.id;
    const b = (await addAccount(u.token, "B")).body.id;
    await api.expense(u.token, "2026-03-05", 1, { accountId: a, description: "from a" });
    await api.expense(u.token, "2026-03-05", 2, { accountId: b, description: "from b" });
    await api.expense(u.token, "2026-03-05", 3, { description: "untagged" });
    const r = await api.call(`/api/transactions?${MARCH}&accountId=${a}`, u.token);
    assert.deepEqual(r.body.map((t) => t.description), ["from a"]);
  });
});

describe("per-account totals", () => {
  it("with no accounts everything is unassigned and the totals still tie out", async () => {
    const { token } = await api.makeUser();
    await api.income(token, "2026-03-01", 800);
    await api.expense(token, "2026-03-03", 48);
    const a = await accountsOf(token);
    assert.deepEqual(a.accounts, []);
    assert.equal(a.unassigned.income, 800);
    assert.equal(a.unassigned.spent, 48);
    assert.equal(a.unassigned.net, 752);
    assert.equal(a.totals.net, 752);
  });

  it("splits income and spending by account", async () => {
    const { token } = await api.makeUser();
    const dbs = (await addAccount(token, "DBS")).body.id;
    const trust = (await addAccount(token, "Trust")).body.id;
    await api.income(token, "2026-03-01", 800, { accountId: dbs });
    await api.expense(token, "2026-03-03", 38, { accountId: trust });
    await api.expense(token, "2026-03-04", 4.5);
    const a = await accountsOf(token);
    const of = (id) => a.accounts.find((x) => x.id === id);
    assert.equal(of(dbs).income, 800);
    assert.equal(of(dbs).net, 800);
    assert.equal(of(trust).spent, 38);
    assert.equal(of(trust).net, -38);
    assert.equal(a.unassigned.spent, 4.5);
    assert.equal(a.unassigned.net, -4.5);
  });

  it("Σ per-account net + unassigned = income − spent, and left = net − reserved", async () => {
    const { token } = await api.makeUser();
    const dbs = (await addAccount(token, "DBS")).body.id;
    const trust = (await addAccount(token, "Trust")).body.id;
    await api.income(token, "2026-03-01", 800, { accountId: dbs });
    await api.expense(token, "2026-03-03", 38, { accountId: trust });
    await api.expense(token, "2026-03-04", 4.5);
    await api.expense(token, "2026-03-05", 40, { accountId: dbs, paidBack: 15, paidBackAccountId: trust });
    await transfer(token, { from: dbs, to: trust, amount: 50, date: "2026-03-04" });
    await api.call("/api/auth/savings", token, "PUT", { key: "2026-2", amount: 200 });
    const a = await accountsOf(token);
    const sum = a.accounts.reduce((n, x) => n + x.net, 0) + (a.unassigned?.net ?? 0);
    near(sum, a.totals.net);
    near(a.totals.net, a.totals.income - a.totals.spent);
    near(a.totals.net, 800 - 38 - 4.5 - 25);
    assert.equal(a.totals.reserved, 200);
    near(a.totals.leftToSpend, a.totals.net - 200);
  });

  it("omits the unassigned row when every entry is tagged", async () => {
    const { token } = await api.makeUser();
    const dbs = (await addAccount(token, "DBS")).body.id;
    await api.income(token, "2026-03-01", 800, { accountId: dbs });
    assert.ok(!("unassigned" in (await accountsOf(token))));
  });

  it("only counts the active period", async () => {
    const { token } = await api.makeUser();
    const dbs = (await addAccount(token, "DBS")).body.id;
    await api.income(token, "2026-02-27", 999, { accountId: dbs });
    await api.income(token, "2026-03-01", 100, { accountId: dbs });
    assert.equal((await accountsOf(token)).accounts[0].income, 100);
  });

  it("with no period running, accounts are listed with zeroed totals", async () => {
    const { token } = await api.makeUser();
    await addAccount(token, "DBS");
    await api.call("/api/period/mode", token, "PUT", { mode: "days" });
    const a = await accountsOf(token);
    assert.equal(a.period, null);
    assert.equal(a.accounts.length, 1);
    assert.equal(a.accounts[0].net, 0);
    assert.equal(a.totals.net, 0);
  });
});

// ─────────────────────────────── transfers ───────────────────────────────

describe("transfers between your own accounts", () => {
  let token; let a; let b;
  beforeEach(async () => {
    ({ token } = await api.makeUser());
    a = (await addAccount(token, "A")).body.id;
    b = (await addAccount(token, "B")).body.id;
    await api.income(token, "2026-03-01", 900, { accountId: a });
    await api.expense(token, "2026-03-05", 90, { accountId: a });
  });

  it("moves money from one to the other", async () => {
    const r = await transfer(token, { from: a, to: b, amount: 50.005, date: "2026-03-04" });
    assert.equal(r.status, 201);
    assert.equal(r.body.amount, 50.01);
    assert.equal(r.body.date, "2026-03-04T00:00:00.000Z");
    const t = await accountsOf(token);
    const of = (id) => t.accounts.find((x) => x.id === id);
    assert.equal(of(a).transfersOut, 50.01);
    assert.equal(of(b).transfersIn, 50.01);
    near(of(a).net, 900 - 90 - 50.01);
    near(of(b).net, 50.01);
  });

  it("never touches the budget: streak and home are identical before and after", async () => {
    const before = await Promise.all([api.call(`/api/streak?today=${TODAY}`, token), api.call(`/api/auth/home?today=${TODAY}`, token)]);
    await transfer(token, { from: a, to: b, amount: 500, date: "2026-03-04" });
    await transfer(token, { from: b, to: a, amount: 20, date: TODAY });
    const after = await Promise.all([api.call(`/api/streak?today=${TODAY}`, token), api.call(`/api/auth/home?today=${TODAY}`, token)]);
    assert.deepEqual(after[0].body, before[0].body);
    assert.deepEqual(after[1].body, before[1].body);
  });

  it("never shows up as a transaction or in the monthly history", async () => {
    const historyBefore = (await api.call("/api/summary/all", token)).body;
    await transfer(token, { from: a, to: b, amount: 500, date: "2026-03-04" });
    assert.equal((await rows(token)).length, 2);
    assert.deepEqual((await api.call("/api/summary/all", token)).body, historyBefore);
  });

  it("cancels out across accounts: the total is unchanged", async () => {
    const before = (await accountsOf(token)).totals;
    await transfer(token, { from: a, to: b, amount: 333.33, date: "2026-03-04" });
    assert.deepEqual((await accountsOf(token)).totals, before);
  });

  it("refuses a transfer to the same account", async () => {
    assert.equal((await transfer(token, { from: a, to: a, amount: 5, date: TODAY })).status, 400);
  });

  it("refuses unknown, archived, malformed and other people's accounts", async () => {
    const other = await api.makeUser();
    const theirs = (await addAccount(other.token, "Theirs")).body.id;
    const old = (await addAccount(token, "Old")).body.id;
    await api.call(`/api/auth/accounts/${old}`, token, "PATCH", { archived: true });
    for (const bad of ["507f1f77bcf86cd799439011", "nope", theirs, old, null, undefined, { $ne: null }]) {
      assert.equal((await transfer(token, { from: bad, to: b, amount: 5, date: TODAY })).status, 400, `from ${JSON.stringify(bad)}`);
      assert.equal((await transfer(token, { from: a, to: bad, amount: 5, date: TODAY })).status, 400, `to ${JSON.stringify(bad)}`);
    }
  });

  it("refuses a bad amount or date", async () => {
    for (const amount of [0, -5, 1e9 + 1, "abc", null]) {
      assert.equal((await transfer(token, { from: a, to: b, amount, date: TODAY })).status, 400, `amount ${JSON.stringify(amount)}`);
    }
    for (const date of ["2026-03-12", "junk", "2026-02-30"]) {
      assert.equal((await transfer(token, { from: a, to: b, amount: 5, date })).status, 400, `date ${date}`);
    }
  });

  it("lists transfers in a date range, both ends included", async () => {
    await transfer(token, { from: a, to: b, amount: 1, date: "2026-02-28" });
    await transfer(token, { from: a, to: b, amount: 2, date: "2026-03-01" });
    await transfer(token, { from: a, to: b, amount: 3, date: "2026-03-10" });
    const r = await api.call("/api/transfers?start=2026-03-01&end=2026-03-10", token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((t) => t.amount).sort(), [2, 3]);
    assert.equal((await api.call("/api/transfers?start=junk&end=2026-03-10", token)).status, 400);
  });

  it("can be deleted, by its owner only", async () => {
    const other = await api.makeUser();
    const id = (await transfer(token, { from: a, to: b, amount: 5, date: TODAY })).body._id;
    assert.equal((await api.call(`/api/transfers/${id}`, other.token, "DELETE")).status, 404);
    assert.equal((await api.call(`/api/transfers/${id}`, token, "DELETE")).status, 200);
    assert.deepEqual((await api.call(`/api/transfers?${MARCH}`, token)).body, []);
    assert.equal((await api.call(`/api/transfers/${id}`, token, "DELETE")).status, 404);
  });

  it("is removed along with the account's owner", async () => {
    await transfer(token, { from: a, to: b, amount: 5, date: TODAY });
    const id = (await me(token)).id;
    await api.call("/api/auth/me", token, "DELETE");
    assert.equal(await api.models.Transfer.countDocuments({ userId: id }), 0);
  });
});

// ─────────────────────────────── categories ──────────────────────────────

describe("custom categories", () => {
  const addCat = (token, body) => api.call("/api/auth/categories", token, "POST", { color: "#aabbcc", type: "expense", ...body });

  it("creates one and lists it on the profile", async () => {
    const { token } = await api.makeUser();
    const r = await addCat(token, { name: "  Pets  " });
    assert.equal(r.status, 201);
    assert.equal(r.body.name, "Pets");
    assert.equal(r.body.type, "expense");
    assert.equal((await me(token)).customCategories.length, 1);
  });

  it("refuses a name that clashes with a built-in or an existing one", async () => {
    const { token } = await api.makeUser();
    await addCat(token, { name: "Pets" });
    for (const name of ["Pets", "pets", "Transport", "transport", "F & B"]) {
      const r = await addCat(token, { name });
      assert.equal(r.status, 409, `${name} → ${r.status}`);
    }
  });

  it("refuses bad names, types and colours", async () => {
    const { token } = await api.makeUser();
    for (const body of [{ name: "" }, { name: "   " }, { name: "x".repeat(41) }, { name: "Ok", type: "transfer" }, { name: "Ok", color: "red" }, { name: undefined }]) {
      const r = await addCat(token, body);
      assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    }
    assert.deepEqual((await me(token)).customCategories, []);
  });

  it("refuses a name that is not text", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const { token } = await api.makeUser();
    for (const name of [{ $ne: "" }, ["a", "b"]]) {
      const r = await addCat(token, { name });
      assert.equal(r.status, 400, `name ${JSON.stringify(name)} → ${r.status}, saved as ${JSON.stringify(r.body.name)}`);
    }
  });

  it("deleting one keeps the entries already filed under it", async () => {
    const { token } = await api.makeUser();
    const id = (await addCat(token, { name: "Pets" })).body.id;
    await api.expense(token, "2026-03-05", 12, { category: "Pets" });
    assert.equal((await api.call(`/api/auth/categories/${id}`, token, "DELETE")).status, 200);
    assert.deepEqual((await me(token)).customCategories, []);
    assert.equal((await rows(token))[0].category, "Pets");
    assert.equal((await api.expense(token, "2026-03-05", 12, { category: "Pets" })).status, 400);
  });

  it("an entry under a deleted category can still be edited", async () => {
    const { token } = await api.makeUser();
    const id = (await addCat(token, { name: "Pets" })).body.id;
    const row = (await api.expense(token, "2026-03-05", 12, { category: "Pets" })).body;
    await api.call(`/api/auth/categories/${id}`, token, "DELETE");
    const r = await api.call(`/api/transactions/${row._id}`, token, "PATCH", { amount: 13 });
    assert.equal(r.status, 200);
    assert.equal(r.body.category, "Pets");
  });

  it("cannot delete someone else's, or one that does not exist", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    const id = (await addCat(a.token, { name: "Pets" })).body.id;
    await api.call(`/api/auth/categories/${id}`, b.token, "DELETE");
    assert.equal((await me(a.token)).customCategories.length, 1);
    const bad = await api.call("/api/auth/categories/not-an-id", a.token, "DELETE");
    assert.ok(bad.status < 500, `got ${bad.status}`);
  });
});

// ──────────────────────────── repeating entries ──────────────────────────

describe("repeating entries", () => {
  const rule = (token, body = {}) =>
    api.call("/api/auth/recurring", token, "POST", {
      description: "Rent", amount: 500, type: "expense", category: "Shopping",
      frequency: "monthly", dayOfMonth: 15, startKey: TODAY, ...body,
    });
  const generated = async (token, range = "start=2026-01-01&end=2026-12-31") =>
    (await rows(token, range)).filter((t) => t.recurringId).map((t) => t.date.slice(0, 10)).sort();
  const at = (iso, user) => { api.setNow(iso); return api.signToken(user); };

  it("creates a rule and lists it on the profile", async () => {
    const { token } = await api.makeUser();
    const r = await rule(token);
    assert.equal(r.status, 201);
    assert.equal(r.body.frequency, "monthly");
    assert.equal(r.body.dayOfMonth, 15);
    assert.equal(r.body.startKey, TODAY);
    assert.equal(r.body.paused, false);
    assert.equal((await me(token)).recurring.length, 1);
  });

  it("can only start today or later; yesterday is treated as timezone skew", async () => {
    const { token } = await api.makeUser();
    assert.equal((await rule(token, { startKey: "2026-03-01" })).status, 400);
    assert.equal((await rule(token, { startKey: "2026-03-08" })).status, 400);
    const skew = await rule(token, { startKey: "2026-03-09" });
    assert.equal(skew.status, 201);
    assert.equal(skew.body.startKey, TODAY);
    assert.equal((await rule(token, { startKey: "2026-04-01", description: "Later" })).status, 201);
  });

  it("validates the schedule and the entry it will write", async () => {
    const { token } = await api.makeUser();
    const bad = [
      { dayOfMonth: undefined }, { dayOfMonth: 0 }, { dayOfMonth: 32 }, { dayOfMonth: 1.5 },
      { frequency: "weekly", dayOfMonth: undefined, weekday: undefined }, { frequency: "weekly", weekday: 7 }, { frequency: "weekly", weekday: -1 },
      { frequency: "daily" }, { amount: 0 }, { amount: -5 }, { amount: 1e10 },
      { type: "transfer" }, { category: "Allowance" }, { category: "Nope" },
      { description: "" }, { description: "x".repeat(121) }, { startKey: "junk" }, { startKey: "2026-02-30" },
    ];
    for (const body of bad) {
      const r = await rule(token, body);
      assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    }
    assert.deepEqual((await me(token)).recurring, []);
  });

  it("writes nothing before its first due date", async () => {
    const { token } = await api.makeUser();
    await rule(token);
    assert.deepEqual(await generated(token), []);
  });

  it("writes a real entry on the due date, once", async () => {
    const { user, token } = await api.makeUser();
    const id = (await rule(token)).body.id;
    const t = at("2026-03-15T04:00:00.000Z", user);
    const first = await rows(t);
    const again = await rows(t);
    assert.equal(first.length, 1);
    assert.equal(again.length, 1);
    assert.equal(first[0].date, "2026-03-15T00:00:00.000Z");
    assert.equal(first[0].amount, 500);
    assert.equal(first[0].description, "Rent");
    assert.equal(first[0].category, "Shopping");
    assert.equal(first[0].type, "expense");
    assert.equal(first[0].recurringId, id);
    assert.equal(first[0].month, 2);
  });

  it("a rule starting on its own due day writes that day's entry", async () => {
    const { token } = await api.makeUser();
    await rule(token, { dayOfMonth: 10 });
    assert.deepEqual(await generated(token), ["2026-03-10"]);
  });

  // Whatever the user opens first on a due day has to already include the
  // entry, or the page shows a budget the next page contradicts.
  for (const [name, path, read] of [
    ["the homepage", "/api/auth/home", (b) => b.periodExpenses],
    ["the streak", "/api/streak", (b) => b.today.spent],
    ["the accounts card", "/api/accounts", (b) => b.totals.spent],
  ]) {
    it(`${name}'s first answer on a due day already counts the entry`, async () => {
      const { user, token } = await api.makeUser();
      await api.income(token, "2026-03-01", 3000);
      await rule(token);
      const t = at("2026-03-15T04:00:00.000Z", user);
      const r = await api.call(`${path}?today=2026-03-15`, t);
      assert.equal(read(r.body), 500, `${path} had not counted the repeating entry`);
    });
  }

  it("two requests racing on app open write the entry once", async () => {
    const { user, token } = await api.makeUser();
    await rule(token);
    const t = at("2026-03-15T04:00:00.000Z", user);
    await Promise.all([rows(t), rows(t), api.call("/api/auth/home?today=2026-03-15", t), api.call("/api/streak?today=2026-03-15", t), api.call("/api/auth/me", t)]);
    assert.deepEqual(await generated(t), ["2026-03-15"]);
  });

  it("catches up on every occurrence missed while away", async () => {
    const { user, token } = await api.makeUser();
    await rule(token);
    const t = at("2026-06-20T04:00:00.000Z", user);
    assert.deepEqual(await generated(t), ["2026-03-15", "2026-04-15", "2026-05-15", "2026-06-15"]);
  });

  it("a rule on the 31st uses the last day of shorter months", async () => {
    const { user } = await api.makeUser();
    const jan = at("2026-01-31T04:00:00.000Z", user);
    await rule(jan, { dayOfMonth: 31, startKey: "2026-01-31" });
    const t = at("2026-04-30T04:00:00.000Z", user);
    assert.deepEqual(await generated(t), ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("a rule on the 1st fires on the 1st of the next month", async () => {
    const { user, token } = await api.makeUser();
    await rule(token, { dayOfMonth: 1 });
    const t = at("2026-04-01T04:00:00.000Z", user);
    assert.deepEqual(await generated(t), ["2026-04-01"]);
    const h = (await api.call("/api/auth/home?today=2026-04-01", t)).body;
    assert.equal(h.period.start, "2026-04-01");
    assert.equal(h.periodExpenses, 500);
  });

  it("weekly rules fire on their weekday", async () => {
    const { user, token } = await api.makeUser(); // 10 March 2026 is a Tuesday
    await rule(token, { frequency: "weekly", weekday: 5, dayOfMonth: undefined, description: "Friday treat", amount: 8 });
    const t = at("2026-03-28T04:00:00.000Z", user);
    assert.deepEqual(await generated(t), ["2026-03-13", "2026-03-20", "2026-03-27"]);
  });

  it("income rules write income", async () => {
    const { user, token } = await api.makeUser();
    await rule(token, { type: "income", category: "Allowance", description: "Allowance", amount: 600 });
    const t = at("2026-03-15T04:00:00.000Z", user);
    const [row] = await rows(t);
    assert.equal(row.type, "income");
    assert.equal((await api.call("/api/auth/home?today=2026-03-15", t)).body.periodIncome, 600);
  });

  it("a deleted occurrence stays deleted", async () => {
    const { user, token } = await api.makeUser();
    await rule(token);
    const t = at("2026-03-15T04:00:00.000Z", user);
    const [row] = await rows(t);
    await api.call(`/api/transactions/${row._id}`, t, "DELETE");
    assert.deepEqual(await rows(t), []);
    const next = at("2026-03-16T04:00:00.000Z", user);
    assert.deepEqual(await generated(next), []);
  });

  it("correcting an occurrence's date does not make room for a duplicate", async () => {
    const { user, token } = await api.makeUser();
    await rule(token);
    const t = at("2026-03-15T04:00:00.000Z", user);
    const [row] = await rows(t);
    await api.call(`/api/transactions/${row._id}`, t, "PATCH", { date: "2026-03-14" });
    const next = at("2026-03-16T04:00:00.000Z", user);
    assert.deepEqual(await generated(next), ["2026-03-14"]);
  });

  it("pausing writes nothing, and resuming does not replay the gap", async () => {
    const { user, token } = await api.makeUser();
    const id = (await rule(token)).body.id;
    assert.equal((await api.call(`/api/auth/recurring/${id}`, token, "PATCH", { paused: true })).body.paused, true);
    const during = at("2026-04-20T04:00:00.000Z", user);
    assert.deepEqual(await generated(during), []);
    assert.equal((await api.call(`/api/auth/recurring/${id}`, during, "PATCH", { paused: false })).body.paused, false);
    assert.deepEqual(await generated(during), [], "resuming replayed occurrences from the pause");
    const later = at("2026-05-15T04:00:00.000Z", user);
    assert.deepEqual(await generated(later), ["2026-05-15"]);
  });

  it("editing a rule changes future entries and leaves written ones alone", async () => {
    const { user, token } = await api.makeUser();
    const id = (await rule(token)).body.id;
    const mar = at("2026-03-15T04:00:00.000Z", user);
    await rows(mar);
    assert.equal((await api.call(`/api/auth/recurring/${id}`, mar, "PATCH", { amount: 550 })).status, 200);
    const apr = at("2026-04-15T04:00:00.000Z", user);
    const all = (await rows(apr, "start=2026-03-01&end=2026-04-30")).sort((x, y) => x.date.localeCompare(y.date));
    assert.deepEqual(all.map((t) => t.amount), [500, 550]);
  });

  it("stopping a rule keeps the entries it already wrote", async () => {
    const { user, token } = await api.makeUser();
    const id = (await rule(token)).body.id;
    const mar = at("2026-03-15T04:00:00.000Z", user);
    await rows(mar);
    assert.equal((await api.call(`/api/auth/recurring/${id}`, mar, "DELETE")).status, 200);
    const apr = at("2026-04-20T04:00:00.000Z", user);
    assert.deepEqual(await generated(apr), ["2026-03-15"]);
    assert.deepEqual((await me(apr)).recurring, []);
  });

  it("one user's rules write nothing into another's ledger", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    await rule(a.token);
    const t = at("2026-03-15T04:00:00.000Z", b.user);
    assert.deepEqual(await rows(t), []);
    assert.equal((await api.call(`/api/auth/recurring/${(await me(at("2026-03-15T04:00:00.000Z", a.user))).recurring[0].id}`, t, "DELETE")).status, 404);
  });

  it("a written entry is ordinary: it counts in the budget and can be edited", async () => {
    const { user, token } = await api.makeUser();
    await api.income(token, "2026-03-01", 3000);
    await rule(token);
    const t = at("2026-03-15T04:00:00.000Z", user);
    const [row] = (await rows(t)).filter((x) => x.recurringId);
    const edited = await api.call(`/api/transactions/${row._id}`, t, "PATCH", { amount: 480 });
    assert.equal(edited.status, 200);
    assert.equal((await api.call("/api/auth/home?today=2026-03-15", t)).body.periodExpenses, 480);
  });
});

// ──────────────────────────────── friends ────────────────────────────────

describe("friends", () => {
  const befriend = async (a, b) => {
    assert.equal((await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {})).status, 200);
    assert.equal((await api.call(`/api/friends/accept/${a.id}`, b.token, "POST", {})).status, 200);
  };

  it("search finds users by part of their name, ignoring case, never yourself", async () => {
    const a = await api.makeUser({ username: "Quokka_Alpha" });
    const b = await api.makeUser({ username: "quokka_beta" });
    const r = await api.call("/api/friends/search?q=QUOKKA", a.token);
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.map((u) => u.username), ["quokka_beta"]);
    assert.equal(r.body[0].id, b.id);
  });

  it("search results carry no email or other private fields", async () => {
    const a = await api.makeUser({ username: "Wombat_One" });
    await api.makeUser({ username: "wombat_two" });
    const r = await api.call("/api/friends/search?q=wombat", a.token);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes("@example.com"), "email leaked");
    assert.ok(!text.includes("google-"), "googleId leaked");
    assert.ok(!("savingsByMonth" in r.body[0]));
  });

  it("search treats regex characters as plain text", async () => {
    const a = await api.makeUser();
    await api.makeUser({ username: "plain_name" });
    for (const q of [".*", "^", "(", "[a-z]+", "\\", "$", "a|b"]) {
      const r = await api.call(`/api/friends/search?q=${encodeURIComponent(q)}`, a.token);
      assert.equal(r.status, 200, `q=${q} → ${r.status}`);
      assert.deepEqual(r.body, [], `q=${q} matched ${r.body.length} users`);
    }
  });

  it("an empty search returns nobody rather than everybody", async () => {
    const a = await api.makeUser();
    for (const q of ["", "   "]) {
      const r = await api.call(`/api/friends/search?q=${encodeURIComponent(q)}`, a.token);
      assert.ok(r.status === 400 || (r.status === 200 && r.body.length === 0), `q="${q}" → ${r.status} with ${r.body.length} rows`);
    }
    const none = await api.call("/api/friends/search", a.token);
    assert.ok(none.status === 400 || (none.status === 200 && none.body.length === 0));
  });

  it("an enormous query is capped rather than run", async () => {
    const a = await api.makeUser();
    const r = await api.call(`/api/friends/search?q=${"a".repeat(5000)}`, a.token);
    assert.ok(r.status < 500, `got ${r.status}`);
  });

  it("a query sent as an object or a list is refused, not a server error", { todo: "known bug, see BLACKBOX_FINDINGS.md" }, async () => {
    const a = await api.makeUser();
    for (const qs of ["q[$ne]=x", "q=a&q=b", "q[]=a"]) {
      const r = await api.call(`/api/friends/search?${qs}`, a.token);
      assert.ok(r.status < 500, `?${qs} → ${r.status}`);
    }
  });

  it("a request shows up for the other person, who can accept it", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    assert.equal((await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {})).status, 200);
    const pending = (await api.call("/api/friends/requests", b.token)).body;
    assert.deepEqual(pending.map((u) => u.id), [a.id]);
    assert.deepEqual((await api.call("/api/friends/requests", a.token)).body, []);

    assert.equal((await api.call(`/api/friends/accept/${a.id}`, b.token, "POST", {})).status, 200);
    assert.deepEqual((await api.call("/api/friends", a.token)).body.map((u) => u.id), [b.id]);
    assert.deepEqual((await api.call("/api/friends", b.token)).body.map((u) => u.id), [a.id]);
    assert.deepEqual((await api.call("/api/friends/requests", b.token)).body, []);
  });

  it("declining removes the request and makes no friendship", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {});
    assert.equal((await api.call(`/api/friends/decline/${a.id}`, b.token, "POST", {})).status, 200);
    assert.deepEqual((await api.call("/api/friends/requests", b.token)).body, []);
    assert.deepEqual((await api.call("/api/friends", a.token)).body, []);
    assert.deepEqual((await api.call("/api/friends", b.token)).body, []);
  });

  it("refuses to request yourself, twice, a stranger id, or an existing friend", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    assert.equal((await api.call(`/api/friends/request/${a.id}`, a.token, "POST", {})).status, 400);
    assert.equal((await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {})).status, 200);
    assert.equal((await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {})).status, 400);
    assert.equal((await api.call("/api/friends/requests", b.token)).body.length, 1);
    const unknown = await api.call("/api/friends/request/507f1f77bcf86cd799439011", a.token, "POST", {});
    assert.ok([400, 404].includes(unknown.status));
    const bad = await api.call("/api/friends/request/not-an-id", a.token, "POST", {});
    assert.ok([400, 404].includes(bad.status), `got ${bad.status}`);
    await api.call(`/api/friends/accept/${a.id}`, b.token, "POST", {});
    assert.equal((await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {})).status, 400);
    assert.equal((await api.call(`/api/friends/request/${a.id}`, b.token, "POST", {})).status, 400);
  });

  it("you cannot accept a request nobody sent", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    const r = await api.call(`/api/friends/accept/${a.id}`, b.token, "POST", {});
    assert.ok([400, 404].includes(r.status), `got ${r.status}`);
    assert.deepEqual((await api.call("/api/friends", a.token)).body, []);
    assert.deepEqual((await api.call("/api/friends", b.token)).body, []);
  });

  it("you cannot accept your own outgoing request on the other person's behalf", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    await api.call(`/api/friends/request/${b.id}`, a.token, "POST", {});
    await api.call(`/api/friends/accept/${b.id}`, a.token, "POST", {});
    assert.deepEqual((await api.call("/api/friends", b.token)).body, []);
  });

  it("the leaderboard is you and your friends, scored on finished windows", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    const stranger = await api.makeUser();
    await befriend(a, b);
    await api.income(a.token, "2026-02-01", 1000);
    await api.expense(a.token, "2026-02-10", 250);
    await api.income(b.token, "2026-02-01", 1000);
    await api.expense(b.token, "2026-02-10", 600);
    await api.income(stranger.token, "2026-02-01", 1000);
    await api.income(a.token, "2026-03-01", 99999); // the running month must not count
    const r = await api.call(`/api/friends/comparison?today=${TODAY}`, a.token);
    assert.equal(r.status, 200);
    const board = r.body.leaderboard;
    assert.equal(board.length, 2);
    const mine = board.find((x) => x.isMe);
    const theirs = board.find((x) => !x.isMe);
    assert.equal(mine.id, a.id);
    assert.equal(mine.percentageSaved, 75);
    assert.equal(mine.totalSaved, 750);
    assert.equal(theirs.id, b.id);
    assert.equal(theirs.percentageSaved, 40);
    assert.deepEqual(board.map((x) => x.percentageSaved), [75, 40]);
    const text = JSON.stringify(r.body);
    assert.ok(!text.includes("@example.com"), "email leaked");
  });
});

// ───────────────────────── profile, tours, push ──────────────────────────

describe("profile", () => {
  const patch = (token, body) => api.call("/api/auth/profile", token, "PATCH", body);

  it("changes the display name and avatar", async () => {
    const { token } = await api.makeUser();
    const r = await patch(token, { username: "New_Name1", avatar: "panda" });
    assert.equal(r.status, 200);
    assert.equal(r.body.username, "New_Name1");
    assert.equal(r.body.avatar, "panda");
    assert.equal((await me(token)).username, "New_Name1");
  });

  it("a partial update leaves the rest alone", async () => {
    const { token } = await api.makeUser();
    await patch(token, { username: "Keeper", avatar: "panda" });
    await patch(token, { timezone: "Asia/Singapore" });
    const profile = await me(token);
    assert.equal(profile.username, "Keeper");
    assert.equal(profile.avatar, "panda");
    assert.equal(profile.timezone, "Asia/Singapore");
  });

  it("refuses an empty or over-long name, an unknown avatar and a fake timezone", async () => {
    const { token, user } = await api.makeUser();
    // A name is 3–20 letters, numbers or underscores.
    for (const body of [{ username: "" }, { username: "   " }, { username: "ab" }, { username: "x".repeat(21) }, { username: "has space" }, { username: "semi;colon" }, { username: "<b>bold</b>" }, { username: { $ne: "" } }, { avatar: "../../etc/passwd" }, { avatar: "not-an-animal" }, { timezone: "Mars/Phobos" }]) {
      const r = await patch(token, body);
      assert.equal(r.status, 400, `${JSON.stringify(body)} → ${r.status}`);
    }
    assert.equal((await me(token)).username, user.username);
  });

  it("refuses a name someone else has, whatever the capitalisation", async () => {
    const a = await api.makeUser({ username: "Taken_Name" });
    const b = await api.makeUser();
    assert.equal((await patch(b.token, { username: "taken_name" })).status, 409);
    assert.equal((await patch(a.token, { username: "TAKEN_NAME" })).status, 200);
  });

  it("cannot be used to grant yourself fields the form does not offer", async () => {
    const { token } = await api.makeUser();
    await patch(token, { username: "Sneaky", isDemo: true, tokenVersion: 99, email: "evil@example.com", budgetMode: "term", friends: ["507f1f77bcf86cd799439011"] });
    const profile = await me(token);
    assert.equal(profile.isDemo, false);
    assert.notEqual(profile.email, "evil@example.com");
    assert.equal(profile.budgetMode, "month");
    assert.deepEqual(profile.friends, []);
  });
});

describe("tours seen-state", () => {
  const mark = (token, ids) => api.call("/api/auth/tours", token, "POST", { ids });
  const forget = (token, ids) => api.call("/api/auth/tours/forget", token, "POST", { ids });

  it("remembers tours on the account, without duplicates", async () => {
    const { token } = await api.makeUser();
    assert.deepEqual((await mark(token, ["home@1"])).body.tours, ["home@1"]);
    assert.deepEqual((await mark(token, ["home@1", "tracker@1"])).body.tours.sort(), ["home@1", "tracker@1"]);
    assert.deepEqual((await me(token)).tours.sort(), ["home@1", "tracker@1"]);
  });

  it("forgets only the ones asked for", async () => {
    const { token } = await api.makeUser();
    await mark(token, ["home@1", "tracker@1", "plan@1"]);
    assert.deepEqual((await forget(token, ["tracker@1"])).body.tours.sort(), ["home@1", "plan@1"]);
    assert.deepEqual((await forget(token, ["never-seen@1"])).body.tours.sort(), ["home@1", "plan@1"]);
  });

  it("refuses anything that is not a short list of short strings", async () => {
    const { token } = await api.makeUser();
    for (const ids of ["home@1", null, undefined, [1, 2], [{ $ne: null }], ["x".repeat(500)], Array.from({ length: 500 }, (_, i) => `t${i}@1`)]) {
      const r = await mark(token, ids);
      assert.equal(r.status, 400, `${JSON.stringify(ids)?.slice(0, 40)} → ${r.status}`);
    }
    assert.deepEqual((await me(token)).tours, []);
  });

  it("is each account's own", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    await mark(a.token, ["home@1"]);
    assert.deepEqual((await me(b.token)).tours, []);
  });
});

describe("push subscriptions", () => {
  const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
  let n = 0;
  const endpoint = () => { n += 1; return `https://push.example.com/device-${n}`; };
  const subscribe = (token, body) => api.call("/api/push/subscription", token, "POST", { keys: KEYS, timezone: "Asia/Singapore", types: { dailyReminder: true, morningBudget: true }, ...body });
  const lookup = (token, ep) => api.call(`/api/push/subscription?endpoint=${encodeURIComponent(ep)}`, token);

  it("hands out the public key", async () => {
    const { token } = await api.makeUser();
    const r = await api.call("/api/push/key", token);
    assert.equal(r.status, 200);
    assert.ok(typeof r.body.publicKey === "string" && r.body.publicKey.length > 20);
    assert.ok(!JSON.stringify(r.body).toLowerCase().includes("private"));
  });

  it("saves a device with its choices and the user's timezone", async () => {
    const { token } = await api.makeUser();
    const ep = endpoint();
    const r = await subscribe(token, { endpoint: ep, types: { dailyReminder: true, morningBudget: false } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.types, { dailyReminder: true, morningBudget: false });
    assert.equal((await me(token)).timezone, "Asia/Singapore");
    const got = await lookup(token, ep);
    assert.equal(got.status, 200);
    assert.deepEqual(got.body.types, { dailyReminder: true, morningBudget: false });
  });

  it("choices are per device", async () => {
    const { token } = await api.makeUser();
    const phone = endpoint(); const laptop = endpoint();
    await subscribe(token, { endpoint: phone, types: { dailyReminder: true, morningBudget: true } });
    await subscribe(token, { endpoint: laptop, types: { dailyReminder: false, morningBudget: false } });
    assert.deepEqual((await lookup(token, phone)).body.types, { dailyReminder: true, morningBudget: true });
    assert.deepEqual((await lookup(token, laptop)).body.types, { dailyReminder: false, morningBudget: false });
  });

  it("re-subscribing the same device updates it instead of duplicating it", async () => {
    const { token, id } = await api.makeUser();
    const ep = endpoint();
    await subscribe(token, { endpoint: ep });
    await subscribe(token, { endpoint: ep, types: { dailyReminder: false, morningBudget: true } });
    assert.equal(await api.models.PushSubscription.countDocuments({ userId: id }), 1);
    assert.deepEqual((await lookup(token, ep)).body.types, { dailyReminder: false, morningBudget: true });
  });

  it("refuses an endpoint that is not an https URL, missing keys and a fake timezone", async () => {
    const { token, id } = await api.makeUser();
    for (const body of [
      { endpoint: "" }, { endpoint: "not a url" }, { endpoint: "http://insecure.example.com/x" }, { endpoint: "javascript:alert(1)" }, { endpoint: { $ne: null } },
      { endpoint: endpoint(), keys: {} }, { endpoint: endpoint(), keys: { p256dh: "x" } }, { endpoint: endpoint(), keys: null },
      { endpoint: endpoint(), timezone: "Mars/Phobos" },
    ]) {
      const r = await subscribe(token, body);
      assert.equal(r.status, 400, `${JSON.stringify(body).slice(0, 70)} → ${r.status}`);
    }
    assert.equal(await api.models.PushSubscription.countDocuments({ userId: id }), 0);
  });

  it("one user cannot see or remove another's device", async () => {
    const a = await api.makeUser();
    const b = await api.makeUser();
    const ep = endpoint();
    await subscribe(a.token, { endpoint: ep });
    assert.equal((await lookup(b.token, ep)).status, 404);
    await api.call("/api/push/unsubscribe", b.token, "POST", { endpoint: ep });
    assert.equal((await lookup(a.token, ep)).status, 200);
  });

  it("unsubscribing forgets the device", async () => {
    const { token } = await api.makeUser();
    const ep = endpoint();
    await subscribe(token, { endpoint: ep });
    assert.equal((await api.call("/api/push/unsubscribe", token, "POST", { endpoint: ep })).status, 200);
    assert.equal((await lookup(token, ep)).status, 404);
  });

  it("signing out forgets every device, and deleting the account does too", async () => {
    const a = await api.makeUser();
    await subscribe(a.token, { endpoint: endpoint() });
    await subscribe(a.token, { endpoint: endpoint() });
    await api.call("/api/auth/logout", a.token, "POST");
    assert.equal(await api.models.PushSubscription.countDocuments({ userId: a.id }), 0);
    const b = await api.makeUser();
    await subscribe(b.token, { endpoint: endpoint() });
    await api.call("/api/auth/me", b.token, "DELETE");
    assert.equal(await api.models.PushSubscription.countDocuments({ userId: b.id }), 0);
  });
});

// ─────────────────────────── notification jobs ───────────────────────────

describe("notification jobs", () => {
  const KEYS = { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" };
  let morning; let evening; let message; let n = 0;
  before(async () => {
    ({ runMorningBudget: morning, morningBudgetMessage: message } = await import("../../jobs/morningBudget.js"));
    ({ runDailyReminders: evening } = await import("../../jobs/dailyReminder.js"));
  });
  // 8am and 9pm in Singapore on 10 March.
  const EIGHT_AM = new Date("2026-03-10T00:05:00.000Z");
  const NINE_PM = new Date("2026-03-10T13:05:00.000Z");
  const subscriber = async (types = { dailyReminder: true, morningBudget: true }, timezone = "Asia/Singapore") => {
    const u = await api.makeUser();
    n += 1;
    const r = await api.call("/api/push/subscription", u.token, "POST", { endpoint: `https://push.example.com/job-${n}`, keys: KEYS, timezone, types });
    assert.equal(r.status, 200);
    return u;
  };
  const dry = (job, at, u) => job(at, { dryRun: true, userIds: [u.user._id] });

  it("the endpoint is closed without the scheduler's secret", async () => {
    assert.equal((await api.call("/api/jobs/notifications", null, "POST", {})).status, 401);
    assert.equal((await api.call("/api/jobs/notifications", null, "POST", {}, { "X-Cron-Secret": "wrong" })).status, 401);
    const { token } = await api.makeUser();
    assert.equal((await api.call("/api/jobs/notifications", token, "POST", {})).status, 401);
    assert.equal((await api.call("/api/jobs/notifications", null, "POST", {}, { "X-Cron-Secret": CRON_SECRET })).status, 200);
  });

  it("the morning budget goes out at 8am local with today's figure", async () => {
    const u = await subscriber();
    await api.income(u.token, "2026-03-01", 900);
    await api.expense(u.token, "2026-03-09", 2);
    const r = await dry(morning, EIGHT_AM, u);
    assert.equal(r.recipients, 1);
    assert.equal(r.sent, 0, "a dry run must not send");
    near(898 / 22, 40.82, 0.01);
    assert.match(r.messages[0].title, /\$40\.82/);
    assert.doesNotMatch(r.messages[0].body, /nothing was logged yesterday/i);
  });

  it("adds a nudge when nothing was logged yesterday", async () => {
    const u = await subscriber();
    await api.income(u.token, "2026-03-01", 900);
    const r = await dry(morning, EIGHT_AM, u);
    assert.match(r.messages[0].title, /\$40\.91/);
    assert.match(r.messages[0].body, /nothing was logged yesterday/i);
  });

  it("does not go out at any other hour", async () => {
    const u = await subscriber();
    await api.income(u.token, "2026-03-01", 900);
    for (const at of ["2026-03-09T23:05:00.000Z", "2026-03-10T01:05:00.000Z", "2026-03-10T13:05:00.000Z"]) {
      assert.equal((await dry(morning, new Date(at), u)).recipients, 0, at);
    }
  });

  it("follows the user's own timezone", async () => {
    const u = await subscriber(undefined, "America/New_York"); // 8am EDT = 12:00 UTC
    await api.income(u.token, "2026-03-01", 900);
    assert.equal((await dry(morning, EIGHT_AM, u)).recipients, 0);
    assert.equal((await dry(morning, new Date("2026-03-10T12:05:00.000Z"), u)).recipients, 1);
  });

  it("skips someone with no funded budget", async () => {
    const u = await subscriber();
    assert.equal((await dry(morning, EIGHT_AM, u)).recipients, 0);
  });

  it("skips a device that switched the morning budget off", async () => {
    const u = await subscriber({ dailyReminder: true, morningBudget: false });
    await api.income(u.token, "2026-03-01", 900);
    assert.equal((await dry(morning, EIGHT_AM, u)).recipients, 0);
  });

  it("the evening reminder goes out at 9pm local only when nothing was logged today", async () => {
    const quiet = await subscriber();
    const busy = await subscriber();
    await api.income(quiet.token, "2026-03-01", 900);
    await api.income(busy.token, "2026-03-01", 900);
    await api.expense(busy.token, TODAY, 4);
    assert.equal((await dry(evening, NINE_PM, quiet)).recipients, 1);
    assert.equal((await dry(evening, NINE_PM, busy)).recipients, 0);
    assert.equal((await dry(evening, EIGHT_AM, quiet)).recipients, 0);
  });

  it("'today' for the reminder is the user's local day, not UTC's", async () => {
    // 9pm on 10 March in Los Angeles is 04:05 UTC on the 11th.
    const u = await subscriber(undefined, "America/Los_Angeles");
    api.setNow("2026-03-11T04:05:00.000Z");
    const t = api.signToken(u.user);
    await api.expense(t, "2026-03-10", 4); // logged on their 10th
    assert.equal((await dry(evening, new Date("2026-03-11T04:05:00.000Z"), u)).recipients, 0);
  });

  it("is sent once a day, even if the job runs twice in the hour", async () => {
    const u = await subscriber();
    await api.income(u.token, "2026-03-01", 900);
    const sent = [];
    const send = async (...args) => { sent.push(args); return {}; };
    const first = await morning(EIGHT_AM, { userIds: [u.user._id], send });
    const second = await morning(new Date("2026-03-10T00:40:00.000Z"), { userIds: [u.user._id], send });
    assert.equal(first.sent, 1);
    assert.equal(second.sent, 0);
    assert.equal(sent.length, 1);
  });

  it("the message is built from the same figure the streak endpoint returns", async () => {
    const u = await api.makeUser();
    await api.income(u.token, "2026-03-01", 900);
    const streak = (await api.call(`/api/streak?today=${TODAY}`, u.token)).body;
    const m = message(streak, { mode: "month", loggedYesterday: true });
    assert.match(m.title, /\$40\.91/);
    assert.match(m.body, /22 days left/);
  });

  it("there is no message when there is no budget to report", async () => {
    const u = await api.makeUser();
    const streak = (await api.call(`/api/streak?today=${TODAY}`, u.token)).body;
    assert.equal(message(streak, { mode: "month", loggedYesterday: true }), null);
  });
});
