// Black-box tests for the session token helpers (HANDOFF §3: a 7-day JWT in
// localStorage, silently refreshed once it is past half its life).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getToken, setToken, clearToken, tokenUserId, tokenIsStale } from "./client.js";

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const jwt = (claims) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64(claims)}.signature`;
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe("token storage", () => {
  it("has no token to begin with", () => {
    expect(getToken()).toBe(null);
  });

  it("stores, returns and clears the token under bnm_token", () => {
    setToken("abc.def.ghi");
    expect(getToken()).toBe("abc.def.ghi");
    expect(localStorage.getItem("bnm_token")).toBe("abc.def.ghi");
    clearToken();
    expect(getToken()).toBe(null);
    expect(localStorage.getItem("bnm_token")).toBe(null);
  });
});

describe("tokenUserId", () => {
  it("reads the user id out of the token", () => {
    setToken(jwt({ id: "user-123", iat: now(), exp: now() + 7 * DAY }));
    expect(tokenUserId()).toBe("user-123");
  });

  it("is null with no token or an unreadable one", () => {
    expect(tokenUserId()).toBe(null);
    for (const bad of ["garbage", "a.b.c", "a.%%%.c", ""]) {
      setToken(bad);
      expect(tokenUserId(), bad).toBe(null);
    }
  });

  it("reads tokens whose payload uses the URL-safe alphabet", () => {
    setToken(jwt({ id: "user-123", note: "üñîçödé ~~~ ???>>>", iat: now(), exp: now() + DAY }));
    expect(tokenUserId()).toBe("user-123");
  });
});

describe("tokenIsStale: past half its life", () => {
  it("a fresh token is not stale", () => {
    setToken(jwt({ id: "u", iat: now(), exp: now() + 7 * DAY }));
    expect(tokenIsStale()).toBe(false);
  });

  it("a token three days old is not yet stale; one four days old is", () => {
    setToken(jwt({ id: "u", iat: now() - 3 * DAY, exp: now() + 4 * DAY }));
    expect(tokenIsStale()).toBe(false);
    setToken(jwt({ id: "u", iat: now() - 4 * DAY, exp: now() + 3 * DAY }));
    expect(tokenIsStale()).toBe(true);
  });

  it("goes stale as the clock moves, without the token changing", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00Z"));
    setToken(jwt({ id: "u", iat: now(), exp: now() + 7 * DAY }));
    expect(tokenIsStale()).toBe(false);
    vi.setSystemTime(new Date("2026-03-05T00:00:00Z"));
    expect(tokenIsStale()).toBe(true);
  });

  it("no token is not 'stale' — there is nothing to refresh", () => {
    expect(tokenIsStale()).toBe(false);
  });

  it("an unreadable token does not throw", () => {
    for (const bad of ["garbage", "a.b.c", ""]) {
      setToken(bad);
      expect(() => tokenIsStale(), bad).not.toThrow();
    }
  });
});
