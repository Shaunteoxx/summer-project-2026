// A stand-in for the API that answers the way the real one does. Every shape
// here was taken from the running backend (see backend/test/blackbox), so a
// page tested against it is tested against what production would send.
import { vi } from "vitest";

const ymd = (iso) => String(iso).slice(0, 10);

export function makeServer({ today, mode = "month", ledger = [], period = null, term = null, home = {}, streak = {}, me = {}, status, previous = null, overrides = {} }) {
  const calls = { fetchTransactions: [], fetchHomeStats: [], fetchStreak: [], fetchPeriod: [] };

  // GET /api/transactions: ?start&end is an inclusive date range; ?month&year
  // is one calendar month (0-based); neither means the current calendar month.
  const listTransactions = (params = {}) => {
    let rows = ledger;
    if (params.start && params.end) {
      rows = rows.filter((t) => ymd(t.date) >= params.start && ymd(t.date) <= params.end);
    } else {
      const month = params.month ?? Number(today.slice(5, 7)) - 1;
      const year = params.year ?? Number(today.slice(0, 4));
      rows = rows.filter((t) => Number(ymd(t.date).slice(5, 7)) - 1 === Number(month) && Number(ymd(t.date).slice(0, 4)) === Number(year));
    }
    if (params.accountId) rows = rows.filter((t) => t.accountId === params.accountId);
    return [...rows].sort((a, b) => ymd(b.date).localeCompare(ymd(a.date)));
  };

  const periodBody = {
    mode,
    status: status ?? (period ? "active" : mode === "month" ? "active" : "none"),
    current: period,
    previous,
    history: period && mode === "days" ? [period] : [],
    term,
    terms: term ? [term] : [],
  };

  const api = {
    fetchTransactions: vi.fn(async (params) => { calls.fetchTransactions.push(params); return listTransactions(params); }),
    fetchHomeStats: vi.fn(async (t) => { calls.fetchHomeStats.push(t); return { username: "shaunteo", mode, status: periodBody.status, period, periodIncome: 0, periodFunding: null, periodExpenses: 0, periodSavings: 0, leftToSpend: 0, percentageSaved: 0, ...home }; }),
    fetchStreak: vi.fn(async (t) => { calls.fetchStreak.push(t); return { hasData: ledger.length > 0, hasIncome: false, overspentBy: 0, leftToSpend: 0, periodSavings: 0, period, periodStatus: period ? "active" : "inactive", currentStreak: 0, longestStreak: 0, today: { spent: 0, budget: 0, remaining: 0, within: true }, savesLeftThisPeriod: 0, restore: null, breakDay: null, last7: [], periodDays: [], ...streak }; }),
    fetchPeriod: vi.fn(async (t) => { calls.fetchPeriod.push(t); return periodBody; }),
    fetchMe: vi.fn(async () => ({ id: "u1", username: "shaunteo", email: "s@example.com", isDemo: false, demoSampleLoaded: false, profilePicture: "", avatar: "", budgetMode: mode, accounts: [], recurring: [], savingsByMonth: {}, repeatSavings: false, timezone: "Asia/Singapore", notificationHours: { dailyReminder: 21, morningBudget: 8 }, friends: [], friendRequests: [], customCategories: [], tours: [], toursOff: true, createdAt: "2026-01-01T00:00:00.000Z", ...me })),
    fetchAccountTotals: vi.fn(async () => ({ period: period && { start: period.start, end: period.end, savings: 0, funding: null, fundedBy: [] }, accounts: [], totals: { income: 0, spent: 0, funding: null, net: 0, reserved: 0, leftToSpend: 0 } })),
    fetchTransfers: vi.fn(async () => []),
    fetchAllSummaries: vi.fn(async () => []),
    fetchLifetimeSavings: vi.fn(async () => ({ earned: 0, spent: 0, saved: 0, rate: 0, through: null })),
    fetchFriends: vi.fn(async () => []),
    fetchRequests: vi.fn(async () => []),
    fetchComparison: vi.fn(async () => ({ through: null, leaderboard: [] })),
    searchUsers: vi.fn(async () => []),
    fetchPushKey: vi.fn(async () => ({ publicKey: "" })),
    fetchPushSubscription: vi.fn(async () => { throw Object.assign(new Error("Not subscribed"), { response: { status: 404 } }); }),
  };
  for (const name of ["demoLogin", "loadDemoSample", "refreshSession", "endSession", "savePushSubscription", "removePushSubscription", "sendTestPush", "addCustomCategory", "removeCustomCategory", "updateProfile", "deleteAccount", "setMonthlySavings", "markTours", "forgetTours", "addAccount", "updateAccount", "removeAccount", "addRecurring", "updateRecurring", "removeRecurring", "addTransfer", "removeTransfer", "setPeriodMode", "startPeriod", "updatePeriod", "deletePeriod", "startTerm", "updateTerm", "deleteTerm", "restoreStreak", "addTransaction", "updateTransaction", "removeTransaction", "sendFriendRequest", "acceptFriendRequest", "declineFriendRequest"]) {
    api[name] = vi.fn(async () => ({}));
  }
  // A test can replace any answer: a value, or a function of the request.
  for (const [name, answer] of Object.entries(overrides)) {
    api[name] = vi.fn(typeof answer === "function" ? answer : async () => answer);
  }
  return { api, calls };
}

export const entry = (id, date, type, amount, description, extra = {}) => ({
  _id: id, userId: "u1", description, amount, type, category: type === "income" ? "Allowance" : "F & B",
  date: `${date}T00:00:00.000Z`, month: Number(date.slice(5, 7)) - 1, year: Number(date.slice(0, 4)),
  accountId: null, recurringId: null, dueKey: null, paidBack: 0, paidBackAccountId: null, ...extra,
});
