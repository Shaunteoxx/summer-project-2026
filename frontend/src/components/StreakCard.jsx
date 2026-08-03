import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Flame, Trophy, Shield, Check, X, Minus, AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BottomSheet from "@/components/BottomSheet";
import { fetchStreak, restoreStreak } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { formatMoney, localToday } from "@/lib/utils";
import { formatDay } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { fadeUp } from "@/animations/variants";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const dowOf = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

export default function StreakCard() {
  const navigate = useNavigate();
  const toast = useToast();
  const guard = useDemoGuard();
  const { noun } = useBudgetPeriod();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    fetchStreak(localToday())
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const handleRestore = async () => {
    if (!data?.restore) return;
    setRestoring(true);
    try {
      const updated = await restoreStreak({
        date: data.restore.date,
        today: localToday(),
      });
      setData(updated);
      setConfirmOpen(false);
      toast.success("Streak restored! 🔥");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't restore streak.");
    } finally {
      setRestoring(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-4 p-5">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-3 w-full rounded-full" />
          <div className="flex justify-between gap-2">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="h-9 w-9 rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // No period running (days mode, lapsed or not yet set up) — there's no
  // window to budget across, so point at the settings rather than the ledger.
  if (data && data.periodStatus === "inactive") {
    return (
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Flame className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold">No budget period running</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Start your next period to pick your streak back up. Days in
                between aren't counted for or against you.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/more")}>
              Start a period
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  // Needs income logged this period for a daily budget to exist.
  if (!data || !data.hasIncome) {
    return (
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Flame className="h-6 w-6" />
            </span>
            <div>
              <p className="font-semibold">Start a spending streak</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Add your income for this {noun} to unlock your daily budget and
                start a streak.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/transactions")}>
              Add income
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    );
  }

  const {
    today,
    currentStreak,
    longestStreak,
    savesLeftThisPeriod,
    last7,
    restore,
    periodSavings,
    overspentBy = 0,
    period: activePeriod,
  } = data;
  // Past the whole period's budget: the daily figure is negative and clamped to
  // $0, which would otherwise read as a calm "nothing left" rather than a debt.
  const overspent = overspentBy > 0;
  const pct = overspent
    ? 1
    : today.budget > 0
      ? Math.min(today.spent / today.budget, 1)
      : today.spent > 0
        ? 1
        : 0;
  const daysLeft = activePeriod?.daysLeft ?? 0;
  // Restores scale with period length, so the shield row can't be a fixed
  // three. Long periods show a count instead of an unreadable row of icons.
  const savesTotal = activePeriod?.savesTotal ?? 3;
  const showShields = savesTotal <= 5;

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card className="overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card">
        <CardContent className="p-5">
          {/* Header: current + best */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
                <Flame className="h-6 w-6" />
              </span>
              <div>
                <p className="text-3xl font-extrabold leading-none tracking-tight">
                  {currentStreak}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  day{currentStreak === 1 ? "" : "s"} on budget
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
              <Trophy className="h-3.5 w-3.5" /> Best {longestStreak}
            </span>
          </div>

          {/* Today's budget progress */}
          <div className="mt-5">
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium">Today</span>
              <span className="text-muted-foreground tabular-nums">
                {overspent
                  ? formatMoney(today.spent)
                  : `${formatMoney(today.spent)} of ${formatMoney(today.budget)}`}
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <motion.div
                className={`h-full rounded-full ${
                  overspent || !today.within ? "bg-destructive" : "bg-success"
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p
                className={`text-xs font-medium ${
                  overspent || !today.within ? "text-destructive" : "text-success"
                }`}
              >
                {overspent
                  ? `${formatMoney(overspentBy)} past this ${noun}'s budget`
                  : today.within
                    ? `${formatMoney(Math.max(today.remaining, 0))} left to spend today`
                    : `${formatMoney(Math.abs(today.remaining))} over today's budget`}
              </p>
              <p className="shrink-0 text-xs text-muted-foreground">
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </p>
            </div>
            {/* How the daily budget is worked out (keeps the number transparent). */}
            {overspent ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-destructive" />
                <p className="text-[11px] leading-snug text-muted-foreground">
                  You&apos;ve spent more than this {noun}&apos;s income minus your{" "}
                  {formatMoney(periodSavings)} savings target, so there&apos;s no
                  daily budget left. It won&apos;t reset until{" "}
                  {activePeriod?.end ? formatDay(activePeriod.end) : "the period ends"}
                  {daysLeft > 1 ? ` — ${daysLeft} days away` : ""}. Logging new
                  income brings it back.
                </p>
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
                {formatMoney(today.budget)}/day, after setting aside{" "}
                {formatMoney(periodSavings)}. Not including today&apos;s spending.
              </p>
            )}
            <button
              onClick={() => navigate("/calculator")}
              className="mt-1 text-[11px] font-medium text-primary underline-offset-2 hover:underline"
            >
              Plan with today's budget →
            </button>
          </div>

          {/* Last 7 days */}
          <div className="mt-5 flex justify-between gap-1.5">
            {last7.map((d) => (
              <DayCell key={d.date} day={d} />
            ))}
          </div>

          {/* Saves + restore */}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {savesLeftThisPeriod}
                </span>{" "}
                Restores left this {noun}
              </span>
              <span
                className="flex shrink-0 items-center gap-1"
                aria-label={`${savesLeftThisPeriod} of ${savesTotal} restores left`}
              >
                {showShields ? (
                  [...Array(savesTotal)].map((_, i) => (
                    <Shield
                      key={i}
                      className={`h-4 w-4 ${
                        i < savesLeftThisPeriod
                          ? "fill-primary text-primary"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))
                ) : (
                  <>
                    <Shield className="h-4 w-4 fill-primary text-primary" />
                    <span className="text-xs font-medium text-muted-foreground tabular-nums">
                      / {savesTotal}
                    </span>
                  </>
                )}
              </span>
            </div>
            {restore && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  if (guard()) return;
                  setConfirmOpen(true);
                }}
              >
                <Shield className="h-3.5 w-3.5" /> Restore
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Restore confirmation */}
      <BottomSheet
        open={confirmOpen}
        onClose={() => !restoring && setConfirmOpen(false)}
        title="Restore your streak?"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-xl bg-primary/5 p-4">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <p className="text-sm text-muted-foreground">
              This spends <strong>1 of {restore?.savesLeft}</strong> saves left this{" "}
              {noun} to repair the day you went over budget and bring your streak
              back.
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setConfirmOpen(false)}
              disabled={restoring}
            >
              Cancel
            </Button>
            <Button className="flex-1" onClick={handleRestore} disabled={restoring}>
              {restoring ? "Restoring…" : "Use a save"}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </motion.div>
  );
}

const CELL = {
  win: { Icon: Check, cls: "bg-success/15 text-success", label: "within budget" },
  saved: { Icon: Shield, cls: "bg-amber-500/15 text-amber-500", label: "saved" },
  break: { Icon: X, cls: "bg-destructive/15 text-destructive", label: "over budget" },
  // Outside every budget period, so it has no budget to be judged against.
  untracked: {
    Icon: Minus,
    cls: "bg-muted text-muted-foreground/50",
    label: "not in a budget period",
  },
  none: { Icon: Minus, cls: "bg-muted text-muted-foreground/50", label: "no data" },
};

function DayCell({ day }) {
  const isToday = day.status === "today";
  const within = isToday ? day.within : day.status === "win";
  const meta = isToday
    ? within
      ? { Icon: Flame, cls: "bg-primary/15 text-primary", label: "today, on track" }
      : { Icon: Flame, cls: "bg-destructive/15 text-destructive", label: "today, over budget" }
    : CELL[day.status] ?? CELL.none;
  const { Icon, cls, label } = meta;

  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span
        className={`flex h-9 w-full items-center justify-center rounded-lg ${cls} ${
          isToday ? "ring-2 ring-primary ring-offset-1 ring-offset-card" : ""
        }`}
        role="img"
        aria-label={`${day.date}: ${label}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="text-[10px] font-medium text-muted-foreground">
        {dowOf(day.date)}
      </span>
    </div>
  );
}
