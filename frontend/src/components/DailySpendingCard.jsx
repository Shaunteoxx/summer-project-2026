import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, CalendarDays } from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { Card, CardContent } from "@/components/ui/card";
import BottomSheet from "@/components/BottomSheet";
import SpendingCalendar from "@/components/SpendingCalendar";
import { useChartColors } from "@/hooks/useChartColors";
import { useCategories } from "@/hooks/useCategories";
import { cn, monthName, formatMoney, localToday } from "@/lib/utils";
import { fadeUp } from "@/animations/variants";

const VIEW_KEY = "spendingView";

/** Custom X tick: label days 1, every 5th, and today (today bold + accented). */
function DayTick({ x, y, payload, today, axis, primary }) {
  const day = payload.value;
  if (!(day === 1 || day % 5 === 0 || day === today)) return null;
  const isToday = day === today;
  // Today's label wins when a regular label would collide with it.
  if (!isToday && Math.abs(day - today) <= 1) return null;
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
 * Daily spending tracker for the current month, as a calendar (default) or a
 * bar chart. Each day is judged against its own rolling budget from the streak
 * — (income − savings target − spent so far) ÷ days left — so a red day here
 * always matches a broken day in the streak, and today's budget is the same
 * number the home page shows.
 */
export default function DailySpendingCard({
  transactions = [],
  income = 0,
  monthlySavings = 0,
  monthDays = [],
  todayBudget = 0,
}) {
  const colors = useChartColors();
  const reduce = useReducedMotion();
  const { getCategory } = useCategories();
  const [view, setView] = useState(
    () => localStorage.getItem(VIEW_KEY) || "calendar"
  );
  const [selected, setSelected] = useState(null);

  const todayYmd = localToday();
  const [year, monthNum, todayDate] = todayYmd.split("-").map(Number);
  const monthIdx = monthNum - 1;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");

  // Expenses grouped by UTC calendar day — transaction dates are stored at UTC
  // midnight, so the ISO prefix matches the streak's day keys exactly.
  const txnsByDay = useMemo(() => {
    const map = new Map();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      const key = String(t.date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(t);
    }
    return map;
  }, [transactions]);

  const budgetByDay = new Map(monthDays.map((d) => [d.date, d]));
  const budgetsAvailable = income > 0 && monthDays.length > 0;

  const days = [];
  let totalSpent = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${pad(monthNum)}-${pad(day)}`;
    const entry = budgetByDay.get(key);
    const txns = txnsByDay.get(key) ?? [];
    const amount = entry
      ? entry.spent
      : txns.reduce((sum, t) => sum + t.amount, 0);
    totalSpent += amount;
    const isFuture = day > todayDate;
    // Clamp negative budgets (overspent months) to 0: any spend is then over.
    const budget =
      budgetsAvailable && entry && !isFuture ? Math.max(0, entry.budget) : null;
    days.push({
      day,
      amount,
      budget,
      over: budget !== null && amount > budget + 1e-9,
      isToday: day === todayDate,
      isFuture,
      txns,
    });
  }
  const avgPerDay = todayDate > 0 ? totalSpent / todayDate : 0;
  const hasSpending = totalSpent > 0;
  const evenPace =
    income > 0 ? Math.max(0, income - monthlySavings) / daysInMonth : 0;
  const anyOver = days.some((d) => d.over);

  const switchView = (v) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Daily spending</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {monthName(monthIdx)} {year}
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

          <div className="mt-3 flex items-center justify-between gap-3">
            <div
              className="flex rounded-lg bg-muted p-0.5"
              role="group"
              aria-label="Daily spending view"
            >
              <ViewToggle
                active={view === "calendar"}
                onClick={() => switchView("calendar")}
                icon={CalendarDays}
                label="Calendar view"
              />
              <ViewToggle
                active={view === "chart"}
                onClick={() => switchView("chart")}
                icon={BarChart3}
                label="Chart view"
              />
            </div>
            {budgetsAvailable && (
              <p className="text-xs text-muted-foreground tabular-nums">
                Today's budget{" "}
                <span className="font-bold text-foreground">
                  {formatMoney(todayBudget)}
                </span>
              </p>
            )}
          </div>

          {hasSpending ? (
            <>
              {view === "calendar" ? (
                <div className="mt-4">
                  <SpendingCalendar
                    days={days}
                    year={year}
                    monthIdx={monthIdx}
                    budgetsAvailable={budgetsAvailable}
                    onSelectDay={setSelected}
                  />
                </div>
              ) : (
                <div className="mt-4 h-52">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={days}
                      margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
                    >
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
                        tick={
                          <DayTick
                            today={todayDate}
                            axis={colors.axis}
                            primary={colors.primary}
                          />
                        }
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
                        formatter={(v, name) => [formatMoney(v), name]}
                        labelFormatter={(day) =>
                          `${monthName(monthIdx).slice(0, 3)} ${day}`
                        }
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
                        isAnimationActive={!reduce}
                        animationDuration={800}
                        onClick={(_, index) => setSelected(days[index])}
                        cursor="pointer"
                      >
                        {days.map((d) => (
                          <Cell
                            key={d.day}
                            fill={
                              d.amount === 0
                                ? "transparent"
                                : d.over
                                  ? colors.over
                                  : colors.spent
                            }
                            // Today is outlined; red when over its own budget.
                            stroke={
                              d.isToday
                                ? d.over
                                  ? colors.over
                                  : colors.primary
                                : "none"
                            }
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
                          isAnimationActive={!reduce}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Legend / context */}
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                {budgetsAvailable &&
                  (view === "chart" ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-0 w-4 border-t-2 border-dashed"
                        style={{ borderColor: colors.primary }}
                      />
                      Daily budget
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2.5 w-2.5 rounded-sm bg-success/30" />
                      Within budget
                    </span>
                  ))}
                {anyOver && (
                  <span className="flex items-center gap-1.5">
                    <span
                      className="h-2.5 w-2.5 rounded-sm"
                      style={{ background: colors.over }}
                    />
                    Over that day's budget
                  </span>
                )}
              </div>
              {budgetsAvailable && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Your budget adapts each day: what's left of income after
                  savings ÷ days remaining. Even pace would be{" "}
                  {formatMoney(evenPace)}/day.
                </p>
              )}
            </>
          ) : (
            <div className="flex h-40 items-center justify-center px-6 text-center text-sm text-muted-foreground">
              No spending logged yet this month. Add an expense on the
              Transactions page to see your daily pattern.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail sheet */}
      <BottomSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? `${monthName(monthIdx)} ${selected.day}` : ""}
      >
        {selected && (
          <div className="pb-2">
            <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Spent</p>
                <p className="font-bold tabular-nums">
                  {formatMoney(selected.amount)}
                </p>
              </div>
              {selected.budget !== null && (
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    Budget that day
                  </p>
                  <p className="font-bold tabular-nums">
                    {formatMoney(selected.budget)}
                  </p>
                </div>
              )}
            </div>

            {selected.budget !== null && (
              <p
                className={cn(
                  "mt-2 text-sm font-medium",
                  selected.over ? "text-destructive" : "text-success"
                )}
              >
                {selected.over
                  ? `${formatMoney(selected.amount - selected.budget)} over budget`
                  : "Within budget"}
              </p>
            )}

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {selected.txns.length > 0 ? (
                selected.txns.map((t) => {
                  const cat = getCategory(t.category);
                  const Icon = cat.icon;
                  return (
                    <div
                      key={t._id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/70 p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                          style={{
                            backgroundColor: `${cat.color}22`,
                            color: cat.color,
                          }}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold">
                            {t.description}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {t.category}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 font-bold tabular-nums text-destructive">
                        −{formatMoney(t.amount)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="py-2 text-center text-sm text-muted-foreground">
                  No spending logged this day.
                </p>
              )}
            </div>
          </div>
        )}
      </BottomSheet>
    </motion.div>
  );
}

function ViewToggle({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-7 w-9 items-center justify-center rounded-md transition-colors",
        active
          ? "bg-card text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
