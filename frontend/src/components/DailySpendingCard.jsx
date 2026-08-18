import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
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

import { Card, CardContent } from "@/components/ui/card";
import BottomSheet from "@/components/BottomSheet";
import SpendingCalendar from "@/components/SpendingCalendar";
import { useChartColors } from "@/hooks/useChartColors";
import { useCategories } from "@/hooks/useCategories";
import CategoryIcon from "@/components/CategoryIcon";
import { cn, formatMoney, localToday } from "@/lib/utils";
import {
  formatDay,
  formatMonthLabel,
  formatPeriodLabel,
  periodDayList,
} from "@/lib/period";
import { fadeUp } from "@/animations/variants";

const VIEW_KEY = "spendingView";
// Beyond this, a single grid gets unwieldy (a 100-day period is 15 rows), so
// the calendar splits into one page per calendar month.
const PAGE_ABOVE_DAYS = 45;

/**
 * Split a period's days into calendar pages. Short periods stay on one page —
 * including ones that straddle a month boundary, which read fine in a single
 * grid and keep the whole period visible at a glance.
 */
function buildCalendarPages(days) {
  if (days.length <= PAGE_ABOVE_DAYS) {
    return [{ key: "all", label: null, days }];
  }
  const byMonth = new Map();
  for (const d of days) {
    const key = d.ymd.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(d);
  }
  return [...byMonth.entries()].map(([key, monthDays]) => ({
    key,
    label: formatMonthLabel(monthDays[0].ymd),
    days: monthDays,
  }));
}

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
 * Daily spending tracker for a span of days, as a calendar (default) or a bar
 * chart. Each day is judged against its own rolling budget from the streak —
 * (income − savings target − spent so far) ÷ days left — so a red day here
 * always matches a broken day in the streak, and today's budget is the same
 * number the home page shows.
 *
 * The span can be any length and can straddle a month boundary, so the grid is
 * built from its own date range rather than a calendar month.
 *
 * Budgets are optional. Leave `periodDays` empty (or `income` at 0) and every
 * verdict switches off together — no tints, no budget line, no legend, no
 * per-day budget in the detail sheet — leaving a plain record of what was
 * spent. /stats uses it that way: it spans months with different budgets, and
 * a verdict there would have to pick one to judge against. Day amounts fall
 * back to the transactions themselves, so they stay correct either way.
 */
export default function DailySpendingCard({
  transactions = [],
  income = 0,
  period,
  periodDays = [],
  todayBudget = 0,
  subtitle,
  emptyMessage = "No spending logged yet this period. Add an expense on the Transactions page to see your daily pattern.",
}) {
  const colors = useChartColors();
  const reduce = useReducedMotion();
  const { getCategory } = useCategories();
  const [view, setView] = useState(
    () => localStorage.getItem(VIEW_KEY) || "calendar"
  );
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(null);

  const todayYmd = localToday();

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

  const budgetByDay = new Map(periodDays.map((d) => [d.date, d]));
  const budgetsAvailable = income > 0 && periodDays.length > 0;

  const days = [];
  let totalSpent = 0;
  let elapsed = 0;
  periodDayList(period).forEach((key, index) => {
    const entry = budgetByDay.get(key);
    const txns = txnsByDay.get(key) ?? [];
    const amount = entry
      ? entry.spent
      : txns.reduce((sum, t) => sum + t.amount, 0);
    totalSpent += amount;
    const isFuture = key > todayYmd;
    if (!isFuture) elapsed += 1;
    const date = new Date(`${key}T00:00:00.000Z`);
    // Clamp negative budgets (overspent periods) to 0: any spend is then over.
    const budget =
      budgetsAvailable && entry && !isFuture ? Math.max(0, entry.budget) : null;
    days.push({
      ymd: key,
      index,
      day: date.getUTCDate(),
      monthIdx: date.getUTCMonth(),
      // First day of a month inside the period — the grid labels these so a
      // period spanning two months stays readable.
      startsMonth: date.getUTCDate() === 1,
      amount,
      budget,
      over: budget !== null && amount > budget + 1e-9,
      isToday: key === todayYmd,
      isFuture,
      txns,
    });
  });
  const avgPerDay = elapsed > 0 ? totalSpent / elapsed : 0;
  const hasSpending = totalSpent > 0;
  const anyOver = days.some((d) => d.over);

  // Calendar paging. `page` stays null until the user moves, so the view
  // follows today by default and survives the period changing underneath it.
  const pages = buildCalendarPages(days);
  const paginated = pages.length > 1;
  const todayPage = Math.max(
    0,
    pages.findIndex((p) => p.days.some((d) => d.isToday))
  );
  const activePage = Math.min(page ?? todayPage, pages.length - 1);
  const shownDays = pages[activePage]?.days ?? [];
  const pageSpent = shownDays.reduce((sum, d) => sum + d.amount, 0);

  const switchView = (v) => {
    setView(v);
    localStorage.setItem(VIEW_KEY, v);
  };

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card>
        <CardContent className="px-[18px] py-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-[-0.015em]">Daily Spending</h2>
              <p className="mt-0.5 text-[12px] text-ink-3">
                {subtitle ?? formatPeriodLabel(period)}
              </p>
            </div>
            <div className="text-right">
              <p className="num text-[19px] font-medium leading-none">
                {formatMoney(totalSpent)}
              </p>
              <p className="num mt-1 text-[12px] text-ink-3">
                {formatMoney(avgPerDay)}/day avg
              </p>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3">
            <div
              className="flex gap-0.5 rounded-md bg-surface-2 p-[3px]"
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
              <p className="num text-[12px] text-ink-3">
                Today's budget{" "}
                <span className="font-medium text-ink">
                  {formatMoney(todayBudget)}
                </span>
              </p>
            )}
          </div>

          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
            {view === "chart"
              ? "Tap above a bar for a summary, or tap the bar for that day's transactions."
              : "Tap a day to see its transactions."}
          </p>

          {hasSpending ? (
            <>
              {/* One pager for both views, so switching keeps your place. */}
              {paginated && (
                <PagePicker
                  label={pages[activePage]?.label}
                  spent={pageSpent}
                  index={activePage}
                  count={pages.length}
                  onChange={setPage}
                />
              )}
              {view === "calendar" ? (
                <div className={paginated ? "mt-2.5" : "mt-4"}>
                  <SpendingCalendar
                    days={shownDays}
                    budgetsAvailable={budgetsAvailable}
                    showMonthTags={!paginated}
                    onSelectDay={setSelected}
                  />
                </div>
              ) : (
                <div className={paginated ? "mt-2.5 h-52" : "mt-4 h-52"}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={shownDays}
                      margin={{ top: 6, right: 4, left: 0, bottom: 0 }}
                    >
                      {/* No gridlines — a single baseline instead, per the
                          chart rules. The Y labels carry the scale. */}
                      <XAxis
                        dataKey="ymd"
                        interval={0}
                        tickLine={false}
                        axisLine={{ stroke: colors.grid }}
                        tick={
                          <DayTick
                            days={shownDays}
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
                        isAnimationActive={!reduce}
                        animationDuration={800}
                        onClick={(_, index) => setSelected(shownDays[index])}
                        cursor="pointer"
                      >
                        {shownDays.map((d) => (
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
              <div className="mt-4 flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t border-hairline pt-3.5 text-[11.5px] text-ink-3">
                {budgetsAvailable &&
                  (view === "chart" ? (
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-0 w-4 border-t-2 border-dashed"
                        style={{ borderColor: colors.primary }}
                      />
                      Daily Budget
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <span className="h-[9px] w-[9px] rounded-[3px] border border-positive bg-positive/20" />
                      Within Budget
                    </span>
                  ))}
                {anyOver && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-[9px] w-[9px] rounded-[3px] border border-negative bg-negative/20" />
                    Over That Day's Budget
                  </span>
                )}
              </div>
              {budgetsAvailable && (
                <p className="mt-2.5 text-[12px] leading-relaxed text-ink-3">
                  Your budget adapts daily: remaining income after savings ÷
                  days left.
                </p>
              )}
            </>
          ) : (
            <div className="flex h-40 items-center justify-center px-6 text-center text-[13px] leading-relaxed text-ink-3">
              {emptyMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Day detail sheet */}
      <BottomSheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? formatDay(selected.ymd, { withYear: true }) : ""}
      >
        {selected && (
          <div className="pb-2">
            <div className="flex items-center justify-between rounded-md bg-surface-2 p-3.5">
              <div>
                <p className="text-[11.5px] text-ink-3">Spent</p>
                <p className="num mt-1 text-[19px] font-medium">
                  {formatMoney(selected.amount)}
                </p>
              </div>
              {selected.budget !== null && (
                <div className="text-right">
                  <p className="text-[11.5px] text-ink-3">Budget That Day</p>
                  <p className="num mt-1 text-[19px] font-medium">
                    {formatMoney(selected.budget)}
                  </p>
                </div>
              )}
            </div>

            {selected.budget !== null && (
              <p
                className={cn(
                  "mt-2.5 text-[13px] font-medium",
                  selected.over ? "text-negative" : "text-positive"
                )}
              >
                {selected.over
                  ? `${formatMoney(selected.amount - selected.budget)} over budget`
                  : "Within Budget"}
              </p>
            )}

            <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
              {selected.txns.length > 0 ? (
                selected.txns.map((t) => {
                  const cat = getCategory(t.category);
                  return (
                    <div
                      key={t._id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-hairline p-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <CategoryIcon category={cat} />
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-medium tracking-[-0.01em]">
                            {t.description}
                          </p>
                          <p className="mt-0.5 text-meta text-ink-3">
                            {t.category}
                          </p>
                        </div>
                      </div>
                      <span className="num shrink-0 text-[15px] font-medium text-ink">
                        −{formatMoney(t.amount)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="py-2 text-center text-[13px] text-ink-3">
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

function PagePicker({ label, spent, index, count, onChange }) {
  const step = (delta) => onChange(Math.min(count - 1, Math.max(0, index + delta)));
  return (
    <div className="mt-4 flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={() => step(-1)}
        disabled={index === 0}
        aria-label="Previous month"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-surface-2 text-ink-2 transition-colors duration-base ease-out hover:bg-surface-3 disabled:opacity-30 disabled:hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <div className="text-center">
        <p className="text-[14.5px] font-semibold leading-none tracking-[-0.01em]">{label}</p>
        <p className="num mt-1 text-[11.5px] text-ink-3">
          {formatMoney(spent)} · {index + 1} of {count}
        </p>
      </div>
      <button
        type="button"
        onClick={() => step(1)}
        disabled={index === count - 1}
        aria-label="Next month"
        className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-surface-2 text-ink-2 transition-colors duration-base ease-out hover:bg-surface-3 disabled:opacity-30 disabled:hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
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
        "flex h-7 w-9 items-center justify-center rounded-[9px] transition-colors duration-base ease-out",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-surface text-ink shadow-card dark:bg-surface-3"
          : "text-ink-3 hover:text-ink-2"
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
