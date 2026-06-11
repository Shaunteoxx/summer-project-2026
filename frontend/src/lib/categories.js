import {
  Utensils,
  Bus,
  ShoppingBag,
  Clapperboard,
  Plane,
  Wallet,
  Briefcase,
  Gift,
  Tag,
} from "lucide-react";

/**
 * Category definitions — the single source of truth for labels, icons and
 * colors. Colors are a muted palette (mid-saturation) so the donut chart reads
 * as cohesive rather than a clash of vivid primaries, and stays legible in both
 * light and dark mode. Each category pairs a color with an icon + label so we
 * never rely on color alone (accessibility).
 */
export const EXPENSE_CATEGORIES = [
  { name: "Food & Drinks", icon: Utensils, color: "#C2855A" },
  { name: "Transport", icon: Bus, color: "#6B9CC2" },
  { name: "Shopping", icon: ShoppingBag, color: "#9B7EC8" },
  { name: "Entertainment", icon: Clapperboard, color: "#C2A84E" },
  { name: "Travel", icon: Plane, color: "#5BA8A0" },
];

export const INCOME_CATEGORIES = [
  { name: "Allowance", icon: Wallet, color: "#5BA88C" },
  { name: "Job", icon: Briefcase, color: "#6B85C2" },
  { name: "Gifts", icon: Gift, color: "#C77FA6" },
];

export const CATEGORIES_BY_TYPE = {
  expense: EXPENSE_CATEGORIES,
  income: INCOME_CATEGORIES,
};

// Neutral fallback used for unknown / deleted categories.
export const FALLBACK_COLOR = "#94A3B8";

// Palette offered when creating a custom category. Same muted family as the
// built-ins, but deliberately drawn from the open gaps of the colour wheel so a
// custom category never collides with a fixed one (red / olive / green / slate
// / plum / raspberry vs. the built-in terracotta, gold, teal, blue, purple).
export const CUSTOM_COLOR_OPTIONS = [
  "#C26B6B", // dusty red
  "#9CA85B", // olive
  "#7CB37C", // sage green
  "#8A93A6", // slate
  "#A86BA8", // plum
  "#C25B7D", // raspberry
];

const ALL = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];
const BY_NAME = Object.fromEntries(ALL.map((c) => [c.name, c]));

/**
 * Look up a fixed category by name, with a neutral fallback. Components that
 * also need custom categories should use the `useCategories` context instead,
 * which layers the user's custom list on top of these built-ins.
 */
export function getCategory(name) {
  return BY_NAME[name] ?? { name, icon: Tag, color: FALLBACK_COLOR };
}
