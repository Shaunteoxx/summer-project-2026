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
 * colours.
 *
 * The palette is generated in OKLCH at fixed lightness and chroma
 * (`oklch(.615 .095 h)`) rather than picked by eye. This matters more than it
 * sounds: HSL lightness is not perceptual, so a set of colours with similar
 * HSL numbers can still land at wildly different apparent brightness, which is
 * what made the previous palette read as a paint spill in the donut. Measured
 * against white these eight span 3.57–3.90 contrast (spread 0.33); the old set
 * spanned 1.31.
 *
 * Hues 150–185 are deliberately skipped — that band belongs to `--positive`,
 * and on the Tracker a teal category sits directly under the saved/spent donut
 * where it would read as a status colour rather than a category.
 *
 * Each category pairs a colour with an icon and a label, so nothing ever
 * depends on colour alone.
 *
 * `short` is the label for the six-across picker in the entry sheet, where a
 * tile is about 53px wide. Only names that can't fit carry one — and only names
 * that are a single unbreakable word need it at all, since anything with a
 * space wraps to the second line on its own. It is a display label and nothing
 * more: `name` is what gets stored, searched and shown everywhere else.
 */
export const EXPENSE_CATEGORIES = [
  { name: "F & B", icon: Utensils, color: "#CC624E", token: "food" },
  { name: "Transport", icon: Bus, color: "#B9740F", token: "transport" },
  { name: "Shopping", icon: ShoppingBag, color: "#659734", token: "shopping" },
  {
    name: "Entertainment",
    short: "Fun",
    icon: Clapperboard,
    color: "#139A94",
    token: "entertainment",
  },
  { name: "Travel", icon: Plane, color: "#1290CC", token: "travel" },
];

export const INCOME_CATEGORIES = [
  { name: "Allowance", icon: Wallet, color: "#7A79D7", token: "allowance" },
  { name: "Job", icon: Briefcase, color: "#A968BC", token: "job" },
  { name: "Gifts", icon: Gift, color: "#C45F8F", token: "gifts" },
];

/** Dark-mode variants, lifted to oklch(.775 .100 h) so they hold on #141416. */
export const CATEGORY_COLORS_DARK = {
  "F & B": "#FE9580",
  Transport: "#F0A346",
  Shopping: "#94C866",
  Entertainment: "#1ED0C8",
  Travel: "#5DC1FD",
  Allowance: "#AAADFD",
  Job: "#DB98EF",
  Gifts: "#F98EBF",
};

export const CATEGORIES_BY_TYPE = {
  expense: EXPENSE_CATEGORIES,
  income: INCOME_CATEGORIES,
};

/** Neutral fallback for unknown / deleted categories. Matches ink-3. */
export const FALLBACK_COLOR = "#6B6F74";
export const FALLBACK_COLOR_DARK = "#8A8B90";

/**
 * Palette offered when creating a custom category. Same OKLCH lightness and
 * chroma as the built-ins so a custom category can't be brighter or muddier
 * than the fixed set, but drawn from the hue gaps between them (and still
 * clear of the reserved 150–185 green band).
 */
export const CUSTOM_COLOR_OPTIONS = [
  "#CA5D76", // oklch(.620 .140   8) — red, between gifts and food
  "#C7692C", // oklch(.620 .140  50) — amber, between food and transport
  "#988705", // oklch(.620 .128 100) — olive, between transport and shopping
  "#0796AE", // oklch(.620 .108 214) — azure, between entertainment and travel
  "#5285D9", // oklch(.620 .140 260) — periwinkle, between travel and allowance
  "#B862A7", // oklch(.620 .140 335) — orchid, between job and gifts
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

/**
 * Theme-aware colour for a category. Custom categories store a single colour
 * and are used as-is; only the built-ins have a lifted dark variant.
 */
export function categoryColor(category, isDark) {
  if (!category) return isDark ? FALLBACK_COLOR_DARK : FALLBACK_COLOR;
  if (isDark && CATEGORY_COLORS_DARK[category.name]) {
    return CATEGORY_COLORS_DARK[category.name];
  }
  return category.color ?? (isDark ? FALLBACK_COLOR_DARK : FALLBACK_COLOR);
}
