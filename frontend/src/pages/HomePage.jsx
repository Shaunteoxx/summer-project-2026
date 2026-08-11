import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Calculator,
  PieChart,
  Receipt,
  PiggyBank,
  TrendingUp,
  ArrowRight,
  CalendarDays,
  BarChart3,
  AlertTriangle,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import StreakCard from "@/components/StreakCard";
import AccountsCard from "@/components/AccountsCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHomeStats } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { formatMoney, localToday } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { staggerContainer, fadeUp, fadeScaleItem } from "@/animations/variants";

const quickActions = [
  {
    to: "/transactions",
    label: "Add transaction",
    desc: "Log income or an expense",
    icon: Receipt,
  },
  {
    to: "/tracker",
    label: "This period",
    desc: "Saved vs spent",
    icon: PieChart,
  },
  {
    to: "/calculator",
    label: "Daily budget",
    desc: "What can I spend today?",
    icon: Calculator,
  },
  {
    to: "/stats",
    label: "See all months",
    desc: "Savings vs spending history",
    icon: BarChart3,
  },
];

export default function HomePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const period = useBudgetPeriod();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHomeStats(localToday())
      .then(setStats)
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
  // Negative "left to spend" means the period's income minus its savings target
  // is already gone — call it out rather than showing a quiet red number.
  const overspent = (stats?.leftToSpend ?? 0) < 0;

  return (
    <PageWrapper>
      {/* Greeting */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <p className="text-sm font-medium text-primary">
          {activePeriod
            ? formatPeriodLabel(activePeriod, { mode: period.mode })
            : "No budget period running"}
        </p>
        {loading ? (
          <Skeleton className="mt-1.5 h-8 w-56" />
        ) : (
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">
            Welcome back{stats ? `, ${stats.username}` : ""}
          </h1>
        )}
      </motion.div>

      {/* Hero: left to spend */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-5"
      >
        <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
          <CardContent className="relative p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-muted-foreground">
                {noPeriod ? "Nothing budgeted right now" : `Left to spend this ${noun}`}
              </p>
              {!noPeriod && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                </span>
              )}
            </div>
            {!loading && noPeriod ? (
              <>
                <p className="mt-2 text-sm text-muted-foreground">
                  {period.status === "lapsed"
                    ? "Your last budget period has ended. Start the next one to get your daily budget back."
                    : "Set up a budget period to start tracking a daily budget."}
                </p>
                <Button className="mt-4 w-full" onClick={() => navigate("/more")}>
                  {period.status === "lapsed" ? "Start next period" : "Set up a period"}
                </Button>
              </>
            ) : loading ? (
              <>
                <Skeleton className="mt-2 h-12 w-48" />
                <Skeleton className="mt-4 h-5 w-44" />
              </>
            ) : (
              <>
                <p
                  className={`mt-1 text-[2.75rem] font-extrabold leading-tight tracking-tight ${
                    overspent ? "text-destructive" : "text-foreground"
                  }`}
                >
                  <AnimatedNumber
                    value={stats?.leftToSpend ?? 0}
                    prefix="$"
                    decimals={2}
                  />
                </p>
                {overspent && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                    {formatMoney(Math.abs(stats.leftToSpend))} past this {noun}&apos;s
                    budget — no daily budget until more income lands.
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
                  <span className="flex items-center gap-1.5 text-success">
                    <TrendingUp className="h-4 w-4" />
                    <AnimatedNumber
                      value={stats?.periodIncome ?? 0}
                      prefix="$"
                      decimals={2}
                    />
                    <span className="text-muted-foreground">in</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-destructive">
                    <Receipt className="h-4 w-4" />
                    <AnimatedNumber
                      value={stats?.periodExpenses ?? 0}
                      prefix="$"
                      decimals={2}
                    />
                    <span className="text-muted-foreground">out</span>
                  </span>
                  {stats?.periodSavings > 0 && (
                    <span className="flex items-center gap-1.5 text-primary">
                      <PiggyBank className="h-4 w-4" />
                      <AnimatedNumber
                        value={stats?.periodSavings ?? 0}
                        prefix="$"
                        decimals={2}
                      />
                      <span className="text-muted-foreground">saved</span>
                    </span>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Where this period's money physically sits. Hides itself entirely
          until the user has made an account. */}
      <div className="mt-4">
        <AccountsCard />
      </div>

      {/* Streak */}
      <div className="mt-4">
        <StreakCard />
      </div>

      {/* Secondary stats */}
      <motion.div
        variants={staggerContainer(0.1, 0.2)}
        initial="initial"
        animate="animate"
        className="mt-4 grid grid-cols-2 gap-3"
      >
        <StatCard
          icon={PiggyBank}
          label="Total saved"
          value={stats?.totalSavings ?? 0}
          prefix="$"
          decimals={2}
          loading={loading}
        />
        <StatCard
          icon={TrendingUp}
          label={`Saved this ${noun}`}
          value={stats?.percentageSaved ?? 0}
          suffix="%"
          decimals={0}
          loading={loading}
        />
      </motion.div>

      {/* Quick actions */}
      <motion.div
        variants={staggerContainer(0.08, 0.35)}
        initial="initial"
        animate="animate"
        className="mt-8"
      >
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Quick actions
        </h2>
        <div className="space-y-3">
          {quickActions.map(({ to, label, desc, icon: Icon }) => (
            <motion.button
              key={to}
              variants={fadeScaleItem}
              whileTap={{ scale: 0.98 }}
              onClick={() => navigate(to)}
              className="flex w-full items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{label}</span>
                <span className="block text-sm text-muted-foreground">{desc}</span>
              </span>
              <ArrowRight className="h-5 w-5 shrink-0 text-muted-foreground" />
            </motion.button>
          ))}
        </div>
      </motion.div>
    </PageWrapper>
  );
}

function StatCard({ icon: Icon, label, value, prefix, suffix, decimals, loading }) {
  return (
    <motion.div variants={fadeScaleItem}>
      <Card className="h-full">
        <CardContent className="flex flex-col gap-2 p-4">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="h-[18px] w-[18px]" />
          </span>
          {loading ? (
            <Skeleton className="mt-1 h-8 w-24" />
          ) : (
            <div className="mt-1 text-2xl font-extrabold tracking-tight">
              <AnimatedNumber
                value={value}
                prefix={prefix}
                suffix={suffix}
                decimals={decimals}
              />
            </div>
          )}
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </CardContent>
      </Card>
    </motion.div>
  );
}
