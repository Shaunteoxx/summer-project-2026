// What the mocked modules read from. A test points `holder.server` at a fake
// API (see _fakeServer.js) and `holder.today` at the date the device shows.
export const holder = { server: null, today: "2026-03-01" };

export const ENDPOINT_NAMES = [
  "demoLogin", "loadDemoSample", "refreshSession", "endSession", "fetchMe", "fetchHomeStats", "fetchPushKey",
  "fetchPushSubscription", "savePushSubscription", "removePushSubscription", "sendTestPush", "addCustomCategory",
  "removeCustomCategory", "updateProfile", "deleteAccount", "setMonthlySavings", "markTours", "forgetTours",
  "addAccount", "updateAccount", "removeAccount", "addRecurring", "updateRecurring", "removeRecurring",
  "fetchAccountTotals", "fetchTransfers", "addTransfer", "removeTransfer", "fetchPeriod", "setPeriodMode",
  "startPeriod", "updatePeriod", "deletePeriod", "startTerm", "updateTerm", "deleteTerm", "fetchStreak",
  "restoreStreak", "fetchTransactions", "addTransaction", "updateTransaction", "removeTransaction",
  "fetchAllSummaries", "fetchLifetimeSavings", "searchUsers", "fetchFriends", "fetchRequests", "fetchComparison",
  "sendFriendRequest", "acceptFriendRequest", "declineFriendRequest",
];

export const endpoints = Object.fromEntries(
  ENDPOINT_NAMES.map((name) => [name, (...args) => holder.server.api[name](...args)])
);
