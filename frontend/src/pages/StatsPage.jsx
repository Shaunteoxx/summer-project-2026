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
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
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

/** A summary row's month as the "YYYY-MM" key the cycle list is grouped by. */
const monthKey = (s) => `${s.year}-${String(s.month + 1).padStart(2, "0")}`;

/** Last day of the calendar month a "YYYY-MM-DD" starts, in UTC. */
function lastDayOfMonth(ymd) {
  const year = Number(ymd.slice(0, 4));
  const month = Number(ymd.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

/**
 * `"YYYY-MM" -> what that month's share of an allowance was`, from the budget
 * period's cycle list.
 *
 * Only whole calendar months are taken. A term that starts mid-month has a
 * first cycle covering, say, 15–31 July while the summary row for July covers
 * all of it — charging the share against the whole month's spending would
 * count purchases made before the term began. That month keeps its own income,
 * which is where the lump sum usually landed anyway.
 */
function fundingByMonth(history = []) {
  const map = new Map();
  for (const cycle of history) {
    if (cycle?.funding == null || !cycle.start?.endsWith("-01")) continue;
    if (cycle.end !== lastDayOfMonth(cycle.start)) continue;
    map.set(cycle.start.slice(0, 7), cycle.funding);
  }
  return map;
}

const round = (n) => Math.round(n * 100) / 100;

export default function StatsPage() {
  const colors = useChartColors();
  const budgetPeriod = useBudgetPeriod();
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

  // This list includes the month currently running, and that row is not like
  // the others: its rate divides money not yet spent by the month's budget, so
  // on day 2 it reads ~97%. For a finished month that figure is a real savings
  // rate; for this one it's a rate that will fall every time the reader buys
  // lunch. Same wording as Home and Tracker — "unspent so far", not "saved" —
  // so the one in-progress row stops claiming to be an outcome.
  const [todayYear, todayMonth] = (() => {
    const d = localToday().split("-");
    return [Number(d[0]), Number(d[1]) - 1];
  })();
  const isRunningMonth = (s) => s.year === todayYear && s.month === todayMonth;

  // A term pays for several months out of one lump sum, so every month after
  // the one it landed in has no income of its own. Read straight off
  // /summary/all — which is transaction-only and has never heard of terms —
  // those months each showed a large red deficit for spending that was funded
  // all along, and the month the money arrived showed a saving that was really
  // five other months' worth.
  //
  // /api/period already prices each cycle and is in context app-wide, so the
  // fix is a join here rather than term-awareness inside an aggregate that
  // lifetime savings and the friends leaderboard also run on.
  const funded = fundingByMonth(budgetPeriod.history);

  // One shape for the three places that judge a month: the rows, the chart and
  // the Per Month average. `budget` is what the month had to spend — its share
  // of an allowance where there is one, its own income otherwise — which is
  // the same figure Home and Tracker show for that month.
  const months = summaries.map((s) => {
    const funding = funded.get(monthKey(s)) ?? null;
    const budget = funding ?? s.totalIncome;
    const saved = round(budget - s.totalExpenses);
    return {
      ...s,
      funding,
      budget,
      saved,
      // Cycles of a *finished* term come back unpriced: loadPeriodContext only
      // costs the term containing today. So a month can be known to belong to
      // a term without its share being known. Say that, rather than printing a
      // deficit the reader never had. Outside term mode a month with spending
      // and no income really is a deficit, and keeps its red figure.
      unpriced:
        funding == null && s.totalIncome === 0 && budgetPeriod.mode === "term",
      percent: budget > 0 ? Math.round((saved / budget) * 100) : 0,
    };
  });

  // Months whose figures mean something. An unpriced one would otherwise enter
  // the average as a flat 0%, which is not a bad month — it's an unknown one.
  const judged = months.filter((m) => !m.unpriced);

  const data = months.map((m) => ({
    label: `${monthName(m.month).slice(0, 3)} ${String(m.year).slice(2)}`,
    Saved: Math.max(m.saved, 0),
    Spent: m.totalExpenses,
  }));

  // Headline insights across the tracked history.
  const monthsTracked = summaries.length;
  // The mean of each month's rate — every month counts equally, so a $50 month
  // weighs as much as a $2,000 one. Deliberately not the same number as the
  // all-time rate below, which is why they're labelled apart.
  //
  // Each rate divides by that month's budget, which is its income in month and
  // days mode and its share of the allowance in term mode. Reading income for
  // every month made this tile meaningless under a term — the mean of one 85%
  // month and five 0% ones — because five of the six had no income to divide
  // by. It is the same number as before wherever no allowance is in play.
  //
  // But be honest about the edge: this list includes the *running* month, and
  // its row reads "77% saved" on day 18 for the same reason Home's tile used
  // to — most of that money is still earmarked. Home now derives "Unspent So
  // Far" from its budget-denominated pace bar instead. The open question is
  // whether the in-progress row should be labelled apart from the finished
  // ones.
  const avgSavingsRate = judged.length
    ? Math.round(judged.reduce((acc, m) => acc + m.percent, 0) / judged.length)
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
  const monthsNewestFirst = [...months].reverse();
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
            {/* A heading, not an overline. It's the last section of a long
                page and the only one that isn't self-titling — the chart and
                the calendar both head themselves — so at 11px grey it read as
                a caption on the card above it. text-title matches Account
                Activity, the app's other card-external section heading, and
                title case follows from no longer being CSS-uppercased. */}
            <h2 className="px-0.5 text-title">Monthly Breakdown</h2>
            {/* Named once here rather than on every row, which would repeat
                the same words a dozen times down a narrow column. Worth naming
                at all because the denominator isn't the same for every row: a
                month funded by a lump sum banked earlier divides by its share
                of that allowance, which is what Home and Tracker show for it,
                while an ordinary month divides by the income it took in. */}
            <p className="mb-2.5 mt-0.5 px-0.5 text-[12px] text-ink-3">
              Percentages are of that month&apos;s income, or of its share of an
              allowance.
            </p>
            <Card>
              <CardContent className="p-2">
                <ul>
                  <AnimatePresence initial={false}>
                    {visibleMonths.map((m) => {
                      const positive = m.saved >= 0;
                      return (
                        <motion.li
                          key={`${m.year}-${m.month}`}
                          layout
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25 }}
                          className="flex items-center justify-between gap-3 border-b border-hairline px-4 py-[13px] last:border-b-0"
                        >
                          <div className="min-w-0">
                            <p className="text-[15px] font-medium tracking-[-0.01em]">
                              {monthName(m.month)} {m.year}
                            </p>
                            <p className="num mt-0.5 text-meta text-ink-3">
                              {/* A funded month names its share rather than the
                                  income it never took in: from the second cycle
                                  on, "+$0.00 in" was true and useless.

                                  Each half is one unbreakable unit. Left to
                                  itself the line broke after the minus sign at
                                  320px — "· −" ending one line and "$1,256.14
                                  out" starting the next — which reads as a
                                  stray dash rather than as a negative amount.
                                  The separator trails the first half rather
                                  than leading the second, so a wrap leaves
                                  "… allowance ·" and starts the new line on
                                  the amount. */}
                              <span className="whitespace-nowrap">
                                {m.funding != null
                                  ? `${formatMoney(m.funding)} allowance`
                                  : `+${formatMoney(m.totalIncome)} in`}{" "}
                                ·
                              </span>{" "}
                              <span className="whitespace-nowrap">
                                −{formatMoney(m.totalExpenses)} out
                              </span>
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            {/* A month inside a term whose share we can't price
                                — see `unpriced` above. A red deficit would be
                                the artefact of an allowance this view can't
                                see, so state what is actually known. */}
                            {m.unpriced ? (
                              <p className="text-meta text-ink-3">
                                From your allowance
                              </p>
                            ) : (
                              <>
                                <p
                                  className={`num text-[15px] font-medium ${
                                    positive ? "text-positive" : "text-negative"
                                  }`}
                                >
                                  {positive ? "+" : "−"}
                                  {formatMoney(Math.abs(m.saved))}
                                </p>
                                <p className="num mt-0.5 text-meta text-ink-3">
                                  {/* Three readings, because one sentence
                                      can't carry them. Nothing to divide by is
                                      a fact, not a 0% wipe-out. A month that
                                      went past its budget is "47% over", not
                                      "−47% saved" — a negative quantity of
                                      saving is not a thing, and judging months
                                      against a share rather than against
                                      income makes an overspend a normal
                                      outcome rather than a rarity. */}
                                  {m.budget === 0
                                    ? "No income logged"
                                    : positive
                                      ? `${m.percent}% ${
                                          isRunningMonth(m) ? "unspent so far" : "saved"
                                        }`
                                      : `${Math.abs(m.percent)}% over`}
                                </p>
                              </>
                            )}
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
