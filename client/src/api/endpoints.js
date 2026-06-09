import api from "./client";

// --- Auth ---
export const fetchMe = () => api.get("/auth/me").then((r) => r.data);
export const fetchHomeStats = () => api.get("/auth/home").then((r) => r.data);

// --- Transactions ---
export const fetchTransactions = (params) =>
  api.get("/transactions", { params }).then((r) => r.data);
export const addTransaction = (payload) =>
  api.post("/transactions", payload).then((r) => r.data);
export const removeTransaction = (id) =>
  api.delete(`/transactions/${id}`).then((r) => r.data);

// --- Summary ---
export const fetchSummary = (params) =>
  api.get("/summary", { params }).then((r) => r.data);
export const fetchAllSummaries = () =>
  api.get("/summary/all").then((r) => r.data);

// --- Friends ---
export const searchUsers = (q) =>
  api.get("/friends/search", { params: { q } }).then((r) => r.data);
export const fetchFriends = () => api.get("/friends").then((r) => r.data);
export const fetchRequests = () =>
  api.get("/friends/requests").then((r) => r.data);
export const fetchComparison = () =>
  api.get("/friends/comparison").then((r) => r.data);
export const sendFriendRequest = (id) =>
  api.post(`/friends/request/${id}`).then((r) => r.data);
export const acceptFriendRequest = (id) =>
  api.post(`/friends/accept/${id}`).then((r) => r.data);
export const declineFriendRequest = (id) =>
  api.post(`/friends/decline/${id}`).then((r) => r.data);
