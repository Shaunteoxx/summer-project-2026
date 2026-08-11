import { createContext, useCallback, useContext, useMemo, useState, useEffect } from "react";

import { useAuth } from "@/hooks/useAuth";
import {
  addAccount as createAccount,
  updateAccount as patchAccount,
  removeAccount as deleteAccount,
} from "@/api/endpoints";

const AccountsContext = createContext(null);

/** Remembered between sessions so the picker opens on the one you used last. */
const LAST_USED_KEY = "bnm_last_account";

/**
 * The user's bank accounts, plus the CRUD to manage them.
 *
 * Seeded from the auth profile — accounts are embedded on the user document, so
 * they arrive with /api/auth/me and cost no extra request. Same arrangement as
 * useCategories, and for the same reasons.
 *
 * An empty list is the normal state for anyone who has never made an account,
 * and every piece of account UI hides itself in that case.
 */
export function AccountsProvider({ children }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    setAccounts(user?.accounts ?? []);
  }, [user]);

  const addAccount = useCallback(async ({ name, color }) => {
    const created = await createAccount({ name, color });
    setAccounts((prev) => [...prev, created]);
    return created;
  }, []);

  const updateAccount = useCallback(async (id, changes) => {
    const updated = await patchAccount(id, changes);
    setAccounts((prev) => prev.map((a) => (a.id === id ? updated : a)));
    return updated;
  }, []);

  const removeAccount = useCallback(async (id) => {
    await deleteAccount(id);
    setAccounts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const value = useMemo(() => {
    // Archived accounts keep their history and still appear in totals, but
    // can't be picked for anything new.
    const active = accounts.filter((a) => !a.archived);
    const byId = Object.fromEntries(accounts.map((a) => [a.id, a]));

    return {
      accounts,
      active,
      hasAccounts: active.length > 0,
      getAccount: (id) => (id ? byId[id] : undefined),
      addAccount,
      updateAccount,
      removeAccount,
      /** The account to preselect: last used if it's still pickable, else the first. */
      defaultAccountId: () => {
        const last = localStorage.getItem(LAST_USED_KEY);
        if (last && active.some((a) => a.id === last)) return last;
        return active[0]?.id ?? "";
      },
      rememberAccount: (id) => {
        if (id) localStorage.setItem(LAST_USED_KEY, id);
      },
    };
  }, [accounts, addAccount, updateAccount, removeAccount]);

  return (
    <AccountsContext.Provider value={value}>{children}</AccountsContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within AccountsProvider");
  return ctx;
}
