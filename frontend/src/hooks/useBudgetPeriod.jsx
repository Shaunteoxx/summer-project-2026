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
 *   lapsed   — days or term mode, the last window has ended
 *   none     — days or term mode, nothing set up yet
 */
export function BudgetPeriodProvider({ children }) {
  const { user } = useAuth();
  const [state, setState] = useState({
    mode: "month",
    status: "active",
    current: null,
    previous: null,
    history: [],
    term: null,
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
        term: null,
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
    // Convenience for the many "this month" / "this period" strings. Term
    // cycles are calendar months, so they take the reader-familiar word too;
    // only days mode budgets a window that isn't a month.
    noun: state.mode === "days" ? "period" : "month",
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
