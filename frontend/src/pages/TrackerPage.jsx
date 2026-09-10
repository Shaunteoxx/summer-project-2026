import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarRange, Plus, Receipt, Users } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import SpendingTabs from "@/components/SpendingTabs";
import DonutChart from "@/components/DonutChart";
import AnimatedNumber from "@/components/AnimatedNumber";
import DailySpendingCard from "@/components/DailySpendingCard";
import EmptyState from "@/components/EmptyState";
import SavingsGoalCard from "@/components/SavingsGoalCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTransactions, fetchStreak } from "@/api/endpoints";
import { cn, formatMoney, localToday, monthName } from "@/lib/utils";
import { formatDay, formatPeriodLabel, noWindowCopy } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCategories } from "@/hooks/useCategories";
import { useChartColors } from "@/hooks/useChartColors";
import { useToast } from "@/hooks/useToast";
import { fadeUp } from "@/animations/variants";

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
  const saved = Math.max(income - spent, 0);
  const hasData = income > 0 || spent > 0;
  const periodSavings = current?.savings ?? 0;
  const percentageSaved = income > 0 ? Math.round(((income - spent) / income) * 100) : 0;
  // What the ring divides by once a target is set.
  //
  // Home reserves the target before working out what's left to spend; this ring
  // used to divide by the whole income, so one September read "4% spent" on Home
  // and "97% unspent" here — and the 97% sat directly above "Goal: set aside
  // $300", a goal it had not accounted for. §13 renamed the slice from "Saved"
  // to "Unspent", which made the label honest but left the arithmetic saying
  // something Home contradicted. The reserve is a slice of its own now, so the
  // three parts still sum to income and the fraction matches the one Home shows.
  const spendable = Math.max(income - periodSavings, 0);
  const leftToSpend = income - periodSavings - spent;
  const percentageLeft =
    spendable > 0 ? Math.round(((spendable - spent) / spendable) * 100) : 0;

  // The whole allowance behind the cycles, so the page can say where the term
  // stands as well as where this month does. Null outside term mode.
  // Named the same way on Home and Plan; term mode calls this an allowance
  // term rather than a budget period.
  const noWindow = noWindowCopy(budgetPeriod.mode, budgetPeriod.status);
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
      {/* This period vs History — two views of one surface. The switch lives
          above the conditional below, so history stays reachable even before
          anything is logged this period. It replaces the old "All Months"
          button that used to sit in the header (and a second one at the foot),
          and it's what gives history a home now that it's no longer a row in
          the More menu. */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <SpendingTabs />
      </motion.div>

      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-6"
      >
        <h1 className="text-title-lg">
          {/* Term cycles are calendar months, so "Period Tracker" over a
              heading reading "September 2026" just contradicted itself. */}
          {budgetPeriod.mode === "days" ? "Period Tracker" : "Monthly Tracker"}
        </h1>
        {current && (
          // "· day by day" names the scope: one window in detail here, every
          // month compared under History.
          <p className="mt-1 text-[13px] text-ink-3">
            {formatPeriodLabel(current, { mode: budgetPeriod.mode })} · day by
            day
          </p>
        )}
      </motion.div>

      {!budgetPeriod.loading && !current ? (
        /* The shared EmptyState, and the same words Home uses for the identical
           situation — this used to be a hand-rolled card with no icon, saying
           the same thing differently on the two screens that show it. */
        <motion.div variants={fadeUp} initial="initial" animate="animate">
          <EmptyState
            icon={CalendarRange}
            title={noWindow.title}
            /* This page's own sentence rather than the shared one: what a
               reader wants to know here is what the *tracker* will show them
               once a window exists. The title and the button stay shared, so
               the thing being asked for is named the same everywhere. */
            body={
              budgetPeriod.status === "lapsed"
                ? noWindow.body
                : "Set one up and this page will show what you've spent, day by day, and how much is still yours."
            }
            action={
              <Button
                className="mt-[22px] w-auto px-5"
                onClick={() => navigate("/more", { state: { open: "period" } })}
              >
                {noWindow.action}
              </Button>
            }
          />
        </motion.div>
      ) : !loading && !hasData ? (
        /* One empty state, not five empty cards.
           
           With a window running but nothing in it, this page used to render the
           lot: an empty donut, a savings-target prompt, a calendar of $0.00
           days, an empty category card and two "$0.00 · 0% of income" tiles.
           Every one of them was honest and none of them was useful, and three
           said "add some on the Transactions page" in three different wordings
           — while the + button sits on this very screen.

           The savings target goes too, for a reason beyond tidiness: setting
           aside a share of an income you haven't logged is step two offered
           before step one. It comes back the moment there's anything to
           divide. */
        <motion.div variants={fadeUp} initial="initial" animate="animate">
          <EmptyState
            icon={Receipt}
            title="Nothing to Track Yet"
            body={`Log an entry and you'll see where the ${budgetPeriod.noun} went, day by day, and how much of it is still yours.`}
            action={
              <Button
                className="mt-[22px] w-auto px-5"
                onClick={() =>
                  navigate("/transactions", { state: { openAdd: "income" } })
                }
              >
                <Plus className="h-[17px] w-[17px]" />
                Add Your First Entry
              </Button>
            }
          />
        </motion.div>
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
              reserved={periodSavings}
              left={leftToSpend}
              percentLeft={percentageLeft}
              hasData={hasData}
              colors={colors}
              total={income}
              totalLabel={budgetNoun === "allowance" ? "Allowance" : "Income"}
              // No footnote once the reserve is a slice: "Goal: set aside $300"
              // under the ring was there to supply what the ring left out, and
              // the ring no longer leaves it out.
              footnote={null}
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

          {/* No foot breakdown tiles. The ring above is the single money
              summary — Left to Spend / Reserved / Spent on the spendable base
              that matches Home. The old "Unspent This {noun}" tile divided by
              income, so it counted the reserved target as spendable and put a
              second, larger green figure than the ring on the same screen for
              the same month. A running month's "% of income" is provisional
              regardless (near 100% on day one, falling as you spend); that
              savings-rate view belongs on Stats, where months are finished —
              one tap away via "All Months" below. Revises §13, which added the
              tile back when the ring was itself income-based and they agreed. */}

          {/* History moved up to the toggle at the top; what stays here is the
              other question — how your rate compares. The leaderboard is scored
              on this same period, and Friends still has no door outside the
              More menu, so the current-period page is where it belongs. */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <Button
              variant="outline"
              onClick={() => navigate("/friends")}
              className="w-full gap-2"
            >
              <Users className="h-4 w-4" /> Compare with Friends
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
  // A savings target turns this into a three-part ring. With no target there is
  // nothing to reserve, so the card keeps its original two slices and its
  // "Unspent" wording — which is accurate exactly when nothing is set aside.
  reserved = 0,
  left = null,
  percentLeft = 0,
}) {
  // Drop empty slices: a lone 360° sector renders badly with rounded caps, and
  // a zero-value slice contributes nothing but a seam.
  const hasReserve = reserved > 0;
  // Order round the ring: what you can still spend, what is committed, what has
  // gone. Reading clockwise from the top that is best case to worst.
  const legend = hasReserve
    ? [
        ["Left to Spend", Math.max(left ?? 0, 0), colors.saved],
        ["Reserved", reserved, colors.reserved],
        ["Spent", spent, colors.spent],
      ]
    : [
        ["Unspent", saved, colors.saved],
        ["Spent", spent, colors.spent],
      ];
  const slices = legend
    .map(([name, value, fill]) => ({ name, value, fill }))
    .filter((s) => s.value > 0);
  const split = slices.length > 1;
  // The headline fraction. Off the spendable budget once a target exists, which
  // is the base Home divides by — see the note on `spendable` in TrackerPage.
  const ringPercent = hasReserve ? percentLeft : percentageSaved;
  const ringLabel = hasReserve ? "Left" : "Unspent";

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
              <DonutChart
                slices={slices}
                size={128}
                thickness={13}
                rounded={split}
                gap={split ? 14 : 0}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="num text-[25px] font-medium leading-none">
                  <AnimatedNumber value={ringPercent} suffix="%" />
                </span>
                <span className="mt-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-ink-3">
                  {ringLabel}
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
              {legend.map(([label, value, swatch]) => (
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
            {/* Reached only from the design harness now: a period with nothing
                in it never gets this far, since the page short-circuits to one
                empty state. Kept honest anyway, and pointing at the + on this
                screen rather than at another page. */}
            <p className="text-[13px] leading-relaxed text-ink-3">
              Nothing logged yet. Tap + to add an entry.
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
              <DonutChart slices={byCategory} size={112} thickness={12} />
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
          /* The live case: income logged, nothing spent. The + is on this
             screen, so sending the reader to the Transactions page to do what a
             button here already does was a detour. */
          <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
            No expenses yet this {emptyNoun}. Tap + to add one.
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

// BreakdownCard removed with the foot tiles — see the note where they rendered.
