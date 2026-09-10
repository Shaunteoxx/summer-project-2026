import { useReducedMotion } from "framer-motion";
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { formatMoney } from "@/lib/utils";
import { formatDay } from "@/lib/period";

/**
 * Custom X tick. Ticks are placed by position within whatever slice of the
 * period is on screen — first, every 5th, and today — and labelled with the
 * day of the month, since a period can span more than one calendar month.
 */
function DayTick({ x, y, payload, days, today, axis, primary }) {
  const i = days.findIndex((d) => d.ymd === payload.value);
  if (i === -1) return null;
  const todayIndex = days.findIndex((d) => d.ymd === today);
  const day = days[i].day;
  if (!(i === 0 || i % 5 === 0 || i === todayIndex)) return null;
  const isToday = i === todayIndex;
  // Today's label wins when a regular label would collide with it.
  if (!isToday && todayIndex >= 0 && Math.abs(i - todayIndex) <= 1) return null;
  return (
    <text
      x={x}
      y={y + 10}
      textAnchor="middle"
      fontSize={10.5}
      fontWeight={isToday ? 600 : 400}
      fill={isToday ? primary : axis}
    >
      {day}
    </text>
  );
}

/**
 * The daily bar+line chart, split out of DailySpendingCard and loaded with
 * React.lazy. recharts (~113KB gzipped) lives in this chunk, so it only
 * downloads when someone actually switches to the Chart view — the
 * calendar-and-donuts default of the Tracker never pays for it.
 */
export default function DailySpendingChart({
  days,
  colors,
  todayYmd,
  budgetsAvailable,
  onSelectDay,
}) {
  const reduced = useReducedMotion();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={days} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
        {/* No gridlines — a single baseline instead, per the chart rules. The
            Y labels carry the scale. */}
        <XAxis
          dataKey="ymd"
          interval={0}
          tickLine={false}
          axisLine={{ stroke: colors.grid }}
          tick={
            <DayTick
              days={days}
              today={todayYmd}
              axis={colors.axis}
              primary={colors.primary}
            />
          }
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          fontSize={10.5}
          width={44}
          stroke={colors.axis}
          tickFormatter={(v) => `$${v}`}
        />
        <Tooltip
          cursor={{ fill: colors.cursor }}
          formatter={(v, name) => [formatMoney(v), name]}
          labelFormatter={(key) => formatDay(key)}
          contentStyle={{
            borderRadius: 12,
            border: `1px solid ${colors.tooltipBorder}`,
            background: colors.tooltipBg,
            color: colors.tooltipText,
          }}
          itemStyle={{ color: colors.tooltipText }}
          labelStyle={{ color: colors.tooltipText }}
        />
        <Bar
          dataKey="amount"
          name="Spent"
          radius={[4, 4, 0, 0]}
          isAnimationActive={!reduced}
          animationDuration={800}
          onClick={(_, index) => onSelectDay(days[index])}
          cursor="pointer"
        >
          {days.map((d) => (
            <Cell
              key={d.ymd}
              fill={
                d.amount === 0
                  ? "transparent"
                  : d.over
                    ? colors.over
                    : colors.spent
              }
              // Today is outlined; red when over its own budget.
              stroke={d.isToday ? (d.over ? colors.over : colors.primary) : "none"}
              strokeWidth={d.isToday ? 1.5 : 0}
            />
          ))}
        </Bar>
        {budgetsAvailable && (
          <Line
            type="stepAfter"
            dataKey="budget"
            name="Budget"
            stroke={colors.primary}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            dot={false}
            activeDot={false}
            connectNulls={false}
            isAnimationActive={!reduced}
          />
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
