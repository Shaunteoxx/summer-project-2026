import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Trophy, Shield, AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StreakBadgeSlot from "@/components/StreakBadgeSlot";
import StreakBadgesSheet from "@/components/StreakBadgesSheet";
import StreakBreakNote from "@/components/StreakBreakNote";
import StreakDayCell from "@/components/StreakDayCell";
import StreakRestoreSheet from "@/components/StreakRestoreSheet";
import RollingNumber from "@/components/RollingNumber";
import StreakPrompt from "@/components/StreakPrompt";
import { fetchStreak, restoreStreak } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { haptic } from "@/lib/haptics";
import { badgeFor, nextBadge } from "@/lib/streakBadges";
import { streakMoment } from "@/lib/streakMoments";
import { cn, formatMoney, localToday } from "@/lib/utils";
import { formatDay } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useTour } from "@/tour/TourProvider";
import { fadeUp } from "@/animations/variants";

// Long enough for the card to have faded in, so the rise happens where you're
// already looking instead of during the arrival.
const MOMENT_DELAY_MS = 450;

export default function StreakCard() {
  const navigate = useNavigate();
  const toast = useToast();
  const guard = useDemoGuard();
  const { noun, mode } = useBudgetPeriod();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [badgesOpen, setBadgesOpen] = useState(false);
  // The offer the sheet was opened with. A successful restore replaces `data`
  // while the sheet is still sliding away, and reading the live offer then
  // flashed the next offer's count (or a blank) in the closing sheet.
  const [offer, setOffer] = useState(null);
  const [restoring, setRestoring] = useState(false);
  // A rise since this device last showed the streak (see streakMoment), and
  // whether the number has rolled from the old figure to the new one yet.
  const [moment, setMoment] = useState(null);
  const [rolled, setRolled] = useState(false);

  useEffect(() => {
    fetchStreak(localToday())
      .then((d) => {
        // Only an active streak is worth remembering or celebrating. Set only
        // when there is one: StrictMode's second fetch finds today already
        // recorded, and must not clear the first one's moment.
        if (d?.hasIncome && d.periodStatus === "active") {
          const found = streakMoment(d, localToday());
          if (found) setMoment(found);
        }
        setData(d);
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!moment) return;
    const timer = setTimeout(() => {
      setRolled(true);
      haptic("success");
    }, MOMENT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [moment]);

  // The streak's own tour, on a visit after Home's (the provider holds it
  // until that one has run). Never over the day's celebration: a rise that
  // hasn't rolled yet is still happening.
  const live = Boolean(data?.hasIncome) && data?.periodStatus !== "inactive";
  useTour("streak", !loading && live && (!moment || rolled));
  useTour("tip.restore", !loading && live && Boolean(data?.restore));

  const handleRestore = async () => {
    if (!offer) return;
    setRestoring(true);
    try {
      const updated = await restoreStreak({
        date: offer.date,
        today: localToday(),
      });
      setData(updated);
      // Keep tomorrow's comparison honest: the restored figure is the one
      // this device has now shown.
      streakMoment(updated, localToday());
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
      <StreakPrompt
        title="No Budget Period Running"
        action="Start a Period"
        onAction={() => navigate("/more", { state: { open: "period" } })}
      >
        Start your next period to pick your streak back up. Days in
        between aren't counted for or against you.
      </StreakPrompt>
    );
  }

  // Needs income logged this period for a daily budget to exist.
  if (!data || !data.hasIncome) {
    return (
      <StreakPrompt
        title="Start a Spending Streak"
        action="Add Income"
        onAction={() => navigate("/transactions")}
      >
        Add your income for this {noun} to unlock your daily budget and
        start a streak.
      </StreakPrompt>
    );
  }

  const {
    today,
    currentStreak,
    longestStreak,
    savesLeftThisPeriod,
    last7,
    restore,
    breakDay,
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

  // Yesterday's figure until the moment plays, then today's — so the number
  // visibly goes up rather than already being up when the card appears.
  const shownStreak = moment && !rolled ? moment.from : currentStreak;
  const celebrating = Boolean(moment) && rolled;
  // The badge follows the number: yesterday's until the roll, then today's.
  const badge = badgeFor(shownStreak);
  const next = nextBadge(shownStreak);
  const upgradedTo = celebrating && moment.upgraded ? badgeFor(currentStreak) : null;

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card className="overflow-hidden">
        <CardContent>
          {/* Header: current + best */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3" data-tour="streak.count">
              {/* The badge is the way into the whole ladder, so it's a button
                  even before the first one is earned — "what do I get at
                  five?" is the question worth answering on day one. */}
              <button
                type="button"
                onClick={() => setBadgesOpen(true)}
                aria-label={
                  badge
                    ? `${badge.label} badge — see all streak badges`
                    : "See the streak badges"
                }
                className="shrink-0 rounded-full transition-transform duration-micro ease-out active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <StreakBadgeSlot
                  days={shownStreak}
                  lit={celebrating}
                  burst={celebrating && (moment.upgraded || moment.newBest)}
                />
              </button>
              <div className="min-w-0">
                <p className="num text-[27px] font-medium leading-none tracking-[-0.025em]">
                  <RollingNumber value={shownStreak} />
                </p>
                <p
                  className={cn("mt-1 truncate text-[13px]", upgradedTo ? "font-medium" : "text-ink-3")}
                  style={upgradedTo ? { color: `hsl(var(--badge-${upgradedTo.key}))` } : undefined}
                >
                  {upgradedTo
                    ? `New badge: ${upgradedTo.label}`
                    : `day${currentStreak === 1 ? "" : "s"} on budget`}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <span
                className={cn(
                  "flex items-center gap-1.5 rounded-xs px-2 py-[3px] text-[11px] font-medium transition-colors duration-enter ease-out",
                  celebrating && moment.newBest
                    ? "bg-positive/[0.12] text-positive"
                    : "bg-surface-2 text-ink-2"
                )}
              >
                <Trophy className="h-3.5 w-3.5" />
                {celebrating && moment.newBest ? "New best" : `Best ${longestStreak}`}
              </span>
              {/* What the next five days are for. */}
              <span className="text-[11px] text-ink-3">
                {next.label} in {next.daysToGo} {next.daysToGo === 1 ? "day" : "days"}
              </span>
            </div>
          </div>

          {/* Today's budget progress */}
          <div className="mt-3" data-tour="home.today">
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
                    {daysAfterToday === 1 ? "day" : "days"} after today.
                  </>
                ) : (
                  <>Last day of this {noun}.</>
                )}
              </p>
            )}
            <button
              onClick={() => navigate("/plan")}
              className="mt-1.5 rounded-sm text-[11.5px] font-medium text-ink-2 underline-offset-2 hover:underline active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Plan with today's budget →
            </button>
          </div>

          {/* Last 7 days — the mini version. The full period calendar lives on
              Tracker, so the row doubles as the way there. The cells inside are
              decorative (role="img"), so wrapping them in the link nests
              nothing interactive. */}
          <button
            type="button"
            onClick={() => navigate("/tracker")}
            data-tour="streak.week"
            aria-label="Your last 7 days — see the full period calendar"
            className="mt-3 flex w-full justify-between gap-1.5 rounded-sm transition-opacity duration-base ease-out hover:opacity-80 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {last7.map((d) => (
              <StreakDayCell key={d.date} day={d} />
            ))}
          </button>

          {/* Saves + restore */}
          <div
            className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3"
            data-tour="streak.restores"
          >
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
                data-tour="streak.restore"
                onClick={() => {
                  if (guard()) return;
                  setOffer(restore);
                  setConfirmOpen(true);
                }}
              >
                <Shield className="h-3.5 w-3.5" /> Restore
              </Button>
            )}
          </div>
          <StreakBreakNote
            breakDay={breakDay}
            restore={restore}
            noun={noun}
            mode={mode}
          />
        </CardContent>
      </Card>

      <StreakBadgesSheet
        open={badgesOpen}
        onClose={() => setBadgesOpen(false)}
        currentStreak={currentStreak}
        longestStreak={longestStreak}
      />

      {/* Restore confirmation */}
      <StreakRestoreSheet
        open={confirmOpen}
        onClose={() => !restoring && setConfirmOpen(false)}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleRestore}
        offer={offer}
        restoring={restoring}
        noun={noun}
        mode={mode}
      />
    </motion.div>
  );
}
