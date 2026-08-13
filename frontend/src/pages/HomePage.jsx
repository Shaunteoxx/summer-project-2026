import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight, Plus, Receipt } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import EmptyState from "@/components/EmptyState";
import StreakCard from "@/components/StreakCard";
import CategoryIcon from "@/components/CategoryIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHomeStats, fetchTransactions } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCategories } from "@/hooks/useCategories";
import { formatMoney, localToday } from "@/lib/utils";
import { formatDay } from "@/lib/period";
import { fadeUp } from "@/animations/variants";

/** How many recent entries the home list shows. */
const RECENT_COUNT = 4;

export default function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const period = useBudgetPeriod();
  const { getCategory } = useCategories();
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchHomeStats(localToday()),
      // The list endpoint sorts newest-first and takes no limit, so slice
      // client-side. A failure here costs the Recent block, not the page.
      fetchTransactions().catch(() => []),
    ])
      .then(([s, txns]) => {
        setStats(s);
        setRecent(Array.isArray(txns) ? txns.slice(0, RECENT_COUNT) : []);
      })
      .catch(() => {
        setStats(null);
        toast.error("Couldn't load your stats. Please try again.");
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The server resolves which period is active; a null one means days mode
  // with nothing running, and the hero becomes a prompt to start the next.
  const activePeriod = stats?.period ?? period.current;
  const noPeriod = !activePeriod;
  // Nothing has ever been logged. Every figure on this page derives from the
  // ledger, so with an empty ledger they'd all read zero — which says "you have
  // no money", not "you haven't told me anything yet".
  const nothingLogged = !loading && recent.length === 0;
  const daysLeft = activePeriod?.daysLeft ?? 0;
  const noun = period.noun;
  const overspent = (stats?.leftToSpend ?? 0) < 0;

  // The pace bar. Fill is how much of the period's budget has gone; the tick is
  // where you'd be if you spent evenly. Ahead of the tick is trouble, behind it
  // is fine — both numbers already exist, they were just never compared.
  const budget = Math.max((stats?.periodIncome ?? 0) - (stats?.periodSavings ?? 0), 0);
  const spent = stats?.periodExpenses ?? 0;
  const spentPct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const totalDays = activePeriod?.days ?? 0;
  const elapsedPct =
    totalDays > 0 ? Math.min(((totalDays - daysLeft) / totalDays) * 100, 100) : 0;
  const fillPct = overspent ? 100 : spentPct;
  // Spending less of the budget than the period has used up is the good case.
  // The two percentages sit either side of the bar, so the verdict is now
  // backed by figures the reader can check rather than asserted on its own.
  const aheadOfPace = spentPct <= elapsedPct;
  const paceVerdict = overspent
    ? `${formatMoney(Math.abs(stats?.leftToSpend ?? 0))} past`
    : aheadOfPace
      ? "Ahead of pace"
      : "Behind pace";
  // With no budget and no period there is nothing to be ahead or behind of.
  const showVerdict = !loading && (overspent || (totalDays > 0 && budget > 0));

  // The verdict is pinned to the right of the same line the spent label tracks
  // along, so the label needs its width to know where to stop. Measured rather
  // than guessed: "Behind pace" and "$1,204.50 past" are nowhere near the same
  // size, and the wider one is the one that would be run into.
  const verdictRef = useRef(null);
  const [verdictWidth, setVerdictWidth] = useState(0);
  useLayoutEffect(() => {
    setVerdictWidth(verdictRef.current?.offsetWidth ?? 0);
  }, [paceVerdict, showVerdict]);

  return (
    <PageWrapper>
      {/* Greeting — left, with the full date. The hero below is centred; these
          are two zones on purpose, not one broken column. */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        {loading ? (
          <Skeleton className="h-[17px] w-[56%]" />
        ) : (
          <h1 className="text-title">
            {/* "Welcome back" is wrong for someone who has never logged
                anything — there is no back to come to yet. */}
            {nothingLogged ? "Welcome" : "Welcome back"}
            {stats ? `, ${stats.username}` : ""}
          </h1>
        )}
        {loading ? (
          <Skeleton className="mt-2.5 h-[11px] w-[42%]" />
        ) : (
          <p className="mt-1 text-[13px] text-ink-3">
            {formatDay(localToday(), { withYear: true })}
            {activePeriod && !nothingLogged
              ? ` · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left`
              : ""}
          </p>
        )}
      </motion.div>

      {/* Nothing logged, ever. The hero, the strip, the streak and the totals
          would all read zero, which says "you have no money" rather than "you
          haven't told me anything yet" — so none of them render. What's left is
          the gap, named, and the two things that close it. */}
      {nothingLogged && (
        <motion.div variants={fadeUp} initial="initial" animate="animate">
          <EmptyState
            icon={Receipt}
            title="Nothing logged yet"
            body={`Add your income for the ${noun} and your daily budget appears here.`}
            action={
              <Button
                className="mt-[22px] w-auto px-5"
                onClick={() =>
                  navigate("/transactions", { state: { openAdd: "income" } })
                }
              >
                <Plus className="h-[17px] w-[17px]" />
                Add your first entry
              </Button>
            }
          />

          <Card className="mt-[34px]">
            <CardContent className="p-[18px]">
              <p className="text-[14px] font-semibold tracking-[-0.01em]">
                Set up in two steps
              </p>
              {[
                `Log the money coming in this ${noun}`,
                "Set a savings target under More",
              ].map((step, i) => (
                <div key={step} className="mt-3 flex items-start gap-3">
                  {/* Step one is ink because it's the one to do now; step two
                      is quiet until it is. */}
                  <span
                    className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                      i === 0 ? "bg-ink text-surface" : "bg-surface-2 text-ink-3"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span
                    className={`text-[13px] leading-relaxed ${
                      i === 0 ? "text-ink-2" : "text-ink-3"
                    }`}
                  >
                    {step}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </motion.div>
      )}

      {!nothingLogged && (
        <>

      {/* Hero */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-[25px]"
      >
        {!loading && noPeriod ? (
          <div className="text-center">
            <p className="text-sm text-ink-2">
              {period.status === "lapsed"
                ? "Your last budget period has ended."
                : "No budget period running yet."}
            </p>
            <Button className="mt-4 w-full" onClick={() => navigate("/more")}>
              {period.status === "lapsed" ? "Start next period" : "Set up a period"}
            </Button>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center text-center">
              {/* Even the overline waits. It names a figure, and a label over a
                  blank is a claim the screen can't back up yet. */}
              {loading ? (
                <Skeleton className="h-[9px] w-[82px]" />
              ) : (
                <p className="text-overline text-ink-3">
                  {overspent ? "Over budget" : `Left to spend this ${noun}`}
                </p>
              )}
              {loading ? (
                <Skeleton className="mt-3 h-10 w-[172px] rounded-md" />
              ) : (
                <p
                  className={`num-display mt-2 text-display ${
                    overspent ? "text-negative" : "text-ink"
                  }`}
                >
                  <AnimatedNumber
                    value={Math.abs(stats?.leftToSpend ?? 0)}
                    prefix={overspent ? "−$" : "$"}
                    decimals={2}
                  />
                </p>
              )}
            </div>

            {/* Pace bar. Each label rides the thing it names — the spent
                figure sits over the middle of the fill, the elapsed figure over
                the tick — so both move as the month does and neither has to be
                matched to its mark by guesswork.

                The verdict shares the top line with the spent figure: it is
                that figure's reading, and a row of its own put it three lines
                below the number it was interpreting. A moving label and a
                pinned one on one line would eventually collide, so the spent
                label's clamp is told how much of the right-hand end the
                verdict is occupying and stops before it. */}
            <div className="mt-[18px]">
              {!loading && (
                <div className="relative h-[15px]">
                  <TrackingLabel
                    pct={fillPct / 2}
                    rightInset={verdictWidth ? verdictWidth + 8 : 0}
                    className={`text-[11px] font-medium ${
                      overspent ? "text-negative" : "text-ink-2"
                    }`}
                  >
                    {Math.round(fillPct)}% spent
                  </TrackingLabel>

                  {showVerdict && (
                    /* The one interpretation on the hero, so it links to where
                       the interpretation is worked out rather than trying to
                       explain itself in three words. */
                    <button
                      ref={verdictRef}
                      type="button"
                      onClick={() => navigate("/plan", { state: { focus: "pace" } })}
                      aria-label={`${paceVerdict} — see your pace and forecast`}
                      className={`absolute right-0 top-0 flex h-[15px] items-center gap-0.5 rounded-sm text-[11px] font-medium transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        overspent
                          ? "text-negative"
                          : aheadOfPace
                            ? "text-positive"
                            : "text-warning"
                      }`}
                    >
                      {paceVerdict}
                      <ChevronRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              {/* An empty track with no fill and no tick is a bar claiming
                  you've spent nothing, so while loading it's a skeleton at the
                  bar's own height rather than the bar itself. */}
              {loading ? (
                <Skeleton className="mt-1 h-1 w-full rounded-full" />
              ) : (
                <div
                  className="relative mt-1 h-1 rounded-full bg-surface-3"
                  role="img"
                  aria-label={
                    totalDays > 0 && budget > 0
                      ? `${Math.round(fillPct)}% of your budget spent, ${Math.round(elapsedPct)}% of the ${noun} passed — ${paceVerdict}`
                      : `${formatMoney(spent)} of ${formatMoney(budget)} used`
                  }
                >
                  <div
                    className={`h-full rounded-full ${
                      overspent ? "bg-negative" : "bg-ink"
                    }`}
                    style={{ width: `${fillPct}%` }}
                  />
                  {totalDays > 0 && (
                    <span
                      className="absolute -top-1 h-3 w-[1.5px] rounded-full bg-ink-3"
                      style={{ left: `${elapsedPct}%` }}
                      aria-hidden="true"
                    />
                  )}
                </div>
              )}

              {loading ? (
                <div className="mt-3 flex justify-between">
                  <Skeleton className="h-[10px] w-[44%]" />
                  <Skeleton className="h-[10px] w-[26%]" />
                </div>
              ) : (
                totalDays > 0 && (
                  <div className="relative mt-1.5 h-[15px]">
                    <TrackingLabel pct={elapsedPct} className="text-[11px] text-ink-3">
                      {Math.round(elapsedPct)}% of the {noun} passed
                    </TrackingLabel>
                  </div>
                )
              )}
            </div>

            {overspent && (
              <div className="mt-[18px] flex items-start gap-2.5 rounded-md bg-negative/[0.08] p-3.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-negative" />
                <p className="text-[12.5px] leading-relaxed text-ink-2">
                  You&apos;re{" "}
                  <b className="font-semibold text-negative">
                    {formatMoney(Math.abs(stats.leftToSpend))}
                  </b>{" "}
                  past this {noun}&apos;s budget. No daily budget until more income
                  lands — or lower this {noun}&apos;s savings target.
                </p>
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* In / Out / Saved — a hairline strip, not three more cards */}
      {!noPeriod && (
        <div className="mt-[10px] flex border-y border-hairline text-center ">
          <StripCell label="In" value={stats?.periodIncome} loading={loading} accent />
          <span className="my-3 w-px bg-hairline" />
          <StripCell label="Out" value={stats?.periodExpenses} loading={loading} inset />
          <span className="my-3 w-px bg-hairline" />
          <StripCell label="Saved" value={stats?.periodSavings} loading={loading} inset />
        </div>
      )}

      {/* Today's budget + streak */}
      <div className="mt-4">
        <StreakCard />
      </div>

      {/* Totals */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-3 grid grid-cols-2 gap-2.5"
      >
        <StatCard
          label="Total saved"
          value={stats?.totalSavings ?? 0}
          prefix="$"
          decimals={2}
          loading={loading}
        />
        <StatCard
          label={`Saved this ${noun}`}
          value={stats?.percentageSaved ?? 0}
          suffix="%"
          decimals={0}
          loading={loading}
          accent
        />
      </motion.div>

      {/* Recent — replaces the old Quick actions block, three of whose four
          links went to tabs already one tap away. "What did I just spend" is
          the actual reason people open a manual tracker. */}
      <section className="mt-4">
        <header className="mb-2.5 flex items-baseline justify-between">
          <h2 className="text-overline text-ink-3">Recent</h2>
          <button
            onClick={() => navigate("/transactions")}
            className="rounded-sm text-[12.5px] font-medium text-ink-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            See all
          </button>
        </header>

        {loading ? (
          <div className="-mx-4 border-y border-hairline bg-surface">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 px-4 py-3.5 [&+&]:border-t [&+&]:border-hairline"
              >
                <Skeleton className="h-[34px] w-[34px] rounded-sm" />
                <div className="flex-1">
                  <Skeleton className="h-[11px] w-1/2" />
                  <Skeleton className="mt-2 h-[9px] w-2/3" />
                </div>
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        ) : (
          <ul className="-mx-4 border-y border-hairline bg-surface">
            {recent.map((t) => {
              const income = t.type === "income";
              const category = getCategory(t.category);
              return (
                <li key={t._id ?? t.id} className="border-t border-hairline first:border-t-0">
                  <button
                    onClick={() => navigate("/transactions")}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <CategoryIcon category={category} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium tracking-tight">
                        {t.description || t.category}
                      </span>
                      <span className="mt-0.5 block truncate text-[12.5px] text-ink-3">
                        {formatDay(t.date)} · {t.category}
                      </span>
                    </span>
                    {/* Expenses are ink, not red. Spending is the normal case in
                        a spending tracker; red has to still mean "over". */}
                    <span
                      className={`num shrink-0 text-[15px] font-medium ${
                        income ? "text-positive" : "text-ink"
                      }`}
                    >
                      {income ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
        </>
      )}
    </PageWrapper>
  );
}

/**
 * A caption centred on a moving point of the bar.
 *
 * Centring alone would push the label off the card whenever its point nears
 * either end — and the elapsed marker crosses both ends every period, so this
 * is the normal case, not an edge one. Clamping needs the label's own width,
 * which only the browser knows, so it's measured after layout and fed into a
 * CSS clamp(). The label tracks its point exactly until it would overflow, then
 * rests against the edge.
 *
 * `rightInset` reserves space at that right-hand edge for something already
 * parked there — the pace verdict — so the label comes to rest beside it
 * rather than on top of it.
 */
function TrackingLabel({ pct, rightInset = 0, className = "", children }) {
  const ref = useRef(null);
  const [half, setHalf] = useState(0);

  useLayoutEffect(() => {
    if (ref.current) setHalf(ref.current.offsetWidth / 2);
  }, [children]);

  return (
    <span
      ref={ref}
      className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${className}`}
      style={{
        left: `clamp(${half}px, ${pct}%, calc(100% - ${half + rightInset}px))`,
      }}
    >
      {children}
    </span>
  );
}

function StripCell({ label, value, loading, accent }) {
  return (
    <div className={`flex-1 py-2`}>
      <p className="text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink-3">
        {label}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-3.5 w-20" />
      ) : (
        <p
          className={`num mt-1 text-[17px] font-medium ${
            accent ? "text-positive" : "text-ink"
          }`}
        >
          <AnimatedNumber value={value ?? 0} prefix="$" decimals={2} />
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, prefix, suffix, decimals, loading, accent }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[12.5px] text-ink-3">{label}</p>
        {loading ? (
          <Skeleton className="mt-2 h-[19px] w-24" />
        ) : (
          <p
            className={`num mt-1.5 text-[22px] font-medium ${
              accent ? "text-positive" : "text-ink"
            }`}
          >
            <AnimatedNumber
              value={value}
              prefix={prefix}
              suffix={suffix}
              decimals={decimals}
            />
          </p>
        )}
      </CardContent>
    </Card>
  );
}
