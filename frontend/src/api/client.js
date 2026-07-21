import axios from "axios";

const api = axios.create({
  baseURL: `${import.meta.env.VITE_API_URL || ""}/api`,
  timeout: 15000,
});

const TOKEN_KEY = "bnm_token";

export function getToken() {
  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) return token;
  // One-time migration from older builds that persisted seven-day tokens.
  const legacy = localStorage.getItem(TOKEN_KEY);
  if (legacy) {
    sessionStorage.setItem(TOKEN_KEY, legacy);
    localStorage.removeItem(TOKEN_KEY);
  }
  return legacy;
}

export function setToken(token) {
  if (token) sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TOKEN_KEY);
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
