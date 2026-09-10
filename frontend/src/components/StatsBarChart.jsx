import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import { formatMoney } from "@/lib/utils";

/**
 * Saved-vs-Spent monthly bars for the History view. Split out of StatsPage and
 * loaded with React.lazy so recharts (~113KB gzipped) sits in this chunk rather
 * than the eager page chunk — the History view pulls it in on mount, and no
 * other screen pays for it.
 */
export default function StatsBarChart({ data, colors }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} barGap={4} margin={{ top: 8, right: 12 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={colors.grid} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          fontSize={12}
          stroke={colors.axis}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={12}
          width={48}
          stroke={colors.axis}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          formatter={(v) => formatMoney(v)}
          cursor={{ fill: colors.cursor }}
          contentStyle={{
            borderRadius: 12,
            border: `1px solid ${colors.tooltipBorder}`,
            background: colors.tooltipBg,
            color: colors.tooltipText,
          }}
          itemStyle={{ color: colors.tooltipText }}
          labelStyle={{ color: colors.tooltipText }}
        />
        <Legend wrapperStyle={{ fontSize: 13 }} />
        <Bar
          dataKey="Saved"
          fill={colors.saved}
          radius={[6, 6, 0, 0]}
          isAnimationActive
          animationBegin={150}
          animationDuration={800}
        />
        <Bar
          dataKey="Spent"
          fill={colors.spent}
          radius={[6, 6, 0, 0]}
          isAnimationActive
          animationBegin={350}
          animationDuration={800}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
