import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import { Tag } from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import { addCustomCategory, removeCustomCategory } from "@/api/endpoints";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  FALLBACK_COLOR,
} from "@/lib/categories";

const CategoriesContext = createContext(null);

// Custom categories have no lucide icon, so they render with a generic Tag.
const toDisplay = (c) => ({
  id: c.id,
  name: c.name,
  type: c.type,
  color: c.color,
  icon: Tag,
  custom: true,
});

/**
 * Merges the fixed built-in categories with the user's custom ones and exposes
 * a single lookup + CRUD surface. Seeds from the auth profile (no extra request
 * on load) and keeps an optimistic local copy as the user adds/removes.
 */
export function CategoriesProvider({ children }) {
  const { user } = useAuth();
  const [custom, setCustom] = useState([]);

  useEffect(() => {
    setCustom(user?.customCategories ?? []);
  }, [user]);

  const addCategory = useCallback(async ({ name, type, color }) => {
    const created = await addCustomCategory({ name, type, color });
    setCustom((prev) => [...prev, created]);
    return created;
  }, []);

  const removeCategory = useCallback(async (id) => {
    await removeCustomCategory(id);
    setCustom((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const value = useMemo(() => {
    const customDisplay = custom.map(toDisplay);
    const categoriesByType = {
      expense: [
        ...EXPENSE_CATEGORIES,
        ...customDisplay.filter((c) => c.type === "expense"),
      ],
      income: [
        ...INCOME_CATEGORIES,
        ...customDisplay.filter((c) => c.type === "income"),
      ],
    };

    const byName = {};
    for (const c of [...categoriesByType.expense, ...categoriesByType.income]) {
      byName[c.name] = c;
    }
    const getCategory = (name) =>
      byName[name] ?? { name, icon: Tag, color: FALLBACK_COLOR };

    return { custom, categoriesByType, getCategory, addCategory, removeCategory };
  }, [custom, addCategory, removeCategory]);

  return (
    <CategoriesContext.Provider value={value}>
      {children}
    </CategoriesContext.Provider>
  );
}

export function useCategories() {
  const ctx = useContext(CategoriesContext);
  if (!ctx) throw new Error("useCategories must be used within CategoriesProvider");
  return ctx;
}
