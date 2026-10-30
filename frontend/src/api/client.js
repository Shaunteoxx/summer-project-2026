const BASE_URL = `${import.meta.env.VITE_API_URL || ""}/api`;

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

/** The token's claims, or null if it has none that parse. */
function tokenClaims(token) {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

/** Epoch ms this token expires, or null if it carries no readable `exp`. */
function tokenExpiry(token) {
  const exp = tokenClaims(token)?.exp;
  return typeof exp === "number" ? exp * 1000 : null;
}

/**
 * The signed-in user's id, read from the token without a request — for keying
 * per-user state kept on the device. Not a security check: nothing here
 * verifies the signature, and nothing that uses it needs one.
 */
export function tokenUserId() {
  const token = getToken();
  return token ? (tokenClaims(token)?.id ?? null) : null;
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

/**
 * The query string, encoded the way axios encoded it while this client was
 * axios: spaces as "+", with ",", ":" and "$" left as they are. Empty values
 * are left out.
 */
function queryString(params = {}) {
  const encode = (value) =>
    encodeURIComponent(value)
      .replace(/%3A/gi, ":")
      .replace(/%24/g, "$")
      .replace(/%2C/gi, ",")
      .replace(/%20/g, "+");
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join("&");
}

/** A failed request. Only a refusal has a `response` ({ status, data }). */
function failure(message, response) {
  const err = new Error(message);
  if (response) err.response = response;
  return err;
}

/**
 * One request to the API. Resolves to `{ status, data }` for a 2xx answer;
 * anything else rejects with an Error, carrying `response` when the server
 * answered, which is where the app reads `err.response.data.message`.
 *
 * The browser's own fetch rather than axios: axios was 20 kB of the 151 kB
 * (gzipped) that every visit downloaded, for a client this size.
 * `client.test.js` pins that it still behaves as axios did.
 */
async function request(method, url, { params, data } = {}) {
  const query = queryString(params);
  const target =
    `${BASE_URL.replace(/\/?\/$/, "")}/${url.replace(/^\/+/, "")}` + (query ? `?${query}` : "");

  const headers = { Accept: "application/json, text/plain, */*" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (data !== undefined && data !== null) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(data);
  }

  const { timeout } = api.defaults;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  let text;
  try {
    res = await fetch(target, { method, headers, body, signal: controller.signal });
    text = await res.text();
  } catch {
    throw failure(controller.signal.aborted ? `timeout of ${timeout}ms exceeded` : "Network Error");
  } finally {
    clearTimeout(timer);
  }

  // Parsed when it's JSON, kept as text when it isn't, as axios did.
  let parsed = text;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON: an error page from a proxy, say.
    }
  }
  const response = { status: res.status, data: parsed };
  if (res.ok) return response;

  // Signed out on the server: drop the token and go to the login page.
  if (res.status === 401) {
    clearToken();
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }
  throw failure(`Request failed with status code ${res.status}`, response);
}

/** The calls endpoints.js makes, shaped as axios's were. */
const api = {
  defaults: { timeout: 15000 },
  get: (url, config) => request("GET", url, config),
  delete: (url, config) => request("DELETE", url, config),
  post: (url, data, config) => request("POST", url, { ...config, data }),
  put: (url, data, config) => request("PUT", url, { ...config, data }),
  patch: (url, data, config) => request("PATCH", url, { ...config, data }),
};

export default api;
