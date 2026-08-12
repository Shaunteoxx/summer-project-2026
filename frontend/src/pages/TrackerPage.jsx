import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { PieChart, Pie, Cell } from "recharts";
import { BarChart3, PiggyBank, CreditCard } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import DailySpendingCard from "@/components/DailySpendingCard";
import SavingsGoalCard from "@/components/SavingsGoalCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTransactions, fetchStreak } from "@/api/endpoints";
import { formatMoney, localToday } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCategories } from "@/hooks/useCategories";
import { useChartColors } from "@/hooks/useChartColors";
import { useToast } from "@/hooks/useToast";
import { fadeUp, staggerContainer, fadeScaleItem } from "@/animations/variants";

export default function TrackerPage() {
  const navigate = useNavigate();
  const colors = useChartColors();
  const toast = useToast();
  const budgetPeriod = useBudgetPeriod();
  const { getCategory } = useCategories();
  const [transactions, setTransactions] = useState([]);
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  const current = budgetPeriod.current;

  // Totals come from the period's own transactions rather than /api/summary,
  // which is still keyed by calendar month for the history views on /stats.
  // The streak supplies each day's rolling budget; if it fails the daily views
  // simply fall back to plain bars, so don't let it break the page.
  const load = useCallback(() => {
    if (!current) return Promise.resolve();
    return Promise.all([
      fetchTransactions({ start: current.start, end: current.end }),
      fetchStreak(localToday()).catch(() => null),
    ]).then(([txns, st]) => {
      setTransactions(txns);
      setStreak(st);
    });
  }, [current]);

  useEffect(() => {
    if (budgetPeriod.loading) return;
    if (!current) {
      setLoading(false);
      return;
    }
    setLoading(true);
    load()
      .catch(() => toast.error("Couldn't load your tracker. Please try again."))
      .finally(() => setLoading(false));
    // Toast methods are stable; avoid reloading when the viewport state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, budgetPeriod.loading, current]);

  const totals = transactions.reduce(
    (acc, t) => {
      if (t.type === "income") acc.income += t.amount;
      else acc.spent += t.amount;
      return acc;
    },
    { income: 0, spent: 0 }
  );
  const income = totals.income;
  const spent = totals.spent;
  const saved = Math.max(income - spent, 0);
  const hasData = income > 0 || spent > 0;
  const periodSavings = current?.savings ?? 0;
  const percentageSaved = income > 0 ? Math.round(((income - spent) / income) * 100) : 0;
  const percentageSpent = income > 0 ? Math.round((spent / income) * 100) : 0;

  // Expenses grouped by category, largest first. Keep the donut to <=6 slices
  // (top 5 + a neutral "Other") so it stays readable as categories grow.
  // "Other" takes the chart's neutral rather than a fixed grey, so it reads as
  // the same non-colour the spent arc uses and follows the theme.
  const byCategory = (() => {
    const map = new Map();
    for (const t of transactions) {
      if (t.type !== "expense") continue;
      map.set(t.category, (map.get(t.category) ?? 0) + t.amount);
    }
    let arr = [...map.entries()]
      .map(([name, value]) => ({ name, value, color: getCategory(name).color }))
      .sort((a, b) => b.value - a.value);
    if (arr.length > 6) {
      const other = arr.slice(5).reduce((s, x) => s + x.value, 0);
      arr = [...arr.slice(0, 5), { name: "Other", value: other, color: colors.spent }];
    }
    return arr;
  })();

  return (
    <PageWrapper>
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="flex items-start justify-between gap-3"
      >
        <div className="min-w-0">
          <h1 className="text-title-lg">
            {budgetPeriod.mode === "month" ? "Monthly Tracker" : "Period Tracker"}
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {current
              ? formatPeriodLabel(current, { mode: budgetPeriod.mode })
              : "No budget period running"}
          </p>
        </div>
        {/* Same destination as the button at the foot of the page. This page
            runs long, so reaching your history shouldn't require scrolling
            past all of it first. */}
        <button
          type="button"
          onClick={() => navigate("/stats")}
          className="mt-1 flex h-8 shrink-0 items-center gap-1.5 rounded-sm border border-hairline-strong bg-surface px-3 text-[12.5px] font-medium text-ink transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <BarChart3 className="h-[13px] w-[13px]" />
          All months
        </button>
      </motion.div>

      {!budgetPeriod.loading && !current ? (
        <Card className="mt-5">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-[17px] font-semibold tracking-[-0.015em]">Nothing to track yet</p>
            <p className="text-[13px] leading-relaxed text-ink-3">
              {budgetPeriod.status === "lapsed"
                ? "Your last budget period has ended. Start the next one to pick tracking back up."
                : "Set up a budget period to start tracking what you've saved and spent."}
            </p>
            <Button onClick={() => navigate("/more")}>
              {budgetPeriod.status === "lapsed" ? "Start next period" : "Set up a period"}
            </Button>
          </CardContent>
        </Card>
      ) : loading ? (
        /* Skeletons stand at the true height of what they replace, so nothing
           jumps when the data lands — including the two donut cards, which are
           now a fixed-size ring beside a value list rather than a tall chart. */
        <div className="mt-5 space-y-3">
          <Card>
            <CardContent className="px-6 py-[22px]">
              <div className="flex items-center gap-[20px]">
                <Skeleton className="h-32 w-32 shrink-0 rounded-full" />
                <div className="mx-auto grid grid-cols-[max-content_max-content] items-center gap-x-5 gap-y-4">
                  <Skeleton className="h-3 w-11" />
                  <Skeleton className="h-[19px] w-[74px]" />
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-[19px] w-[74px]" />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="flex items-start justify-between">
                <Skeleton className="h-[15px] w-28" />
                <Skeleton className="h-[15px] w-9" />
              </div>
              <Skeleton className="mt-2.5 h-[26px] w-32" />
              <Skeleton className="mt-3.5 h-1.5 w-full rounded-full" />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <Skeleton className="h-[15px] w-36" />
              <div className="mt-4 flex items-center gap-4">
                <Skeleton className="h-32 w-32 shrink-0 rounded-full" />
                <div className="mx-auto grid grid-cols-[max-content_max-content] items-center gap-x-5 gap-y-[9px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Fragment key={i}>
                      <Skeleton className="h-3 w-[88px]" />
                      <Skeleton className="h-3 w-11" />
                    </Fragment>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-2 gap-2.5">
            <Card>
              <CardContent className="space-y-3">
                <Skeleton className="h-[34px] w-[34px] rounded-sm" />
                <Skeleton className="h-[22px] w-20" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
            <Card>
              <CardContent className="space-y-3">
                <Skeleton className="h-[34px] w-[34px] rounded-sm" />
                <Skeleton className="h-[22px] w-20" />
                <Skeleton className="h-3 w-16" />
              </CardContent>
            </Card>
          </div>
        </div>
      ) : (
        <div className="mt-5 space-y-3">
          {/* Saved vs spent */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <SavedVsSpentCard
              saved={saved}
              spent={spent}
              percentageSaved={percentageSaved}
              hasData={hasData}
              colors={colors}
              footnote={
                periodSavings > 0
                  ? `Goal: set aside ${formatMoney(periodSavings)} this ${budgetPeriod.noun}`
                  : null
              }
            />
          </motion.div>

          {/* Savings goal */}
          <SavingsGoalCard
            target={periodSavings}
            income={income}
            spent={spent}
            period={current}
            onUpdated={load}
          />

          {/* Daily spending tracker */}
          <DailySpendingCard
            transactions={transactions}
            income={income}
            period={current}
            periodDays={streak?.periodDays ?? []}
            todayBudget={streak?.today?.budget ?? 0}
          />

          {/* Spending by category */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <CategoryCard
              byCategory={byCategory}
              spent={spent}
              colors={colors}
              emptyNoun={budgetPeriod.noun}
            />
          </motion.div>

          {/* Breakdown */}
          <motion.div
            variants={staggerContainer(0.1, 0.15)}
            initial="initial"
            animate="animate"
            className="grid grid-cols-2 gap-2.5"
          >
            <BreakdownCard
              icon={PiggyBank}
              label="Total saved"
              amount={income - spent}
              percent={percentageSaved}
              accent
            />
            <BreakdownCard
              icon={CreditCard}
              label="Total spent"
              amount={spent}
              percent={percentageSpent}
            />
          </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Button
              variant="outline"
              onClick={() => navigate("/stats")}
              className="w-full gap-2"
            >
              <BarChart3 className="h-4 w-4" /> View all months
            </Button>
          </motion.div>
        </div>
      )}
    </PageWrapper>
  );
}

/**
 * Saved vs spent — a 128px ring on the left, the two figures written out on the
 * right.
 *
 * The previous version stacked a 260px-tall chart above a floating legend and
 * put *income* in the middle, so the two numbers the card is actually about
 * were only reachable by hovering an arc. Listing them frees the ring to shrink
 * to the size of a glance, and makes the hover tooltip redundant — which is why
 * there isn't one any more.
 *
 * Exported so the design harness can render it without the page's data
 * plumbing, the same way StatsPage exports its tiles.
 */
export function SavedVsSpentCard({
  saved,
  spent,
  percentageSaved,
  hasData,
  colors,
  footnote,
}) {
  // Recharts sweeps a donut in by interpolating each sector's angle from zero,
  // and it does not consult prefers-reduced-motion the way the rest of the app
  // does — so ask framer and switch it off ourselves. Without this the chart is
  // the one piece of the UI that still animates for someone who asked it not to.
  const reduced = useReducedMotion();

  // Drop empty slices: a lone 360° sector renders badly with rounded caps, and
  // a zero-value slice contributes nothing but a seam.
  const slices = [
    { name: "Saved", value: saved, fill: colors.saved },
    { name: "Spent", value: spent, fill: colors.spent },
  ].filter((s) => s.value > 0);
  const split = slices.length > 1;

  return (
    <Card>
      {/* No title: the ring says 77% SAVED and the list names both figures, so
          a heading above them would only repeat what the card already reads
          out. Matches mockups §06, where this card carries no title either. */}
      <CardContent className="px-8 py-[22px]">
        {hasData ? (
          <div className="flex items-center gap-[50px]">
            <div className="relative h-32 w-32 shrink-0">
              <PieChart width={128} height={128} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  cx={64}
                  cy={64}
                  innerRadius={50.5}
                  outerRadius={63.5}
                  cornerRadius={split ? 6.5 : 0}
                  paddingAngle={split ? 2 : 0}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={!reduced}
                  animationBegin={250}
                  animationDuration={1000}
                  stroke="none"
                >
                  {slices.map((s) => (
                    <Cell key={s.name} fill={s.fill} />
                  ))}
                </Pie>
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="num text-[25px] font-medium leading-none">
                  <AnimatedNumber value={percentageSaved} suffix="%" />
                </span>
                <span className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-3">
                  Saved
                </span>
              </div>
            </div>

            {/* A two-column grid sized to its content, pushed right with
                ml-auto. Amounts still align in a column — the whole point of
                tabular figures — but the label sits 12px from its number
                instead of being flung to the opposite edge of the card. Any
                slack ends up in the gap after the ring, where it reads as
                breathing room rather than as a hole in the middle of a row. */}
            <div className="mx-auto min-w-0">
            <dl className="grid min-w-0 grid-cols-[minmax(0,max-content)_max-content] items-baseline gap-x-5 gap-y-1">
              {/* "Saved", not "Saved so far": at 19px the amount needs the room,
                  and the pair reads as the card's own title now that it has
                  none. The period it covers is in the page header. */}
              {[
                ["Saved", saved, colors.saved],
                ["Spent", spent, colors.spent],
              ].map(([label, value, swatch]) => (
                <Fragment key={label}>
                  <dt className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
                      style={{ background: swatch }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-meta text-ink-2">{label}</span>
                  </dt>
                  <dd className="num text-right text-[19px] font-medium text-ink">
                    <AnimatedNumber value={value} prefix="$" decimals={2} />
                  </dd>
                </Fragment>
              ))}
            </dl>
              {/* The goal sits under the two figures it relates to rather than
                  full-width beneath the ring, where it read as a footnote to
                  the whole card. */}
              {footnote && (
                <p className="mt-6 text-[11px] leading-relaxed text-ink-3">
                  {footnote}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            <p className="text-[13px] leading-relaxed text-ink-3">
              No data yet. Add some income &amp; expenses on the Transactions page.
            </p>
            {footnote && (
              <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{footnote}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Spending by category — a 112px ring beside a right-aligned value list.
 *
 * Arcs are contiguous (no padding angle, butt caps): the eight category hues
 * are perceptually matched, so they separate on colour alone and a gap between
 * them just makes a small donut look chewed.
 *
 * Exported for the design harness, as above.
 */
export function CategoryCard({ byCategory, spent, colors, emptyNoun }) {
  // Same reason as the card above: recharts animates regardless of the user's
  // motion preference unless told otherwise.
  const reduced = useReducedMotion();

  return (
    <Card>
      <CardContent className="px-[18px] py-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
          Spending by category
        </h2>

        {byCategory.length > 0 ? (
          /* Both donuts are 128 — one ring size in the system, not two — and the
             gap is tight. Every pixel the ring doesn't take is a pixel of gutter
             between a category and its amount, and the app's real labels
             ("Food & Drinks") are far longer than the mockup's ("Food"). */
          <div className="mt-4 flex items-center gap-4 ml-3">
            <div className="relative h-32 w-32 shrink-0">
              <PieChart width={128} height={128} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  cx={64}
                  cy={64}
                  innerRadius={50.5}
                  outerRadius={63.5}
                  paddingAngle={0}
                  startAngle={90}
                  endAngle={-270}
                  isAnimationActive={!reduced}
                  animationBegin={250}
                  animationDuration={1000}
                  stroke="none"
                >
                  {byCategory.map((c) => (
                    <Cell key={c.name} fill={c.color} />
                  ))}
                </Pie>
              </PieChart>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {/* Whole dollars only: this is a chart label, and the card
                    above already carries the figure to the cent. */}
                <span className="num text-[18px] font-medium leading-none">
                  <AnimatedNumber value={spent} prefix="$" />
                </span>
                <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.07em] text-ink-3">
                  Spent
                </span>
              </div>
            </div>

            {/* Same content-sized grid as the card above: the amounts line up
                as a column, but sit next to their labels rather than at the far
                edge. Long custom category names shrink and truncate rather than
                pushing the amounts out of alignment. */}
            <dl className="mx-auto grid min-w-0 grid-cols-[minmax(0,max-content)_max-content] items-center gap-x-8 gap-y-[9px]">
              {byCategory.map((c) => (
                <Fragment key={c.name}>
                  <dt className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-[20px]"
                      style={{ background: c.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-meta text-[12px] text-ink-2">{c.name}</span>
                  </dt>
                  <dd className="num text-right text-meta text-[12px] font-medium text-ink">
                    {formatMoney(c.value)}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </div>
        ) : (
          <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
            No expenses yet this {emptyNoun}. Add some on the Transactions page.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * One of the two summary tiles under the charts.
 *
 * The saved tile used to carry `border-primary/30 bg-primary/5`. With --primary
 * aliased to ink that renders as a grey-tinted box, which says nothing — the
 * accent means "this is money you kept", so it's green. The spent figure is ink
 * rather than red: spending is the normal case in a spending tracker, and red
 * has to still mean "over budget" when it appears.
 */
function BreakdownCard({ icon: Icon, label, amount, percent, accent }) {
  // A negative "total saved" is the over-budget case — the one thing red is
  // reserved for. Green is only for money actually kept.
  const over = accent && amount < 0;
  const kept = accent && !over;

  return (
    <motion.div variants={fadeScaleItem}>
      <Card className={`h-full ${kept ? "bg-positive/[0.09]" : ""}`}>
        <CardContent className="p-4">
          <span
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-sm ${
              kept ? "bg-positive/10 text-positive" : "bg-surface-2 text-ink-2"
            }`}
          >
            <Icon className="h-[17px] w-[17px]" />
          </span>
          <p
            className={`num mt-3 text-[22px] font-medium ${
              over ? "text-negative" : kept ? "text-positive" : "text-ink"
            }`}
          >
            <AnimatedNumber value={amount} prefix="$" decimals={2} />
          </p>
          <p className="mt-1 text-meta text-ink-2">{label}</p>
          <p className="mt-0.5 text-meta text-ink-3">
            <AnimatedNumber value={percent} suffix="%" /> of income
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
