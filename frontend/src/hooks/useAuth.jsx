import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { fetchMe, refreshSession, endSession } from "@/api/endpoints";
import { getToken, setToken, clearToken, tokenIsStale } from "@/api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const me = await fetchMe();
      setUser(me);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Extend the session whenever the app is opened past the token's halfway
  // point. Mobile Safari can leave the app suspended for days, so without this
  // the token would quietly expire and drop you back on the login screen.
  const extendSession = useCallback(async () => {
    if (!tokenIsStale()) return;
    try {
      const { token } = await refreshSession();
      setToken(token);
    } catch {
      // Keep the current token; a genuinely expired one is handled by the
      // 401 interceptor in api/client.
    }
  }, []);

  useEffect(() => {
    extendSession().finally(loadUser);
  }, [extendSession, loadUser]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") extendSession();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [extendSession]);

  /** Drop the local session only. For when the token is already dead server-side. */
  const clearSession = useCallback(() => {
    clearToken();
    setUser(null);
    window.location.href = "/login";
  }, []);

  /** Sign out for real: revoke the token server-side, then drop it locally. */
  const logout = useCallback(async () => {
    try {
      await endSession();
    } catch {
      // Network failure shouldn't trap you in the app — still clear locally.
    }
    clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider
      value={{ user, loading, refresh: loadUser, logout, clearSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
