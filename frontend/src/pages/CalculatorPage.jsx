import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ShoppingBag, TrendingUp, Target, Receipt } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHomeStats, fetchStreak } from "@/api/endpoints";
import {
  cn,
  monthName,
  formatMoney,
  localToday,
  daysLeftInMonth,
} from "@/lib/utils";
import { staggerContainer, fadeUp } from "@/animations/variants";

/**
 * Live planners driven by this month's real numbers (home stats + the streak's
 * canonical daily budget), so everything here matches the Home page exactly.
 */
export default function CalculatorPage() {
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchHomeStats(),
      fetchStreak(localToday()).catch(() => null),
    ])
      .then(([s, st]) => {
        setStats(s);
        setStreak(st);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const now = new Date();
  const todayDate = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysLeftInMonth(); // incl. today
  const daysAfterToday = daysInMonth - todayDate;

  const income = stats?.monthIncome ?? 0;
  const spentSoFar = stats?.monthExpenses ?? 0;
  const savings = stats?.monthSavings ?? 0;
  const todayBudget = streak?.today?.budget ?? 0;
  const spentToday = streak?.today?.spent ?? 0;
  const leftToday = todayBudget - spentToday;
  const spentBeforeToday = spentSoFar - spentToday;

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-2xl font-extrabold tracking-tight">Calculator</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Live planning from your {monthName(now.getMonth())} numbers.
        </p>
      </motion.div>

      {loading ? (
        <div className="mt-5 space-y-4">
          <Card>
            <CardContent className="space-y-3 p-6">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-12 w-44" />
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </Card>
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardContent className="space-y-3 p-5">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : income <= 0 ? (
        <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-5">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Receipt className="h-6 w-6" />
              </span>
              <p className="font-semibold">No income logged this month</p>
              <p className="text-sm text-muted-foreground">
                Add your {monthName(now.getMonth())} income and these planners
                will work out what you can spend, live.
              </p>
              <Button onClick={() => navigate("/transactions")} className="mt-1">
                Add income
              </Button>
            </CardContent>
          </Card>
        </motion.div>
      ) : (
        <motion.div
          variants={staggerContainer(0.12, 0.1)}
          initial="initial"
          animate="animate"
          className="mt-5 grid gap-4"
        >
          <DynamicDailyCard
            income={income}
            savings={savings}
            spentSoFar={spentSoFar}
            daysAfterToday={daysAfterToday}
          />
          <WhatIfCard
            leftToday={leftToday}
            income={income}
            savings={savings}
            spentSoFar={spentSoFar}
            daysAfterToday={daysAfterToday}
          />
          <PaceForecastCard
            income={income}
            savings={savings}
            spentSoFar={spentSoFar}
            todayDate={todayDate}
            daysInMonth={daysInMonth}
            daysAfterToday={daysAfterToday}
            todayBudget={todayBudget}
          />
          <GoalDailyCard
            income={income}
            savings={savings}
            spentBeforeToday={spentBeforeToday}
            daysLeft={daysLeft}
          />
        </motion.div>
      )}
    </PageWrapper>
  );
}

/* ── 1. Dynamic daily budget ────────────────────────────────────────── */

function DynamicDailyCard({ income, savings, spentSoFar, daysAfterToday }) {
  const remaining = income - savings - spentSoFar;
  const lastDay = daysAfterToday === 0;
  // Everything spent so far — today included — is off the table; what's left
  // spreads over the days after today. Recalculates with every expense.
  const perDay = lastDay ? remaining : remaining / daysAfterToday;
  const over = perDay < 0;

  return (
    <motion.div variants={fadeUp}>
      <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <CardContent className="relative p-6">
          <p className="text-sm font-medium text-muted-foreground">
            {lastDay ? "Left for the rest of today" : "Dynamic daily budget"}
          </p>
          <p
            className={cn(
              "mt-1 text-[2.75rem] font-extrabold leading-tight tracking-tight",
              over ? "text-destructive" : "text-foreground"
            )}
          >
            <AnimatedNumber value={perDay} prefix="$" decimals={2} />
            {!lastDay && (
              <span className="text-xl font-bold text-muted-foreground">
                /day
              </span>
            )}
          </p>
          <div className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Income</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatMoney(income)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Savings goal</span>
              <span className="font-medium tabular-nums text-foreground">
                −{formatMoney(savings)}
              </span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Spent so far (incl. today)</span>
              <span className="font-medium tabular-nums text-foreground">
                −{formatMoney(spentSoFar)}
              </span>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            {over
              ? "You've spent past your savings goal — anything more eats into it."
              : lastDay
                ? "Last day of the month — this is what's left after your savings goal."
                : `${formatMoney(remaining)} left, spread over the ${daysAfterToday} ${
                    daysAfterToday === 1 ? "day" : "days"
                  } after today. Updates the moment you log an expense — unlike the fixed budget on Home.`}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── 2. What-if purchase ────────────────────────────────────────────── */

function WhatIfCard({ leftToday, income, savings, spentSoFar, daysAfterToday }) {
  const [price, setPrice] = useState("");
  const p = Number(price) || 0;
  const show = price !== "" && p > 0;

  const afterToday = leftToday - p;
  const newDaily =
    daysAfterToday > 0 ? (income - savings - spentSoFar - p) / daysAfterToday : null;

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <ShoppingBag className="h-5 w-5" />
          </div>
          <CardTitle>What if I buy…</CardTitle>
          <CardDescription>
            See what a purchase does to today and to the rest of the month.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="whatif-price">Price</Label>
            <Input
              id="whatif-price"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="e.g. 35"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          {show && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 space-y-2 rounded-xl bg-primary/5 p-4 text-sm"
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-muted-foreground">Left for today</span>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    afterToday < 0 ? "text-destructive" : "text-success"
                  )}
                >
                  {formatMoney(afterToday)}
                </span>
              </div>
              {newDaily !== null && (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">
                    Each of the next {daysAfterToday}{" "}
                    {daysAfterToday === 1 ? "day" : "days"} becomes
                  </span>
                  <span
                    className={cn(
                      "font-bold tabular-nums",
                      newDaily < 0 ? "text-destructive" : "text-foreground"
                    )}
                  >
                    {formatMoney(newDaily)}/day
                  </span>
                </div>
              )}
              {(newDaily !== null ? newDaily < 0 : afterToday < 0) ? (
                <p className="pt-1 text-xs text-destructive">
                  This would put the month over budget.
                </p>
              ) : (
                afterToday < 0 && (
                  <p className="pt-1 text-xs text-muted-foreground">
                    Over today's budget — the remaining days absorb it.
                  </p>
                )
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── 3. Pace & forecast ─────────────────────────────────────────────── */

function PaceForecastCard({
  income,
  savings,
  spentSoFar,
  todayDate,
  daysInMonth,
  daysAfterToday,
  todayBudget,
}) {
  const now = new Date();
  const avgDaily = todayDate > 0 ? spentSoFar / todayDate : 0;
  const spendable = income - savings;
  const runwayDay =
    avgDaily > 0 ? todayDate + (spendable - spentSoFar) / avgDaily : Infinity;
  const projectedSaved = income - (spentSoFar + avgDaily * daysAfterToday);
  const lastsAllMonth = !isFinite(runwayDay) || runwayDay >= daysInMonth;
  const meetsGoal = projectedSaved >= savings - 1e-9;

  const Row = ({ label, value, tone }) => (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("text-right font-bold tabular-nums", tone)}>{value}</span>
    </div>
  );

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <TrendingUp className="h-5 w-5" />
          </div>
          <CardTitle>Pace &amp; forecast</CardTitle>
          <CardDescription>
            Where this month is heading if you keep spending like this.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <Row label="Current pace" value={`${formatMoney(avgDaily)}/day`} />
          <Row
            label="Budget runs out"
            value={
              lastsAllMonth
                ? "Lasts all month"
                : runwayDay < todayDate
                  ? "Already over"
                  : `≈ ${monthName(now.getMonth()).slice(0, 3)} ${Math.floor(runwayDay)}`
            }
            tone={lastsAllMonth ? "text-success" : "text-destructive"}
          />
          <Row
            label="Projected saved by month end"
            value={formatMoney(projectedSaved)}
            tone={meetsGoal ? "text-success" : "text-destructive"}
          />
          <p className="pt-1 text-xs text-muted-foreground">
            {meetsGoal
              ? `On pace to meet your ${formatMoney(savings)} savings goal.`
              : `${formatMoney(savings - projectedSaved)} short of your ${formatMoney(
                  savings
                )} goal at this pace — keeping to ${formatMoney(
                  todayBudget
                )}/day gets you back on plan.`}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── 4. Goal ↔ daily ────────────────────────────────────────────────── */

function GoalDailyCard({ income, savings, spentBeforeToday, daysLeft }) {
  const [target, setTarget] = useState("");
  const [daily, setDaily] = useState("");

  const t = Number(target) || 0;
  const showTarget = target !== "" && t > 0;
  const capForTarget = (income - t - spentBeforeToday) / daysLeft;

  const c = Number(daily) || 0;
  const showDaily = daily !== "" && c >= 0;
  const savedForDaily = income - spentBeforeToday - c * daysLeft;

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-accent text-accent-foreground">
            <Target className="h-5 w-5" />
          </div>
          <CardTitle>Goal ↔ daily</CardTitle>
          <CardDescription>
            Turn a savings goal into a daily cap — or a daily cap into savings.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="goal-target">If I save this much by month end</Label>
            <Input
              id="goal-target"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder={savings > 0 ? `e.g. ${savings}` : "e.g. 300"}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
            {showTarget && (
              <p className="text-sm">
                {capForTarget < 0 ? (
                  <span className="font-medium text-destructive">
                    Not doable — you've already spent past that goal.
                  </span>
                ) : (
                  <>
                    <span className="text-muted-foreground">Spend at most </span>
                    <span className="font-bold tabular-nums">
                      {formatMoney(capForTarget)}/day
                    </span>
                    <span className="text-muted-foreground">
                      {" "}
                      for the {daysLeft} {daysLeft === 1 ? "day" : "days"} left
                      (incl. today).
                    </span>
                  </>
                )}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-daily">If I spend this much per day</Label>
            <Input
              id="goal-daily"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              placeholder="e.g. 20"
              value={daily}
              onChange={(e) => setDaily(e.target.value)}
            />
            {showDaily && (
              <p className="text-sm">
                <span className="text-muted-foreground">
                  You'd end the month with{" "}
                </span>
                <span
                  className={cn(
                    "font-bold tabular-nums",
                    savedForDaily < 0
                      ? "text-destructive"
                      : savedForDaily >= savings
                        ? "text-success"
                        : "text-foreground"
                  )}
                >
                  {formatMoney(savedForDaily)}
                </span>
                <span className="text-muted-foreground"> saved</span>
                {savings > 0 && savedForDaily >= 0 && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {savedForDaily >= savings ? "meets" : "misses"} your{" "}
                    {formatMoney(savings)} goal.
                  </span>
                )}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
