import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/hooks/useAuth";
import {
  addRecurring as createRule,
  updateRecurring as patchRule,
  removeRecurring as deleteRule,
} from "@/api/endpoints";

const RecurringContext = createContext(null);

/**
 * The user's repeating entries, plus the CRUD to manage them.
 *
 * Seeded from the auth profile, like accounts and categories — rules are
 * embedded on the user document, so they arrive with /api/auth/me for free.
 *
 * Shared rather than per-screen because there are two ways in: the list on the
 * More page, and the "repeat this" toggle in the add-transaction sheet. With a
 * copy each, a rule made while logging rent wouldn't show up in the list until
 * the profile was refetched.
 */
export function RecurringProvider({ children }) {
  const { user } = useAuth();
  const [rules, setRules] = useState([]);

  useEffect(() => {
    setRules(user?.recurring ?? []);
  }, [user]);

  const addRule = useCallback(async (payload) => {
    const created = await createRule(payload);
    setRules((prev) => [...prev, created]);
    return created;
  }, []);

  const updateRule = useCallback(async (id, changes) => {
    const updated = await patchRule(id, changes);
    setRules((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }, []);

  const removeRule = useCallback(async (id) => {
    await deleteRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const value = useMemo(
    () => ({ rules, addRule, updateRule, removeRule }),
    [rules, addRule, updateRule, removeRule]
  );

  return (
    <RecurringContext.Provider value={value}>{children}</RecurringContext.Provider>
  );
}

export function useRecurring() {
  const ctx = useContext(RecurringContext);
  if (!ctx) throw new Error("useRecurring must be used within RecurringProvider");
  return ctx;
}
