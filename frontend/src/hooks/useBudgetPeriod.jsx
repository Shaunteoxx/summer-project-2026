import { createContext, useCallback, useContext, useEffect, useState } from "react";

import { fetchPeriod } from "@/api/endpoints";
import { useAuth } from "@/hooks/useAuth";
import { localToday } from "@/lib/utils";

const BudgetPeriodContext = createContext(null);

/**
 * The user's active budget period, shared across the app so every screen
 * agrees on which window it's showing.
 *
 * `status` is one of:
 *   active   — a period covers today (always true in month mode)
 *   lapsed   — days mode, the last period has ended; the user starts the next
 *   none     — days mode, nothing set up yet
 */
export function BudgetPeriodProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    mode: "month",
    status: "active",
    current: null,
    previous: null,
    history: [],
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setState(await fetchPeriod(localToday()));
    } catch {
      // Fall back to month mode rather than blocking the app; the server stays
      // the authority and the next load will correct this.
      setState({
        mode: "month",
        status: "active",
        current: null,
        previous: null,
        history: [],
      });
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const value = {
    ...state,
    loading,
    refresh: load,
    // Convenience for the many "this month" / "this period" strings.
    noun: state.mode === "month" ? "month" : "period",
  };

  return (
    <BudgetPeriodContext.Provider value={value}>{children}</BudgetPeriodContext.Provider>
  );
}

export function useBudgetPeriod() {
  const ctx = useContext(BudgetPeriodContext);
  if (!ctx) throw new Error("useBudgetPeriod must be used within BudgetPeriodProvider");
  return ctx;
}
