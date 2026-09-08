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
import { cn, formatMoney, localToday, monthName } from "@/lib/utils";
import { formatDay, formatPeriodLabel } from "@/lib/period";
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
  const spent = totals.spent;
  // What this window has to spend. In term mode that's its slice of the
  // allowance, not the income logged inside it — a cycle after the first has
  // none, and using it would put a different figure here from the one Home is
  // showing for the very same month.
  const funding = current?.funding ?? null;
  const income = funding ?? totals.income;
  // The captions say "of income" everywhere else, which stops being true once
  // the money came from a lump sum months ago.
  const budgetNoun = funding == null ? "income" : "allowance";
  // Title case, for labels rather than sentences — see design/COPY_CONVENTIONS.md.
  const titleNoun = budgetPeriod.noun === "period" ? "Period" : "Month";
  const saved = Math.max(income - spent, 0);
  const hasData = income > 0 || spent > 0;
  const periodSavings = current?.savings ?? 0;
  const percentageSaved = income > 0 ? Math.round(((income - spent) / income) * 100) : 0;
  const percentageSpent = income > 0 ? Math.round((spent / income) * 100) : 0;

  // The whole allowance behind the cycles, so the page can say where the term
  // stands as well as where this month does. Null outside term mode.
  const term = budgetPeriod.term;
  const showTerm = Boolean(term && term.left != null && current?.cycles);

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
            {/* Term cycles are calendar months, so "Period Tracker" over a
                heading reading "September 2026" just contradicted itself. */}
            {budgetPeriod.mode === "days" ? "Period Tracker" : "Monthly Tracker"}
          </h1>
          <p className="mt-1 text-[13px] text-ink-3">
            {current
              ? formatPeriodLabel(current, { mode: budgetPeriod.mode })
              : "No Budget Period Running"}
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
          All Months
        </button>
      </motion.div>

      {!budgetPeriod.loading && !current ? (
        <Card className="mt-5">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-[17px] font-semibold tracking-[-0.015em]">Nothing to Track Yet</p>
            <p className="text-[13px] leading-relaxed text-ink-3">
              {budgetPeriod.status === "lapsed"
                ? "Your last budget period has ended. Start the next one to pick tracking back up."
                : "Set up a budget period to start tracking what you've saved and spent."}
            </p>
            <Button onClick={() => navigate("/more")}>
              {budgetPeriod.status === "lapsed" ? "Start Next Period" : "Set Up a Period"}
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
              total={income}
              totalLabel={budgetNoun === "allowance" ? "Allowance" : "Income"}
              footnote={
                periodSavings > 0
                  ? `Goal: set aside ${formatMoney(periodSavings)} this ${budgetPeriod.noun}`
                  : null
              }
            />
          </motion.div>

          {/* The whole allowance, next to the month it funds. The cards above
              are about September; this one is about the six months September
              is month three of, which is the only place that shows. */}
          {showTerm && (
            <motion.div variants={fadeUp} initial="initial" animate="animate">
              <TermCard term={term} current={current} cycles={budgetPeriod.history} />
            </motion.div>
          )}

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
            budgetNoun={budgetNoun}
            period={current}
            periodDays={streak?.periodDays ?? []}
            todayBudget={streak?.today?.budget ?? 0}
          />

          {/* Spending by Category */}
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
            {/* "Unspent", not "Saved", for the same reason as the ring above:
                this is a live period, so income minus spending is money not
                spent yet. The "% of…" caption names the denominator.

                Named for the window rather than "Total": these sit at the foot
                of a long page, well out of sight of the heading that says which
                month they belong to, and "Total Spent" over one month's figure
                reads as everything ever spent. */}
            <BreakdownCard
              icon={PiggyBank}
              label={`Unspent This ${titleNoun}`}
              amount={income - spent}
              percent={percentageSaved}
              noun={budgetNoun}
              accent
            />
            <BreakdownCard
              icon={CreditCard}
              label={`Spent This ${titleNoun}`}
              amount={spent}
              percent={percentageSpent}
              noun={budgetNoun}
            />
          </motion.div>

          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Button
              variant="outline"
              onClick={() => navigate("/stats")}
              className="w-full gap-2"
            >
              <BarChart3 className="h-4 w-4" /> View All Months
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
  total = null,
  totalLabel = "Income",
}) {
  // Recharts sweeps a donut in by interpolating each sector's angle from zero,
  // and it does not consult prefers-reduced-motion the way the rest of the app
  // does — so ask framer and switch it off ourselves. Without this the chart is
  // the one piece of the UI that still animates for someone who asked it not to.
  const reduced = useReducedMotion();

  // Drop empty slices: a lone 360° sector renders badly with rounded caps, and
  // a zero-value slice contributes nothing but a seam.
  const slices = [
    { name: "Unspent", value: saved, fill: colors.saved },
    { name: "Spent", value: spent, fill: colors.spent },
  ].filter((s) => s.value > 0);
  const split = slices.length > 1;

  return (
    <Card>
      {/* No title: the ring says 77% UNSPENT and the list names both figures,
          so a heading above them would only repeat what the card already reads
          out. Matches mockups §06, where this card carries no title either.

          "Unspent", not "Saved": this is a live period, so income minus
          spending is money not spent yet, not money set aside. Calling it
          saved put an apparent 3x win directly above a "Goal: set aside $300"
          footnote. The SavingsGoalCard below is the one place that answers
          "am I actually saving?", and it says "covers" for the same reason. */}
      {/* Padding and gap are the give here. The ring is a fixed 128px and the
          amounts are tabular, so on a narrow phone the pair had nowhere to go
          and "$1,162.75" ran outside the card — 16px past it at 399px wide,
          95px at 320px. Trimming both reclaims ~50px, and flex-wrap catches
          whatever is left by dropping the amounts under the ring rather than
          letting them escape. No breakpoint: Tailwind's sm: is 640px, above
          every phone, so a responsive variant here would only ever apply the
          narrow case. */}
      <CardContent className="px-5 py-[22px]">
        {hasData ? (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
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
                  Unspent
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
            <dl className="grid grid-cols-[auto_auto] items-baseline gap-x-5 gap-y-1">
              {/* One word, not "Unspent so far": at 19px the amount needs the
                  room, and the pair reads as the card's own title now that it
                  has none. The period it covers is in the page header. */}
              {[
                ["Unspent", saved, colors.saved],
                ["Spent", spent, colors.spent],
              ].map(([label, value, swatch]) => (
                <Fragment key={label}>
                  <dt className="flex items-center gap-2">
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
              {/* The denominator, printed. The ring reads "77% Unspent" and
                  the two tiles at the foot of the page read "% of allowance" —
                  three percentages whose base appeared nowhere on the card. In
                  month mode you could add the two figures above yourself; in
                  term mode you couldn't get it anywhere on this page at all,
                  since the allowance card below is the whole term, not the
                  month's share of it.

                  A total, not a third headline: 15px and ink-2, under a rule,
                  so it reads as the figure the two above sum to. The label is
                  one word for the reason the two above are — the comment on
                  the padding records what happened when this card's contents
                  grew — and it swaps with the mode, because "Income" is a lie
                  in a cycle funded by a lump sum banked months ago. */}
              {total != null && (
                <>
                  <div
                    className="col-span-2 mt-2 border-t border-hairline"
                    aria-hidden="true"
                  />
                  <dt className="flex items-center gap-2">
                    {/* Holds the swatch column open so all three labels line
                        up; the total isn't a slice, so it has no colour. */}
                    <span className="h-[9px] w-[9px] shrink-0" aria-hidden="true" />
                    <span
                      data-measure="donut-total-label"
                      className="truncate text-meta text-ink-3"
                    >
                      {totalLabel}
                    </span>
                  </dt>
                  <dd className="num text-right text-[15px] font-medium text-ink-2">
                    <AnimatedNumber value={total} prefix="$" decimals={2} />
                  </dd>
                </>
              )}
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
 * Spending by Category — a 112px ring beside a right-aligned value list.
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
          Spending by Category
        </h2>

        {byCategory.length > 0 ? (
          /* The gap is tight: every pixel the ring doesn't take is a pixel of
             gutter between a category and its amount, and the app's real labels
             ("Entertainment") run longer than the mockup's ("Fun"). */
          <div className="mt-4 ml-3 flex flex-wrap items-center gap-x-4 gap-y-4">
            <div className="relative h-28 w-28 shrink-0">
              <PieChart width={112} height={112} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                <Pie
                  data={byCategory}
                  dataKey="value"
                  nameKey="name"
                  cx={56}
                  cy={56}
                  innerRadius={43.5}
                  outerRadius={55.5}
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
                {/* To the cent, matching the per-category rows immediately to
                    the right. This was whole dollars on the grounds that a
                    chart label needn't be exact and the card above carries the
                    precise figure — but the rows it sits beside are in this
                    same card and do show cents, so "$110" read as disagreeing
                    with the $70.60 + $38.90 next to it. */}
                <span className="num text-[18px] font-medium leading-none">
                  <AnimatedNumber value={spent} prefix="$" decimals={2} />
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
            <dl className="mx-auto grid grid-cols-[auto_auto] items-center gap-x-8 gap-y-[9px]">
              {byCategory.map((c) => (
                <Fragment key={c.name}>
                  <dt className="flex items-center gap-2">
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-[20px]"
                      style={{ background: c.color }}
                      aria-hidden="true"
                    />
                    <span className="max-w-[104px] truncate text-meta text-[12px] text-ink-2">{c.name}</span>
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
 * The unspent tile used to carry `border-primary/30 bg-primary/5`. With
 * --primary aliased to ink that renders as a grey-tinted box, which says
 * nothing — the accent means "this money is still yours", so it's green. The
 * spent figure is ink rather than red: spending is the normal case in a
 * spending tracker, and red has to still mean "over budget" when it appears.
 */
/**
 * Where the whole allowance stands, as opposed to the month drawn from it.
 *
 * Deliberately a bar and not a second donut: the page already has one, and two
 * rings side by side invite you to compare figures that are measured over
 * different spans.
 */
export function TermCard({ term, current, cycles = [] }) {
  const income = term.income ?? 0;
  const spent = term.spent ?? 0;
  const left = term.left ?? 0;
  const pct = income > 0 ? Math.min((spent / income) * 100, 100) : 0;
  const monthsLeft = current.cycles - current.cycle;

  // What each month of the allowance gets. The server prices every cycle up to
  // this one; the ones after it can't be priced, because their share depends on
  // what still gets spent this month. They're shown at this month's rate, which
  // is what they'd actually be if it's spent in full — the split is calibrated
  // so that spending exactly your share leaves the next month's share alone.
  const crossesYear = term.start.slice(0, 4) !== term.end.slice(0, 4);
  const months = [...cycles]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((c) => {
      const month = Number(c.start.slice(5, 7)) - 1;
      return {
        start: c.start,
        label: `${monthName(month).slice(0, 3)}${crossesYear ? ` ${c.start.slice(2, 4)}` : ""}`,
        amount: c.funding ?? current.funding ?? 0,
        projected: c.funding == null,
        isCurrent: c.start === current.start,
      };
    });
  const hasProjected = months.some((m) => m.projected);

  return (
    <Card>
      <CardContent className="px-[18px] py-5">
        {/* 15px, not text-title's 19px: every other card on this page — Daily
            Spending, Savings Target, Spending by Category — heads itself this
            way, and 19px was borrowed from Account Activity, which lives on a
            different page. */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
            Your Allowance
          </h2>
          <span className="shrink-0 text-meta text-ink-3">
            Month {current.cycle} of {current.cycles}
            {monthsLeft === 0 && " · last"}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-ink-3">
          {formatDay(term.start, { withYear: true })} –{" "}
          {formatDay(term.end, { withYear: true })}
        </p>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className={cn(
              "num text-[26px] font-medium",
              left < 0 ? "text-negative" : "text-ink"
            )}
          >
            {formatMoney(left)}
          </span>
          <span className="text-[13px] text-ink-3">left of {formatMoney(income)}</span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-enter ease-out",
              left < 0 ? "bg-negative" : "bg-ink"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Just the figure. The tail used to add "with 3 months to go after
            this one", which is the same fact as the "Month 3 of 6" chip five
            lines above — and it was what pushed this line to two. The last
            month's emphasis moved up into that chip rather than being lost. */}
        {/* data-measure: this line has to fit on one, and jsdom has no layout
            to prove it. The harness publishes the rendered line count, so the
            constraint is checkable instead of eyeballed. */}
        <p
          data-measure="term-caption"
          className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3"
        >
          {formatMoney(spent)} spent since it started.
        </p>

        {months.length > 0 && (
          <>
            {/* A grid, not a list: four of six months carry the same projected
                figure, and printed one per row that reads as padding rather
                than as information. Three across puts a six-month allowance in
                two rows and a year-long one in four. */}
            <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-hairline pt-3.5">
              {months.map((m) => (
                <div
                  key={m.start}
                  className={cn(
                    "rounded-md border px-2 py-1.5",
                    m.isCurrent
                      ? "border-transparent bg-surface-2"
                      : m.projected
                        ? // Same dashes the spending calendar puts on days that
                          // haven't happened.
                          "border-dashed border-hairline-strong"
                        : "border-transparent"
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] leading-none",
                      m.isCurrent ? "text-ink-2" : "text-ink-3"
                    )}
                  >
                    {m.label}
                    {/* The highlight says which month is current to anyone
                        looking; this says it to anyone listening. */}
                    {m.isCurrent && <span className="sr-only"> (this month)</span>}
                  </p>
                  <p
                    className={cn(
                      "num mt-1 text-[13px] leading-none",
                      m.isCurrent
                        ? "font-medium text-ink"
                        : m.projected
                          ? "text-ink-3"
                          : "text-ink-2"
                    )}
                  >
                    {formatMoney(m.amount)}
                  </p>
                </div>
              ))}
            </div>
            {hasProjected && (
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
                Dashed months are at this month&apos;s rate. They move as you
                spend — go under and they grow, go over and they shrink.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function BreakdownCard({ icon: Icon, label, amount, percent, noun = "income", accent }) {
  // A negative "total unspent" is the over-budget case — the one thing red is
  // reserved for. Green is only for money still unspent.
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
            <AnimatedNumber value={percent} suffix="%" /> of {noun}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
