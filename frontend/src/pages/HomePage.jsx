import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, ChevronRight } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
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
  const aheadOfPace = spentPct <= elapsedPct;

  return (
    <PageWrapper>
      {/* Greeting — left, with the full date. The hero below is centred; these
          are two zones on purpose, not one broken column. */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        {loading ? (
          <Skeleton className="h-[17px] w-56" />
        ) : (
          <h1 className="text-title">
            Welcome back{stats ? `, ${stats.username}` : ""}
          </h1>
        )}
        <p className="mt-1 text-[13px] text-ink-3">
          {formatDay(localToday(), { withYear: true })}
          {activePeriod ? ` · ${daysLeft} ${daysLeft === 1 ? "day" : "days"} left` : ""}
        </p>
      </motion.div>

      {/* Hero */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-[34px]"
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
            <div className="text-center">
              <p className="text-overline text-ink-3">
                {overspent ? "Over budget" : `Left to spend this ${noun}`}
              </p>
              {loading ? (
                <Skeleton className="mx-auto mt-2 h-[46px] w-44" />
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

            {/* Pace bar — full width on purpose: the gap between fill and tick
                is the signal, and it stops being readable on a short bar. */}
            <div className="relative mt-[22px] h-1 rounded-full bg-surface-3">
              <div
                className={`h-full rounded-full ${
                  overspent ? "bg-negative" : "bg-ink"
                }`}
                style={{ width: `${overspent ? 100 : spentPct}%` }}
              />
              {totalDays > 0 && (
                <span
                  className="absolute -top-1 h-3 w-[1.5px] rounded-full bg-ink-3"
                  style={{ left: `${elapsedPct}%` }}
                  aria-hidden="true"
                />
              )}
            </div>
            {!loading && (
              <div className="mt-2 flex justify-between text-xs text-ink-3">
                <span>
                  <b className="font-medium text-ink-2">{formatMoney(spent)}</b> of{" "}
                  {formatMoney(budget)} used
                </span>
                <span
                  className={`font-medium ${
                    overspent
                      ? "text-negative"
                      : aheadOfPace
                        ? "text-positive"
                        : "text-warning"
                  }`}
                >
                  {overspent
                    ? `${formatMoney(Math.abs(stats.leftToSpend))} past`
                    : aheadOfPace
                      ? "Ahead of pace"
                      : "Behind pace"}
                </span>
              </div>
            )}

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
        <div className="mt-[20px] flex border-y border-hairline text-center ">
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
        ) : recent.length === 0 ? (
          <div className="rounded-lg border border-hairline bg-surface p-5 text-center">
            <p className="text-sm text-ink-2">Nothing logged yet.</p>
            <Button
              variant="ghost"
              className="mt-3"
              onClick={() => navigate("/transactions", { state: { openAdd: "expense" } })}
            >
              Add your first entry
            </Button>
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
    </PageWrapper>
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
