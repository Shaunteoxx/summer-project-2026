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
      toast.error(err?.response?.data?.message || "Couldn't restore streak. Please try again.");
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
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-md bg-surface-2 text-ink-2">
              <Flame className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[17px] font-semibold tracking-[-0.015em]">No Budget Period Running</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                Start your next period to pick your streak back up. Days in
                between aren't counted for or against you.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/more")}>
              Start a Period
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
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="flex h-[52px] w-[52px] items-center justify-center rounded-md bg-surface-2 text-ink-2">
              <Flame className="h-6 w-6" />
            </span>
            <div>
              <p className="text-[17px] font-semibold tracking-[-0.015em]">Start a Spending Streak</p>
              <p className="mt-1 text-[13px] leading-relaxed text-ink-3">
                Add your income for this {noun} to unlock your daily budget and
                start a streak.
              </p>
            </div>
            <Button size="sm" onClick={() => navigate("/transactions")}>
              Add Income
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
    leftToSpend = 0,
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
  // The rate the period is actually on now, not the one it handed out this
  // morning: what's left after today's spending, spread over the days after
  // today. Same figure as Plan's hero, so the reader doesn't have to go there
  // to find out what logging an expense just did to their budget.
  const daysAfterToday = Math.max(0, daysLeft - 1);
  const dynamicDaily =
    daysAfterToday > 0 ? Math.max(leftToSpend, 0) / daysAfterToday : 0;

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card className="overflow-hidden">
        <CardContent>
          {/* Header: current + best */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="flex h-[42px] w-[42px] items-center justify-center rounded-sm bg-surface-2 text-ink-2">
                <Flame className="h-5 w-5" />
              </span>
              <div>
                <p className="num text-[27px] font-medium leading-none tracking-[-0.025em]">
                  {currentStreak}
                </p>
                <p className="mt-1 text-[13px] text-ink-3">
                  day{currentStreak === 1 ? "" : "s"} on budget
                </p>
              </div>
            </div>
            <span className="flex items-center gap-1.5 rounded-xs bg-surface-2 px-2 py-[3px] text-[11px] font-medium text-ink-2">
              <Trophy className="h-3.5 w-3.5" /> Best {longestStreak}
            </span>
          </div>

          {/* Today's budget progress */}
          <div className="mt-3">
            <div className="mb-2 flex items-baseline justify-between text-[13px]">
              <span className="font-medium text-ink-2">Today</span>
              <span className="num text-ink-3">
                {overspent
                  ? formatMoney(today.spent)
                  : `${formatMoney(today.spent)} of ${formatMoney(today.budget)}`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
              <motion.div
                className={`h-full rounded-full ${
                  overspent || !today.within ? "bg-negative" : "bg-positive"
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${pct * 100}%` }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
            <div className="mt-1.5 flex items-baseline justify-between gap-2">
              <p
                className={`text-[12px] font-medium ${
                  overspent || !today.within ? "text-negative" : "text-positive"
                }`}
              >
                {overspent
                  ? `${formatMoney(overspentBy)} past this ${noun}'s budget`
                  : today.within
                    ? `${formatMoney(Math.max(today.remaining, 0))} left to spend today`
                    : `${formatMoney(Math.abs(today.remaining))} over today's budget`}
              </p>
              <p className="shrink-0 text-[12px] text-ink-3">
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </p>
            </div>
            {/* What the rest of the period is on now that today has been spent
                — the number Plan leads with, so Home can answer it too. */}
            {overspent ? (
              <div className="mt-2.5 flex items-start gap-2 rounded-md bg-negative/[0.08] p-3">
                <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0 text-negative" />
                <p className="text-[11.5px] leading-relaxed text-ink-2">
                  You&apos;ve spent more than this {noun}&apos;s income minus your{" "}
                  {formatMoney(periodSavings)} savings target, so there&apos;s no
                  daily budget left. It won&apos;t reset until{" "}
                  {activePeriod?.end ? formatDay(activePeriod.end) : "the period ends"}
                  {daysLeft > 1 ? ` — ${daysLeft} days away` : ""}. Logging new
                  income brings it back.
                </p>
              </div>
            ) : (
              <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">
                {daysAfterToday > 0 ? (
                  <>
                    {formatMoney(dynamicDaily)}/day for the {daysAfterToday}{" "}
                    {daysAfterToday === 1 ? "day" : "days"} after today, with
                    today&apos;s spending and your {formatMoney(periodSavings)} set
                    aside counted. Moves with every entry.
                  </>
                ) : (
                  <>
                    Last day of this {noun}, so today&apos;s budget is everything
                    left after your {formatMoney(periodSavings)} set aside.
                  </>
                )}
              </p>
            )}
            <button
              onClick={() => navigate("/plan")}
              className="mt-1.5 rounded-sm text-[11.5px] font-medium text-ink-2 underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Plan with today's budget →
            </button>
          </div>

          {/* Last 7 days */}
          <div className="mt-3 flex justify-between gap-1.5">
            {last7.map((d) => (
              <DayCell key={d.date} day={d} />
            ))}
          </div>

          {/* Saves + restore */}
          <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[13px] text-ink-3">
                <span className="num font-semibold text-ink">
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
                          ? "fill-ink text-ink"
                          : "text-ink-3/40"
                      }`}
                    />
                  ))
                ) : (
                  <>
                    <Shield className="h-4 w-4 fill-ink text-ink" />
                    <span className="num text-[12px] font-medium text-ink-3">
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
        title="Restore Your Streak?"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md bg-surface-2 p-4">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" />
            <p className="text-[13px] leading-relaxed text-ink-2">
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
              {restoring ? "Restoring…" : "Use a Save"}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </motion.div>
  );
}

const CELL = {
  win: { Icon: Check, cls: "bg-positive/[0.12] text-positive", label: "within budget" },
  // Green, not amber. Amber says "something still needs your attention", which
  // is wrong once a restore has succeeded — the streak IS intact. The shield
  // glyph carries the distinction instead: a tick means you stayed within
  // budget, a shield means the day was repaired. Colour tells you the outcome,
  // shape tells you how you got there.
  saved: { Icon: Shield, cls: "bg-positive/[0.12] text-positive", label: "restored" },
  break: { Icon: X, cls: "bg-negative/[0.12] text-negative", label: "over budget" },
  // Outside every budget period, so it has no budget to be judged against.
  untracked: {
    Icon: Minus,
    cls: "bg-surface-2 text-ink-3/60",
    label: "not in a budget period",
  },
  none: { Icon: Minus, cls: "bg-surface-2 text-ink-3/60", label: "no data" },
};

function DayCell({ day }) {
  const isToday = day.status === "today";
  const within = isToday ? day.within : day.status === "win";
  const meta = isToday
    ? within
      ? { Icon: Flame, cls: "bg-ink text-surface", label: "today, on track" }
      : { Icon: Flame, cls: "bg-negative text-white", label: "today, over budget" }
    : CELL[day.status] ?? CELL.none;
  const { Icon, cls, label } = meta;

  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span
        className={`flex h-9 w-full items-center justify-center rounded-[8px] ${cls}`}
        role="img"
        aria-label={`${day.date}: ${label}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="text-[10px] font-medium text-ink-3">
        {dowOf(day.date)}
      </span>
    </div>
  );
}
