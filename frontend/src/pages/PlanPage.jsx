import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeftRight, Receipt } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchHomeStats, fetchStreak } from "@/api/endpoints";
import { cn, formatMoney, localToday } from "@/lib/utils";
import { addDaysYmd, formatDay, formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useToast } from "@/hooks/useToast";
import { staggerContainer, fadeUp } from "@/animations/variants";

/**
 * Live planners driven by this period's real numbers (home stats + the streak's
 * canonical daily budget), so everything here matches the Home page exactly.
 */
export default function PlanPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const budgetPeriod = useBudgetPeriod();
  const [stats, setStats] = useState(null);
  const [streak, setStreak] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchHomeStats(localToday()),
      fetchStreak(localToday()).catch(() => null),
    ])
      .then(([s, st]) => {
        setStats(s);
        setStreak(st);
      })
      .catch(() => toast.error("Couldn't load your budget. Please try again."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const period = stats?.period ?? budgetPeriod.current;
  const noun = budgetPeriod.noun;
  const periodDays = period?.days ?? 0;
  const daysLeft = period?.daysLeft ?? 0; // incl. today
  const daysAfterToday = Math.max(0, daysLeft - 1);
  // How far into the period today is, 1-based — the equivalent of the old
  // day-of-month, but measured against the period rather than the calendar.
  const dayOfPeriod = periodDays - daysLeft + 1;

  const income = stats?.periodIncome ?? 0;
  const spentSoFar = stats?.periodExpenses ?? 0;
  const savings = stats?.periodSavings ?? 0;
  const todayBudget = streak?.today?.budget ?? 0;
  const spentToday = streak?.today?.spent ?? 0;
  const leftToday = todayBudget - spentToday;
  const spentBeforeToday = spentSoFar - spentToday;

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-title-lg">Plan</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Live off your real{" "}
          {period ? formatPeriodLabel(period, { mode: budgetPeriod.mode }) : "budget"}{" "}
          numbers.
        </p>
      </motion.div>

      {loading ? (
        /* Same shapes as the real content: a bare centred figure, then three
           cards. Skeletons sized to what they replace so nothing jumps. */
        <div className="mt-[22px]">
          <div className="flex flex-col items-center">
            <Skeleton className="h-[11px] w-36" />
            <Skeleton className="mt-2.5 h-10 w-40" />
            <Skeleton className="mt-3 h-3 w-56" />
          </div>
          <div className="mt-[26px] space-y-3">
            {[...Array(3)].map((_, i) => (
              <Card key={i}>
                <CardContent>
                  <Skeleton className="h-[15px] w-36" />
                  <Skeleton className="mt-3 h-[46px] w-full rounded-md" />
                  <Skeleton className="mt-4 h-[52px] w-full" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ) : income <= 0 ? (
        <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-5">
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-md bg-surface-2 text-ink-2">
                <Receipt className="h-6 w-6" />
              </span>
              <p className="text-[17px] font-semibold tracking-[-0.015em]">
                No income logged this {noun}
              </p>
              <p className="text-[13px] leading-relaxed text-ink-3">
                Add your {noun}&apos;s income and these planners will work out what
                you can spend, live.
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
          className="mt-[22px]"
        >
          <DynamicDailyHero
            income={income}
            savings={savings}
            spentSoFar={spentSoFar}
            daysAfterToday={daysAfterToday}
            noun={noun}
          />
          <div className="mt-[26px] space-y-3">
            <WhatIfCard
              leftToday={leftToday}
              income={income}
              savings={savings}
              spentSoFar={spentSoFar}
              daysAfterToday={daysAfterToday}
              noun={noun}
            />
            <PaceForecastCard
              income={income}
              savings={savings}
              spentSoFar={spentSoFar}
              periodDays={periodDays}
              dayOfPeriod={dayOfPeriod}
              periodEndYmd={period?.end}
              daysAfterToday={daysAfterToday}
              todayBudget={todayBudget}
              noun={noun}
            />
            <GoalDailyCard
              income={income}
              savings={savings}
              spentBeforeToday={spentBeforeToday}
              daysLeft={daysLeft}
              noun={noun}
            />
          </div>
        </motion.div>
      )}
    </PageWrapper>
  );
}

/* ── Shared bits ────────────────────────────────────────────────────── */

/** Card title. 15px/600 — the sheet-and-card size from the type scale. */
function CardHeading({ children }) {
  return (
    <h2 className="text-[15px] font-semibold tracking-[-0.015em]">{children}</h2>
  );
}

/**
 * One half of a card's result strip: a small ink-3 label over a 20px figure.
 * Two of these sit side by side above a hairline, which is how every planner
 * reports its answer.
 */
function Metric({ label, value, tone }) {
  return (
    <div className="flex-1">
      <p className="text-[11.5px] text-ink-3">{label}</p>
      <p className={cn("num mt-1 text-[20px] font-medium", tone ?? "text-ink")}>
        {value}
      </p>
    </div>
  );
}

/**
 * A field label. The shared `Label` is 13px/500 ink-2, which is right above a
 * form field but shouts next to an 11.5px metric caption — these labels sit in
 * the same rows as those, so they take the same size and colour.
 */
function FieldLabel({ htmlFor, children }) {
  return (
    <Label htmlFor={htmlFor} className="mb-1.5 block text-[11.5px] font-normal text-ink-3">
      {children}
    </Label>
  );
}

/** −$4.50, not -$4.50. The spec's minus is U+2212, which aligns with the digits. */
const signed = (v) => (v < 0 ? `−${formatMoney(Math.abs(v))}` : formatMoney(v));

/** A money input with the currency sign set inside the field, per the spec. */
function MoneyInput({ id, value, onChange, placeholder, className }) {
  return (
    <div className="relative">
      <span
        className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-base text-ink-3"
        aria-hidden="true"
      >
        $
      </span>
      <Input
        id={id}
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("pl-7", className)}
      />
    </div>
  );
}

/* ── 1. Dynamic daily budget ────────────────────────────────────────── */

/**
 * Not a card. The spec puts this figure bare on the canvas at 40px, the same
 * treatment Home gives its hero — it's the answer the whole page exists to
 * give, so boxing it would file it alongside the three tools below it.
 *
 * The old version stacked a tinted gradient, a `blur-3xl` glow blob and a
 * border tint on a card, then listed income / savings / spent underneath. Those
 * three rows already live on Home's In / Out / Saved strip; what's load-bearing
 * here is the division, which the caption now states outright.
 */
export function DynamicDailyHero({ income, savings, spentSoFar, daysAfterToday, noun }) {
  const remaining = income - savings - spentSoFar;
  const lastDay = daysAfterToday === 0;
  // Everything spent so far — today included — is off the table; what's left
  // spreads over the days after today. Recalculates with every expense.
  const perDay = lastDay ? remaining : remaining / daysAfterToday;
  const over = perDay < 0;

  return (
    <motion.div variants={fadeUp} className="text-center">
      <p className="text-overline text-ink-3">
        {over
          ? `Past this ${noun}'s budget`
          : lastDay
            ? "Left for the rest of today"
            : "Dynamic daily budget"}
      </p>
      <p
        className={cn(
          "num-display mt-2 text-[40px] leading-[1.05]",
          over ? "text-negative" : "text-ink"
        )}
      >
        <AnimatedNumber
          value={over ? Math.abs(remaining) : perDay}
          prefix={over ? "−$" : "$"}
          decimals={2}
        />
      </p>
      <p className="mt-[7px] text-[12.5px] leading-relaxed text-ink-3">
        {over
          ? `You're ${formatMoney(
              Math.abs(remaining)
            )} past what this ${noun} had to spend. No daily budget until more income lands.`
          : lastDay
            ? `Last day of the ${noun} — this is what's left after your savings goal.`
            : `${formatMoney(remaining)} left ÷ ${daysAfterToday} ${
                daysAfterToday === 1 ? "day" : "days"
              }. Recalculates the moment you log anything.`}
      </p>
    </motion.div>
  );
}

/* ── 2. What-if purchase ────────────────────────────────────────────── */

export function WhatIfCard({ leftToday, income, savings, spentSoFar, daysAfterToday, noun }) {
  const [price, setPrice] = useState("");
  const p = Number(price) || 0;
  const show = price !== "" && p > 0;

  const afterToday = leftToday - p;
  const newDaily =
    daysAfterToday > 0 ? (income - savings - spentSoFar - p) / daysAfterToday : null;

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardContent>
          <CardHeading>What if I buy…</CardHeading>

          <div className="mt-3">
            <FieldLabel htmlFor="whatif-price">Price</FieldLabel>
            <MoneyInput
              id="whatif-price"
              value={price}
              onChange={setPrice}
              placeholder="35.00"
            />
          </div>

          {show && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
            >
              <div className="mt-3.5 flex border-t border-hairline pt-3.5">
                <Metric
                  label="Left for today"
                  value={signed(afterToday)}
                  tone={afterToday < 0 ? "text-negative" : "text-positive"}
                />
                {newDaily !== null && (
                  <Metric
                    label="New daily budget"
                    value={`${signed(newDaily)}/day`}
                    tone={newDaily < 0 ? "text-negative" : undefined}
                  />
                )}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
                {(newDaily !== null ? newDaily < 0 : afterToday < 0)
                  ? `This would put the ${noun} over budget.`
                  : afterToday < 0
                    ? `Over today's budget — the remaining ${daysAfterToday} ${
                        daysAfterToday === 1 ? "day absorbs" : "days absorb"
                      } it.`
                    : `Still comfortable — today and the rest of the ${noun} both stay in the black.`}
              </p>
            </motion.div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── 3. Pace & forecast ─────────────────────────────────────────────── */

export function PaceForecastCard({
  income,
  savings,
  spentSoFar,
  periodDays,
  dayOfPeriod,
  periodEndYmd,
  daysAfterToday,
  todayBudget,
  noun,
}) {
  // Everything here is measured in days into the period, so it works the same
  // whether that period is a calendar month or an arbitrary span.
  const avgDaily = dayOfPeriod > 0 ? spentSoFar / dayOfPeriod : 0;
  const spendable = income - savings;
  const runwayDay =
    avgDaily > 0 ? dayOfPeriod + (spendable - spentSoFar) / avgDaily : Infinity;
  const projectedSaved = income - (spentSoFar + avgDaily * daysAfterToday);
  const lastsAllPeriod = !isFinite(runwayDay) || runwayDay >= periodDays;
  const meetsGoal = projectedSaved >= savings - 1e-9;
  // Turn "day N of the period" back into a real date for the runway label.
  const runwayYmd =
    periodEndYmd && isFinite(runwayDay)
      ? addDaysYmd(periodEndYmd, Math.floor(runwayDay) - periodDays)
      : null;

  // The same two numbers Home's pace bar uses, derived the same way: fill is
  // budget consumed, tick is where you'd be spending evenly. Ahead of the tick
  // is trouble. `dayOfPeriod - 1` is Home's `periodDays - daysLeft`.
  const spentPct = spendable > 0 ? Math.min((spentSoFar / spendable) * 100, 100) : 0;
  const elapsedPct =
    periodDays > 0 ? Math.min(((dayOfPeriod - 1) / periodDays) * 100, 100) : 0;

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardContent>
          <CardHeading>Pace &amp; forecast</CardHeading>

          {/* Same markup as HomePage's hero meter, so the two pages can't
              disagree about how far through the budget you are. */}
          <div className="relative mt-4 h-1 rounded-full bg-surface-3">
            <div
              className={cn(
                "h-full rounded-full",
                spentPct >= 100 ? "bg-negative" : "bg-ink"
              )}
              style={{ width: `${spentPct}%` }}
            />
            {periodDays > 0 && (
              <span
                className="absolute -top-1 h-3 w-[1.5px] rounded-full bg-ink-3"
                style={{ left: `${elapsedPct}%` }}
                aria-hidden="true"
              />
            )}
          </div>
          <div className="mt-2 flex justify-between text-[11.5px] text-ink-3">
            <span>{Math.round(spentPct)}% spent</span>
            <span>
              {Math.round(elapsedPct)}% of the {noun} gone
            </span>
          </div>

          <div className="mt-4 flex border-t border-hairline pt-3.5">
            <Metric
              label="Spending / day so far"
              value={`${formatMoney(avgDaily)}/day`}
            />
            <Metric
              label="Projected saved"
              value={signed(projectedSaved)}
              tone={meetsGoal ? "text-positive" : "text-negative"}
            />
          </div>

          <p className="mt-3 text-[12px] leading-relaxed text-ink-3">
            {meetsGoal
              ? `On pace to meet your ${formatMoney(savings)} savings goal.`
              : `${formatMoney(savings - projectedSaved)} short of your ${formatMoney(
                  savings
                )} goal at this pace — keeping to ${formatMoney(
                  todayBudget
                )}/day gets you back on plan.`}{" "}
            {lastsAllPeriod
              ? `Your budget lasts the whole ${noun}.`
              : runwayDay < dayOfPeriod
                ? "You're already past what it had to spend."
                : `At this pace it runs out around ${
                    runwayYmd ? formatDay(runwayYmd) : `day ${Math.floor(runwayDay)}`
                  }.`}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ── 4. Goal ↔ daily cap ────────────────────────────────────────────── */

/**
 * Two views of one number: a savings target for the period, and the daily cap
 * that reaches it. Typing in either field recomputes the other, so the two can
 * never disagree — the previous version was two independent calculators that
 * could sit there showing contradictory answers at the same time.
 */
export function GoalDailyCard({ income, savings, spentBeforeToday, daysLeft, noun }) {
  const [goal, setGoal] = useState("");
  const [daily, setDaily] = useState("");

  const days = Math.max(daysLeft, 1);
  const dailyForGoal = (g) => (income - g - spentBeforeToday) / days;
  const goalForDaily = (d) => income - spentBeforeToday - d * days;

  // Clamp the derived side at zero: a negative daily cap isn't a smaller
  // number, it's an impossible plan, and the caption says so instead.
  const derive = (raw, fn, set) => {
    const n = Number(raw);
    set(raw === "" || !isFinite(n) ? "" : Math.max(fn(n), 0).toFixed(2));
  };

  const onGoal = (v) => {
    setGoal(v);
    derive(v, dailyForGoal, setDaily);
  };
  const onDaily = (v) => {
    setDaily(v);
    derive(v, goalForDaily, setGoal);
  };

  const g = Number(goal);
  const entered = goal !== "" && isFinite(g);
  const impossible = entered && dailyForGoal(g) < 0;
  const diff = entered && savings > 0 ? g - savings : 0;

  return (
    <motion.div variants={fadeUp}>
      <Card>
        <CardContent>
          <CardHeading>Goal ↔ daily cap</CardHeading>

          <div className="mt-3 flex items-end gap-2.5">
            <div className="min-w-0 flex-1">
              <FieldLabel htmlFor="goal-target">Save this {noun}</FieldLabel>
              <MoneyInput
                id="goal-target"
                value={goal}
                onChange={onGoal}
                placeholder={savings > 0 ? String(savings) : "300"}
              />
            </div>
            <span
              className="flex h-[46px] w-4 shrink-0 items-center justify-center text-ink-3"
              aria-hidden="true"
            >
              <ArrowLeftRight className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <FieldLabel htmlFor="goal-daily">Spend at most</FieldLabel>
              <MoneyInput
                id="goal-daily"
                value={daily}
                onChange={onDaily}
                placeholder="20"
              />
            </div>
          </div>

          <p
            className={cn(
              "mt-3 text-[12px] leading-relaxed",
              impossible ? "text-negative" : "text-ink-3"
            )}
          >
            {impossible
              ? "Not doable — you've already spent past that target."
              : entered
                ? `Over the ${days} ${days === 1 ? "day" : "days"} left, including today.${
                    diff > 0
                      ? ` ${formatMoney(diff)} tighter than your current target.`
                      : diff < 0
                        ? ` ${formatMoney(-diff)} looser than your current target.`
                        : ""
                  }`
                : `Type into either side. Spread over the ${days} ${
                    days === 1 ? "day" : "days"
                  } left, including today.`}
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}
