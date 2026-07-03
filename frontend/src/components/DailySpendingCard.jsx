import { motion, useReducedMotion } from "framer-motion";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import { useChartColors } from "@/hooks/useChartColors";
import { monthName, formatMoney } from "@/lib/utils";
import { fadeUp } from "@/animations/variants";

/** Custom X tick: label days 1, every 5th, and today (today bold + accented). */
function DayTick({ x, y, payload, today, axis, primary }) {
  const day = payload.value;
  if (!(day === 1 || day % 5 === 0 || day === today)) return null;
  const isToday = day === today;
  return (
    <text
      x={x}
      y={y + 10}
      textAnchor="middle"
      fontSize={10}
      fontWeight={isToday ? 700 : 400}
      fill={isToday ? primary : axis}
    >
      {day}
    </text>
  );
}

/**
 * Daily spending tracker — one bar per day of the current month.
 * Bars turn red when that day went over the daily budget; today is outlined
 * and its axis label accented. A dashed reference line marks the daily budget
 * (income minus the month's savings target, spread evenly over the month).
 */
export default function DailySpendingCard({ transactions = [], income = 0, monthlySavings = 0 }) {
  const colors = useChartColors();
  const reduce = useReducedMotion();

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Sum expenses per calendar day for the current month.
  const spentByDay = new Array(daysInMonth + 1).fill(0);
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const d = new Date(t.date);
    if (d.getFullYear() !== year || d.getMonth() !== month) continue;
    spentByDay[d.getDate()] += t.amount;
  }

  const dailyBudget = income > 0 ? Math.max(0, income - monthlySavings) / daysInMonth : 0;

  const data = [];
  let totalSpent = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const amount = spentByDay[day];
    totalSpent += amount;
    data.push({
      day,
      amount,
      isToday: day === todayDate,
      over: dailyBudget > 0 && amount > dailyBudget + 1e-9,
    });
  }
  const avgPerDay = todayDate > 0 ? totalSpent / todayDate : 0;
  const hasSpending = totalSpent > 0;

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Daily spending</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {monthName(month)} {year}
              </p>
            </div>
            <div className="text-right">
              <p className="text-lg font-extrabold leading-none tracking-tight tabular-nums">
                {formatMoney(totalSpent)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                {formatMoney(avgPerDay)}/day avg
              </p>
            </div>
          </div>

          {hasSpending ? (
            <>
              <div className="mt-4 h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 6, right: 4, left: 0, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke={colors.grid}
                    />
                    <XAxis
                      dataKey="day"
                      interval={0}
                      tickLine={false}
                      axisLine={false}
                      tick={<DayTick today={todayDate} axis={colors.axis} primary={colors.primary} />}
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      fontSize={11}
                      width={44}
                      stroke={colors.axis}
                      tickFormatter={(v) => `$${v}`}
                    />
                    <Tooltip
                      cursor={{ fill: colors.cursor }}
                      formatter={(v) => [formatMoney(v), "Spent"]}
                      labelFormatter={(day) => `${monthName(month).slice(0, 3)} ${day}`}
                      contentStyle={{
                        borderRadius: 12,
                        border: `1px solid ${colors.tooltipBorder}`,
                        background: colors.tooltipBg,
                        color: colors.tooltipText,
                      }}
                      itemStyle={{ color: colors.tooltipText }}
                      labelStyle={{ color: colors.tooltipText }}
                    />
                    {dailyBudget > 0 && (
                      <ReferenceLine
                        y={dailyBudget}
                        stroke={colors.primary}
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        ifOverflow="extendDomain"
                      />
                    )}
                    <Bar
                      dataKey="amount"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={!reduce}
                      animationDuration={800}
                    >
                      {data.map((d) => (
                        <Cell
                          key={d.day}
                          fill={d.amount === 0 ? "transparent" : d.over ? colors.over : colors.spent}
                          // Today is outlined; red when today is over the daily average, else green.
                          stroke={
                            d.isToday
                              ? d.amount > avgPerDay + 1e-9
                                ? colors.over
                                : colors.primary
                              : "none"
                          }
                          strokeWidth={d.isToday ? 1.5 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Legend / context */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {dailyBudget > 0 && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: colors.primary }} />
                    Daily budget {formatMoney(dailyBudget)}
                  </span>
                )}
                {data.some((d) => d.over) && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm" style={{ background: colors.over }} />
                    Over budget
                  </span>
                )}
              </div>
            </>
          ) : (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No spending logged yet this month. Add an expense on the
              Transactions page to see your daily pattern.
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
