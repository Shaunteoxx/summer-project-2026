// Black-box contract tests: every endpoint helper must call the route the
// backend actually serves (method + path, taken from backend/routes and the
// README's API table), and pass its arguments where the server reads them.
import { describe, it, expect, beforeEach, vi } from "vitest";

const calls = [];
const record = (method) => vi.fn((url, a, b) => {
  const hasBody = ["post", "put", "patch"].includes(method);
  const config = (hasBody ? b : a) || {};
  const [path, query = ""] = String(url).split("?");
  const params = { ...Object.fromEntries(new URLSearchParams(query)), ...(config.params || {}) };
  calls.push({ method, path: path.replace(/^\/api/, ""), body: hasBody ? a : config.data, params });
  return Promise.resolve({ data: {} });
});

vi.mock("./client.js", async (original) => ({
  ...(await original()),
  default: { get: record("get"), post: record("post"), put: record("put"), patch: record("patch"), delete: record("delete") },
}));

const api = await import("./endpoints.js");
const last = () => calls.at(-1);
beforeEach(() => { calls.length = 0; });

const ID = "507f1f77bcf86cd799439011";
const BODY = { any: "payload" };

// [helper, arguments, expected method, expected path, expectation on what was sent]
const CONTRACT = [
  ["demoLogin", [], "post", "/auth/demo"],
  ["loadDemoSample", [BODY], "post", "/auth/demo/sample", { body: BODY }],
  ["refreshSession", [], "post", "/auth/refresh"],
  ["endSession", [], "post", "/auth/logout"],
  ["fetchMe", [], "get", "/auth/me"],
  ["fetchHomeStats", ["2026-03-01"], "get", "/auth/home", { params: { today: "2026-03-01" } }],
  ["addCustomCategory", [BODY], "post", "/auth/categories", { body: BODY }],
  ["removeCustomCategory", [ID], "delete", `/auth/categories/${ID}`],
  ["updateProfile", [BODY], "patch", "/auth/profile", { body: BODY }],
  ["deleteAccount", [], "delete", "/auth/me"],
  ["setMonthlySavings", [BODY], "put", "/auth/savings", { body: BODY }],
  ["markTours", [["home@1"]], "post", "/auth/tours", { body: { ids: ["home@1"] } }],
  ["forgetTours", [["home@1"]], "post", "/auth/tours/forget", { body: { ids: ["home@1"] } }],
  ["addAccount", [BODY], "post", "/auth/accounts", { body: BODY }],
  ["updateAccount", [ID, BODY], "patch", `/auth/accounts/${ID}`, { body: BODY }],
  ["removeAccount", [ID], "delete", `/auth/accounts/${ID}`],
  ["addRecurring", [BODY], "post", "/auth/recurring", { body: BODY }],
  ["updateRecurring", [ID, BODY], "patch", `/auth/recurring/${ID}`, { body: BODY }],
  ["removeRecurring", [ID], "delete", `/auth/recurring/${ID}`],
  ["fetchAccountTotals", ["2026-03-01"], "get", "/accounts", { params: { today: "2026-03-01" } }],
  ["fetchTransfers", [{ start: "2026-02-20", end: "2026-03-05" }], "get", "/transfers", { params: { start: "2026-02-20", end: "2026-03-05" } }],
  ["addTransfer", [BODY], "post", "/transfers", { body: BODY }],
  ["removeTransfer", [ID], "delete", `/transfers/${ID}`],
  ["fetchPeriod", ["2026-03-01"], "get", "/period", { params: { today: "2026-03-01" } }],
  ["setPeriodMode", ["days"], "put", "/period/mode", { body: { mode: "days" } }],
  ["startPeriod", [BODY], "post", "/period", { body: BODY }],
  ["updatePeriod", [ID, BODY], "patch", `/period/${ID}`, { body: BODY }],
  ["deletePeriod", [ID], "delete", `/period/${ID}`],
  ["startTerm", [BODY], "post", "/period/term", { body: BODY }],
  ["updateTerm", [ID, BODY], "patch", `/period/term/${ID}`, { body: BODY }],
  ["deleteTerm", [ID], "delete", `/period/term/${ID}`],
  ["fetchStreak", ["2026-03-01"], "get", "/streak", { params: { today: "2026-03-01" } }],
  ["restoreStreak", [BODY], "post", "/streak/restore", { body: BODY }],
  ["fetchTransactions", [{ start: "2026-02-20", end: "2026-03-05" }], "get", "/transactions", { params: { start: "2026-02-20", end: "2026-03-05" } }],
  ["addTransaction", [BODY], "post", "/transactions", { body: BODY }],
  ["updateTransaction", [ID, BODY], "patch", `/transactions/${ID}`, { body: BODY }],
  ["removeTransaction", [ID], "delete", `/transactions/${ID}`],
  ["fetchAllSummaries", [], "get", "/summary/all"],
  ["fetchLifetimeSavings", ["2026-03-01"], "get", "/summary/lifetime", { params: { today: "2026-03-01" } }],
  ["searchUsers", ["quokka"], "get", "/friends/search", { params: { q: "quokka" } }],
  ["fetchFriends", [], "get", "/friends"],
  ["fetchRequests", [], "get", "/friends/requests"],
  ["fetchComparison", ["2026-03-01"], "get", "/friends/comparison", { params: { today: "2026-03-01" } }],
  ["sendFriendRequest", [ID], "post", `/friends/request/${ID}`],
  ["acceptFriendRequest", [ID], "post", `/friends/accept/${ID}`],
  ["declineFriendRequest", [ID], "post", `/friends/decline/${ID}`],
  ["fetchPushKey", [], "get", "/push/key"],
  ["fetchPushSubscription", ["https://push.example.com/a?b=1&c=2"], "get", "/push/subscription", { params: { endpoint: "https://push.example.com/a?b=1&c=2" } }],
  ["savePushSubscription", [BODY], "post", "/push/subscription", { body: BODY }],
  ["removePushSubscription", [BODY], "post", "/push/unsubscribe", { body: BODY }],
  ["sendTestPush", [], "post", "/push/test"],
];

describe("endpoint helpers call the routes the backend serves", () => {
  it("every exported helper is covered here", () => {
    const exported = Object.keys(api).filter((k) => typeof api[k] === "function").sort();
    expect(exported).toEqual(CONTRACT.map(([name]) => name).sort());
  });

  for (const [name, args, method, path, sent = {}] of CONTRACT) {
    it(`${name} → ${method.toUpperCase()} ${path}`, async () => {
      await api[name](...args);
      expect(calls).toHaveLength(1);
      expect(last().method).toBe(method);
      expect(last().path.replace(/\/$/, "")).toBe(path);
      if (sent.body) expect(last().body).toEqual(sent.body);
      if (sent.params) expect(last().params).toMatchObject(sent.params);
    });
  }
});

describe("endpoint helpers: arguments that could go wrong in transit", () => {
  it("a search with spaces, ampersands or a hash arrives intact", async () => {
    for (const q of ["a b", "a&admin=1", "x#y", "50%", "q?q"]) {
      await api.searchUsers(q);
      expect(last().params.q).toBe(q);
      expect(last().path).toBe("/friends/search");
    }
  });

  it("an id is put in the path as given", async () => {
    await api.removeTransaction("abc123");
    expect(last().path).toBe("/transactions/abc123");
    await api.updatePeriod("abc123", {});
    expect(last().path).toBe("/period/abc123");
  });

  it("the ledger can still be asked for by calendar month, for history", async () => {
    await api.fetchTransactions({ month: 2, year: 2026 });
    expect(last().params).toMatchObject({ month: 2, year: 2026 });
  });

  it("no helper sends today's date when it was not given one", async () => {
    await api.fetchHomeStats();
    expect(last().params.today).toBeUndefined();
    expect(JSON.stringify(last())).not.toContain("undefined");
  });
});
