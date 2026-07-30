import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ""}/api`,
  timeout: 15000,
});

const TOKEN_KEY = "bnm_token";
// Mirrors the backend's token lifetime (backend/middleware/auth.js).
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// localStorage, not sessionStorage: iOS Safari discards backgrounded tabs, and
// a sessionStorage token dies with the tab — so leaving the app and coming back
// meant signing in again. Staying signed in relies on the sliding refresh in
// useAuth rather than on a long-lived token.
export function getToken() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) return token;
  // One-time migration from the builds that kept the token per-tab.
  const legacy = sessionStorage.getItem(TOKEN_KEY);
  if (legacy) {
    localStorage.setItem(TOKEN_KEY, legacy);
    sessionStorage.removeItem(TOKEN_KEY);
  }
  return legacy;
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
}

/** Epoch ms this token expires, or null if it carries no readable `exp`. */
function tokenExpiry(token) {
  try {
    const payload = token.split(".")[1];
    const { exp } = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof exp === "number" ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * True once the stored token is past the halfway point of its lifetime, which
 * is when it is worth swapping for a fresh one. Keeps the refresh to roughly
 * one request every few days instead of one per app switch.
 */
export function tokenIsStale() {
  const token = getToken();
  if (!token) return false;
  const expiry = tokenExpiry(token);
  if (expiry === null) return true;
  return expiry - Date.now() < TOKEN_TTL_MS / 2;
}

// Attach JWT to every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Bounce to login on auth failure.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      clearToken();
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
