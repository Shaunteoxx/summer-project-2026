import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
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

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import DailySpendingCard from "@/components/DailySpendingCard";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAllSummaries, fetchTransactions } from "@/api/endpoints";
import { monthName, formatMoney, localToday, LOCALE } from "@/lib/utils";
import { useChartColors } from "@/hooks/useChartColors";
import { useToast } from "@/hooks/useToast";
import { fadeUp, staggerContainer, fadeScaleItem } from "@/animations/variants";

/**
 * How far back the day-by-day calendar reaches. The headline figures and the
 * bar chart run on /summary aggregates and stay genuinely all-time; only the
 * calendar is windowed, because it needs every transaction in its span and
 * that request grows without limit as history does.
 */
const CALENDAR_MONTHS = 12;

/** First day of the earliest month with any activity, as YYYY-MM-DD. */
function historyStart(summaries) {
  if (summaries.length === 0) return null;
  // Summaries arrive oldest-first from /summary/all.
  const { year, month } = summaries[0];
  return `${year}-${String(month + 1).padStart(2, "0")}-01`;
}

/**
 * The window the calendar covers: everything you've tracked, or the last
 * CALENDAR_MONTHS whole calendar months, whichever is shorter. Aligned to the
 * 1st because the calendar's pager steps a month at a time — a window starting
 * mid-month would open on a stub page.
 */
function calendarSpan(summaries, today) {
  const first = historyStart(summaries);
  if (!first) return null;
  const now = new Date(`${today}T00:00:00.000Z`);
  const floor = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (CALENDAR_MONTHS - 1), 1)
  )
    .toISOString()
    .slice(0, 10);
  const capped = first < floor;
  return { start: capped ? floor : first, end: today, capped };
}

export default function StatsPage() {
  const colors = useChartColors();
  const toast = useToast();
  const [summaries, setSummaries] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAllMonths, setShowAllMonths] = useState(false);
  // "all" totals everything into one set of figures; "months" keeps the
  // per-month lens the page has always had.
  const [lens, setLens] = useState("all");

  const COLLAPSED_COUNT = 3;

  useEffect(() => {
    let cancelled = false;
    fetchAllSummaries()
      .then(async (rows) => {
        if (cancelled) return;
        setSummaries(rows);
        const span = calendarSpan(rows, localToday());
        if (!span) return;
        // The calendar needs the transactions themselves to show what a day
        // went on, so this fetches its whole window. Failing here costs the
        // calendar, not the page.
        const txns = await fetchTransactions({
          start: span.start,
          end: span.end,
        }).catch(() => []);
        if (!cancelled) setTransactions(txns);
      })
      .catch(() => toast.error("Couldn't load your monthly history. Please try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const data = summaries.map((s) => ({
    label: `${monthName(s.month).slice(0, 3)} ${String(s.year).slice(2)}`,
    Saved: Math.max(s.totalSaved, 0),
    Spent: s.totalExpenses,
  }));

  // Headline insights across the tracked history.
  const monthsTracked = summaries.length;
  // The mean of each month's rate — every month counts equally, so a $50 month
  // weighs as much as a $2,000 one. Deliberately not the same number as the
  // all-time rate below, which is why they're labelled apart.
  //
  // `percentageSaved` divides by income. That's defensible for the finished
  // months this average is mostly made of, and it's the figure the backend
  // has always returned, so it stays.
  //
  // But be honest about the edge: this list includes the *running* month, and
  // its row reads "77% saved" on day 18 for the same reason Home's tile used
  // to — most of that money is still earmarked. Home now derives "Unspent So
  // Far" from its budget-denominated pace bar instead. Don't "fix" Stats to
  // match Home: for a history view the income denominator is the right one,
  // and the two answer different questions. The open question is whether the
  // in-progress row should be labelled apart from the finished ones.
  const avgSavingsRate = monthsTracked
    ? Math.round(
        summaries.reduce((acc, s) => acc + (s.percentageSaved ?? 0), 0) /
          monthsTracked
      )
    : 0;

  const lifetime = summaries.reduce(
    (acc, s) => {
      acc.income += s.totalIncome;
      acc.spent += s.totalExpenses;
      return acc;
    },
    { income: 0, spent: 0 }
  );
  const lifetimeSaved = lifetime.income - lifetime.spent;
  // Every dollar counts once, so months with more income pull harder. This is
  // the honest "of everything you've earned, how much did you keep".
  const lifetimeRate =
    lifetime.income > 0 ? Math.round((lifetimeSaved / lifetime.income) * 100) : 0;

  const historySpan = calendarSpan(summaries, localToday());

  // This list includes the month currently running, and that row is not like
  // the others: its `percentageSaved` divides money not yet spent by income,
  // so on day 2 it reads ~97%. For a finished month that figure is a real
  // savings rate; for this one it's a rate that will fall every time the
  // reader buys lunch. Same wording as Home and Tracker — "unspent so far",
  // not "saved" — so the one in-progress row stops claiming to be an outcome.
  const [todayYear, todayMonth] = (() => {
    const d = localToday().split("-");
    return [Number(d[0]), Number(d[1]) - 1];
  })();
  const isRunningMonth = (s) => s.year === todayYear && s.month === todayMonth;

  // The all-time totals sum that same partial month in, which matters most for
  // the reader who can least afford it: with one month tracked, "Total Saved"
  // *is* the running month and reads like an achievement on day 2. The share
  // shrinks as history builds, so the fix isn't to rename the tile — across
  // three years the income denominator is asking the right question — nor to
  // drop the month from the totals, when the lens promises "everything
  // totalled". Naming the caveat is enough, and only on the two tiles that
  // make a claim: Earned and Spent are sums, and hinting all four would turn
  // the caveat into wallpaper.
  const partialMonth = summaries.some(isRunningMonth)
    ? "Includes this month, still running"
    : undefined;

  // Summaries arrive oldest-first; show the breakdown newest-first, collapsed
  // to the most recent few until the user asks to see all months.
  const monthsNewestFirst = [...summaries].reverse();
  const visibleMonths = showAllMonths
    ? monthsNewestFirst
    : monthsNewestFirst.slice(0, COLLAPSED_COUNT);

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-title-lg">All Months</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Savings vs spending across every month you've tracked.
        </p>
      </motion.div>

      <div className="mt-5">
        {loading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
              <Card>
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-7 w-12" />
                  <Skeleton className="h-3 w-20" />
                </CardContent>
              </Card>
            </div>
            <Card>
              <CardContent className="p-4">
                <Skeleton className="h-72 w-full" />
              </CardContent>
            </Card>
          </div>
        ) : data.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-[13px] leading-relaxed text-ink-3">
              No monthly data yet. Add some transactions to start building your
              history.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {/* Which lens the headline figures use. The chart and breakdown
                below are per-month by nature and stay put. */}
            <motion.div variants={fadeUp} initial="initial" animate="animate">
              <div
                className="grid grid-cols-2 gap-0.5 rounded-md bg-surface-2 p-[3px]"
                role="group"
                aria-label="Headline figures"
              >
                <LensTab
                  active={lens === "all"}
                  onClick={() => setLens("all")}
                  label="All Time"
                  hint="Everything totalled"
                />
                <LensTab
                  active={lens === "months"}
                  onClick={() => setLens("months")}
                  label="Per Month"
                  hint="Month by month"
                />
              </div>
            </motion.div>

            {/* Headline insights */}
            <motion.div
              key={lens}
              variants={staggerContainer(0.1, 0.05)}
              initial="initial"
              animate="animate"
              className="grid grid-cols-2 gap-3"
            >
              {lens === "all" ? (
                <>
                  <StatTile label="Total Earned" value={lifetime.income} money />
                  <StatTile label="Total Spent" value={lifetime.spent} money />
                  <StatTile
                    label="Total Saved"
                    value={lifetimeSaved}
                    money
                    accent
                    hint={partialMonth}
                  />
                  <StatTile
                    label="Savings Rate"
                    value={lifetimeRate}
                    suffix="%"
                    accent
                    hint={partialMonth}
                    // Named apart from "Average month" so the two rates
                    // disagreeing reads as two questions, not a bug.
                  />
                </>
              ) : (
                <>
                  <StatTile
                    label={monthsTracked === 1 ? "Month Tracked" : "Months Tracked"}
                    value={monthsTracked}
                  />
                  <StatTile
                    label="Average Month"
                    value={avgSavingsRate}
                    suffix="%"
                    accent
                    hint="Each month counts once"
                  />
                </>
              )}
            </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Card>
              <CardContent className="p-4 pl-1">
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} barGap={4} margin={{ top: 8, right: 12 }}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={colors.grid}
                      />
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
                </div>
              </CardContent>
            </Card>
          </motion.div>

          {/* Every day you've tracked. No budgets here on purpose: this spans
              months with different targets, so a verdict would have to pick one
              to judge against. The Tracker does that job for one period. */}
          {historySpan && (
            <DailySpendingCard
              transactions={transactions}
              period={historySpan}
              // Says which it is: claiming "every day" while showing a capped
              // window would quietly misrepresent a gap as a month with no
              // spending. The totals above still cover everything.
              subtitle={
                historySpan.capped
                  ? `The last ${CALENDAR_MONTHS} months`
                  : "Every day you've tracked"
              }
              emptyMessage="No spending logged yet. Add an expense on the Transactions page to see your daily pattern."
            />
          )}

          {/* Per-month breakdown */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <h2 className="mb-2.5 px-0.5 text-overline text-ink-3">
              Monthly breakdown
            </h2>
            <Card>
              <CardContent className="p-2">
                <ul>
                  <AnimatePresence initial={false}>
                    {visibleMonths.map((s) => {
                      const positive = s.totalSaved >= 0;
                      return (
                        <motion.li
                          key={`${s.year}-${s.month}`}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-[13px] last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="text-[15px] font-medium tracking-[-0.01em]">
                              {monthName(s.month)} {s.year}
                            </p>
                            <p className="num mt-0.5 text-meta text-ink-3">
                              +{formatMoney(s.totalIncome)} in · −
                              {formatMoney(s.totalExpenses)} out
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p
                              className={`num text-[15px] font-medium ${
                                positive ? "text-positive" : "text-negative"
                              }`}
                            >
                              {positive ? "+" : "−"}
                              {formatMoney(Math.abs(s.totalSaved))}
                            </p>
                            <p className="num mt-0.5 text-meta text-ink-3">
                              {`${s.percentageSaved}% ${
                                isRunningMonth(s) ? "unspent so far" : "saved"
                              }`}
                            </p>
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>

                {monthsNewestFirst.length > COLLAPSED_COUNT && (
                  <button
                    type="button"
                    onClick={() => setShowAllMonths((v) => !v)}
                    aria-expanded={showAllMonths}
                    className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-sm px-3 py-2.5 text-[13px] font-semibold text-ink-2 transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {showAllMonths
                      ? "Show Less"
                      : `See all ${monthsNewestFirst.length} months`}
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${
                        showAllMonths ? "rotate-180" : ""
                      }`}
                    />
                  </button>
                )}
              </CardContent>
            </Card>
          </motion.div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

export function LensTab({ active, onClick, label, hint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-[9px] px-3 py-2 text-center transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "bg-surface font-semibold text-ink shadow-card dark:bg-surface-3"
          : "text-ink-3 hover:text-ink-2"
      }`}
    >
      <span className="block text-[13px]">{label}</span>
      <span className="block text-[11px] text-ink-3">{hint}</span>
    </button>
  );
}

/**
 * Two of these sit side by side on a 375px phone, so a long total has to shrink
 * rather than spill. "$4,820.50" is about as much as fits at the base size;
 * a year of allowance can reach six figures on the all-time lens.
 */
function valueSizeClass(text) {
  if (text.length > 12) return "text-base";
  if (text.length > 10) return "text-lg";
  if (text.length > 9) return "text-xl";
  return "text-2xl";
}

export function StatTile({ label, value, money, suffix, accent, hint }) {
  // Mirrors what AnimatedNumber will render, so the size is picked from the
  // final string rather than from the value's magnitude. Same pinned locale it
  // uses — this string is only measured, never shown, so an unpinned locale
  // wouldn't be visible here, but it would be the wrong thing to copy.
  const rendered = `${money ? "$" : ""}${Number(value).toLocaleString(LOCALE, {
    minimumFractionDigits: money ? 2 : 0,
    maximumFractionDigits: money ? 2 : 0,
  })}${suffix ?? ""}`;

  return (
    <motion.div variants={fadeScaleItem}>
      <Card className={`h-full ${accent ? "bg-positive/[0.09]" : ""}`}>
        <CardContent className="p-4">
          <p
            className={`font-semibold tracking-tight ${valueSizeClass(rendered)} ${
              accent ? "text-positive" : ""
            }`}
          >
            <AnimatedNumber
              value={value}
              prefix={money ? "$" : undefined}
              decimals={money ? 2 : 0}
              suffix={suffix}
            />
          </p>
          <p className="mt-1 text-meta text-ink-2">{label}</p>
          {hint && (
            <p className="mt-0.5 text-[11px] leading-tight text-ink-3">
              {hint}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
