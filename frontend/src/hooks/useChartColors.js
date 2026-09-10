import { useTheme } from "@/hooks/useTheme";

/**
 * Recharts can't read CSS variables, so resolve concrete colours from the
 * active theme. Values here mirror the tokens in index.css exactly — if one
 * changes, change both.
 *
 * Two rules the chart palette follows:
 *  · `saved` is the one green in the system, the same one income uses. `spent`
 *    is neutral, not red — spending is the normal case, and red has to still
 *    mean "over budget" when it appears.
 *  · `axis` is ink-3 rather than something lighter: axis labels are ~10.5px
 *    text and owe WCAG AA like any other body copy. Only `grid` may go lighter,
 *    since a gridline carries no information on its own.
 */
export function useChartColors() {
  const { isDark } = useTheme();

  return {
    saved: isDark ? "#45D19C" : "#0F7A56",
    // Money set aside: still yours, but not spendable this period. One step
    // back from `saved` rather than a fourth hue, so the ring reads as a single
    // scale — available, committed, gone — instead of three unrelated colours.
    reserved: isDark ? "#2A7D63" : "#7FB8A0",
    spent: isDark ? "#3F4045" : "#C9C9C4",
    // Emphasis (today) + the over-budget signal in the daily tracker.
    primary: isDark ? "#F4F4F3" : "#17181A",
    over: isDark ? "#E9635A" : "#B4342A",
    grid: isDark ? "#232326" : "#E7E7E2",
    axis: isDark ? "#8A8B90" : "#6B6F74",
    cursor: isDark ? "rgba(255,255,255,0.04)" : "rgba(23,24,26,0.04)",
    tooltipBg: isDark ? "#1D1D20" : "#FFFFFF",
    tooltipBorder: isDark ? "#303035" : "#E7E7E2",
    tooltipText: isDark ? "#F4F4F3" : "#17181A",
    ink: isDark ? "#F4F4F3" : "#17181A",
    ink3: isDark ? "#8A8B90" : "#6B6F74",
    surface2: isDark ? "#1D1D20" : "#F3F3F0",
  };
}
