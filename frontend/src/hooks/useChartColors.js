import { useTheme } from "@/hooks/useTheme";

/**
 * Recharts can't read CSS variables directly, so resolve concrete colors
 * from the active theme. Keeps charts legible in both light and dark mode.
 */
export function useChartColors() {
  const { isDark } = useTheme();

  return {
    saved: isDark ? "hsl(152 62% 50%)" : "hsl(152 56% 38%)",
    spent: isDark ? "hsl(220 14% 42%)" : "hsl(150 12% 70%)",
    grid: isDark ? "hsl(220 18% 22%)" : "hsl(150 18% 90%)",
    axis: isDark ? "hsl(215 14% 62%)" : "hsl(155 10% 45%)",
    cursor: isDark ? "hsl(220 20% 18% / 0.6)" : "hsl(150 20% 95%)",
    tooltipBg: isDark ? "hsl(222 26% 13%)" : "hsl(0 0% 100%)",
    tooltipBorder: isDark ? "hsl(220 18% 24%)" : "hsl(150 18% 88%)",
    tooltipText: isDark ? "hsl(210 24% 95%)" : "hsl(160 32% 12%)",
  };
}
