import { Fragment, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { CalendarRange, Plus, Receipt, Users } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import SpendingTabs from "@/components/SpendingTabs";
import DailySpendingCard from "@/components/DailySpendingCard";
import EmptyState from "@/components/EmptyState";
import SavingsGoalCard from "@/components/SavingsGoalCard";
import SavedVsSpentCard from "@/components/SavedVsSpentCard";
import CategoryCard from "@/components/CategoryCard";
import TermCard from "@/components/TermCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchTransactions, fetchStreak } from "@/api/endpoints";
import { countedAmount, localToday, sumEntries } from "@/lib/utils";
import { formatPeriodLabel, noWindowCopy } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCategories } from "@/hooks/useCategories";
import { useChartColors } from "@/hooks/useChartColors";
import { useToast } from "@/hooks/useToast";
import { useTour } from "@/tour/TourProvider";
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

  const totals = sumEntries(transactions);
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
      map.set(t.category, (map.get(t.category) ?? 0) + countedAmount(t));
    }
    // A category whose bills were all paid back in full cost nothing, so it
    // has no slice and no "$0.00" row.
    let arr = [...map.entries()]
      .filter(([, value]) => value > 0)
      .map(([name, value]) => ({ name, value, color: getCategory(name).color }))
      .sort((a, b) => b.value - a.value);
    if (arr.length > 6) {
      const other = arr.slice(5).reduce((s, x) => s + x.value, 0);
      arr = [...arr.slice(0, 5), { name: "Other", value: other, color: colors.spent }];
    }
    return arr;
  })();

  useTour("tracker", !loading && hasData && Boolean(current));

  return (
    <PageWrapper>
      {/* This period vs History — two views of one surface. The switch lives
          above the conditional below, so history stays reachable even before
          anything is logged this period. It replaces the old "All Months"
          button that used to sit in the header (and a second one at the foot),
          and it's what gives history a home now that it's no longer a row in
          the More menu. */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" data-tour="tracker.tabs">
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
            <CardContent className="px-[20px] py-[22px]">
              <div className="flex items-center gap-[14px]">
                <Skeleton className="h-[104px] w-[104px] shrink-0 rounded-full" />
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[12px] gap-y-[6px]">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-4 w-[72px] justify-self-end" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-[72px] justify-self-end" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-4 w-[72px] justify-self-end" />
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
            <CardContent className="px-[18px] py-5">
              <Skeleton className="h-[15px] w-36" />
              <div className="mt-4 flex items-center gap-[14px]">
                <Skeleton className="h-28 w-28 shrink-0 rounded-full" />
                <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[12px] gap-y-[9px]">
                  {[0, 1, 2, 3, 4].map((i) => (
                    <Fragment key={i}>
                      <Skeleton className="h-3 w-[88px]" />
                      <Skeleton className="h-3 w-11 justify-self-end" />
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
          <motion.div variants={fadeUp} initial="initial" animate="animate" data-tour="tracker.ring">
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
            <motion.div variants={fadeUp} initial="initial" animate="animate" data-tour="tracker.term">
              <TermCard term={term} current={current} cycles={budgetPeriod.history} />
            </motion.div>
          )}

          {/* Savings goal */}
          <div data-tour="tracker.savings">
            <SavingsGoalCard
              target={periodSavings}
              income={income}
              spent={spent}
              period={current}
              onUpdated={load}
            />
          </div>

          {/* Daily spending tracker */}
          <div data-tour="tracker.calendar">
            <DailySpendingCard
              transactions={transactions}
              income={income}
              budgetNoun={budgetNoun}
              period={current}
              periodDays={streak?.periodDays ?? []}
              todayBudget={streak?.today?.budget ?? 0}
            />
          </div>

          {/* Spending by Category */}
          <motion.div variants={fadeUp} initial="initial" animate="animate">
            <CategoryCard
              byCategory={byCategory}
              spent={spent}
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
 * One of the two summary tiles under the charts.
 *
 * The unspent tile used to carry `border-primary/30 bg-primary/5`. With
 * --primary aliased to ink that renders as a grey-tinted box, which says
 * nothing — the accent means "this money is still yours", so it's green. The
 * spent figure is ink rather than red: spending is the normal case in a
 * spending tracker, and red has to still mean "over budget" when it appears.
 */
// BreakdownCard removed with the foot tiles — see the note where they rendered.
