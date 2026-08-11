import api from "./client";

// --- Auth ---
export const demoLogin = () => api.post("/auth/demo").then((r) => r.data);
export const refreshSession = () => api.post("/auth/refresh").then((r) => r.data);
export const endSession = () => api.post("/auth/logout").then((r) => r.data);
export const fetchMe = () => api.get("/auth/me").then((r) => r.data);
export const fetchHomeStats = (today) =>
  api.get("/auth/home", { params: { today } }).then((r) => r.data);

// --- Custom categories ---
export const addCustomCategory = (payload) =>
  api.post("/auth/categories", payload).then((r) => r.data);
export const removeCustomCategory = (id) =>
  api.delete(`/auth/categories/${id}`).then((r) => r.data);

// --- Profile ---
export const updateProfile = (payload) =>
  api.patch("/auth/profile", payload).then((r) => r.data);
export const deleteAccount = () =>
  api.delete("/auth/me").then((r) => r.data);
// Month-mode savings target, keyed "YYYY-M". Days-mode periods carry their own
// target and are updated through the period endpoints above.
export const setMonthlySavings = (payload) =>
  api.put("/auth/savings", payload).then((r) => r.data);

// --- Bank accounts ---
// Created/edited through /auth because they are embedded on the user; the
// /accounts endpoint below is the read-only per-period totals view.
export const addAccount = (payload) =>
  api.post("/auth/accounts", payload).then((r) => r.data);
export const updateAccount = (id, payload) =>
  api.patch(`/auth/accounts/${id}`, payload).then((r) => r.data);
export const removeAccount = (id) =>
  api.delete(`/auth/accounts/${id}`).then((r) => r.data);
// --- Repeating entries ---
export const addRecurring = (payload) =>
  api.post("/auth/recurring", payload).then((r) => r.data);
export const updateRecurring = (id, payload) =>
  api.patch(`/auth/recurring/${id}`, payload).then((r) => r.data);
export const removeRecurring = (id) =>
  api.delete(`/auth/recurring/${id}`).then((r) => r.data);

export const fetchAccountTotals = (today) =>
  api.get("/accounts", { params: { today } }).then((r) => r.data);

// --- Transfers between the user's own accounts ---
export const fetchTransfers = (params) =>
  api.get("/transfers", { params }).then((r) => r.data);
export const addTransfer = (payload) =>
  api.post("/transfers", payload).then((r) => r.data);
export const removeTransfer = (id) =>
  api.delete(`/transfers/${id}`).then((r) => r.data);

// --- Budget period ---
export const fetchPeriod = (today) =>
  api.get("/period", { params: { today } }).then((r) => r.data);
export const setPeriodMode = (mode) =>
  api.put("/period/mode", { mode }).then((r) => r.data);
export const startPeriod = (payload) =>
  api.post("/period", payload).then((r) => r.data);
export const updatePeriod = (id, payload) =>
  api.patch(`/period/${id}`, payload).then((r) => r.data);
export const deletePeriod = (id) =>
  api.delete(`/period/${id}`).then((r) => r.data);

// --- Streak ---
export const fetchStreak = (today) =>
  api.get("/streak", { params: { today } }).then((r) => r.data);
export const restoreStreak = (payload) =>
  api.post("/streak/restore", payload).then((r) => r.data);

// --- Transactions ---
export const fetchTransactions = (params) =>
  api.get("/transactions", { params }).then((r) => r.data);
export const addTransaction = (payload) =>
  api.post("/transactions", payload).then((r) => r.data);
// Partial: send only what changed. `accountId: null` clears the tag, so an
// absent key and an explicit null mean different things here.
export const updateTransaction = (id, payload) =>
  api.patch(`/transactions/${id}`, payload).then((r) => r.data);
export const removeTransaction = (id) =>
  api.delete(`/transactions/${id}`).then((r) => r.data);

// --- Summary ---
export const fetchAllSummaries = () =>
  api.get("/summary/all").then((r) => r.data);

// --- Friends ---
export const searchUsers = (q) =>
  api.get("/friends/search", { params: { q } }).then((r) => r.data);
export const fetchFriends = () => api.get("/friends").then((r) => r.data);
export const fetchRequests = () =>
  api.get("/friends/requests").then((r) => r.data);
export const fetchComparison = (today) =>
  api.get("/friends/comparison", { params: { today } }).then((r) => r.data);
export const sendFriendRequest = (id) =>
  api.post(`/friends/request/${id}`).then((r) => r.data);
export const acceptFriendRequest = (id) =>
  api.post(`/friends/accept/${id}`).then((r) => r.data);
export const declineFriendRequest = (id) =>
  api.post(`/friends/decline/${id}`).then((r) => r.data);
