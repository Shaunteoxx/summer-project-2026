import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Flame, Trophy, Shield, Check, X, Minus, AlertTriangle } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import BottomSheet from "@/components/BottomSheet";
import StreakBadge from "@/components/StreakBadge";
import { fetchStreak, restoreStreak } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { haptic } from "@/lib/haptics";
import {
  BADGES,
  badgeAt,
  badgeFor,
  nextBadge,
  progressToNext,
  tierFor,
} from "@/lib/streakBadges";
import { streakMoment } from "@/lib/streakMoments";
import { cn, formatMoney, localToday } from "@/lib/utils";
import { formatDay, formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useTour } from "@/tour/TourProvider";
import { EASE, fadeUp } from "@/animations/variants";

// Long enough for the card to have faded in, so the rise happens where you're
// already looking instead of during the arrival.
const MOMENT_DELAY_MS = 450;

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const dowOf = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

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
            <Button size="sm" onClick={() => navigate("/more", { state: { open: "period" } })}>
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
                <BadgeSlot
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
              <DayCell key={d.date} day={d} />
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
          <BreakNote
            breakDay={breakDay}
            restore={restore}
            noun={noun}
            mode={mode}
          />
        </CardContent>
      </Card>

      <BadgesSheet
        open={badgesOpen}
        onClose={() => setBadgesOpen(false)}
        currentStreak={currentStreak}
        longestStreak={longestStreak}
      />

      {/* Restore confirmation */}
      <BottomSheet
        open={confirmOpen}
        onClose={() => !restoring && setConfirmOpen(false)}
        title="Restore Your Streak?"
      >
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-md bg-surface-2 p-4">
            <Shield className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" />
            <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
              <p>
                {offer?.date ? formatDay(offer.date) : "That day"} went over its
                budget. Restoring it uses{" "}
                {offer?.fromPeriod ? (
                  // The grace day: the save comes from the period that just
                  // ended, not the one the card's shields count.
                  <>
                    <strong>
                      {offer.savesLeft === 1
                        ? "the last restore"
                        : `1 of the ${offer.savesLeft} restores left`}
                    </strong>{" "}
                    from {formatPeriodLabel(offer.fromPeriod, { mode })}, not this{" "}
                    {noun}&apos;s,
                  </>
                ) : (
                  <>
                    <strong>
                      {offer?.savesLeft === 1
                        ? "your last restore"
                        : `1 of your ${offer?.savesLeft} restores left`}
                    </strong>{" "}
                    this {noun}
                  </>
                )}
                {offer?.streakAfter
                  ? ` and brings your streak back to ${offer.streakAfter} ${
                      offer.streakAfter === 1 ? "day" : "days"
                    }.`
                  : " and brings your streak back."}
              </p>
            </div>
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
              {restoring ? "Restoring…" : "Use a Restore"}
            </Button>
          </div>
        </div>
      </BottomSheet>
    </motion.div>
  );
}

/**
 * The streak count, rolling like an odometer when it changes: the old figure
 * leaves upward and the new one arrives from below. Used for the overnight
 * rise and a restore alike, so any change to the number reads as movement in
 * the direction it went rather than a swap you might not notice.
 */
function RollingNumber({ value }) {
  return (
    <span className="relative inline-flex overflow-hidden align-top">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.36, ease: EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/**
 * The badge beside the count, inside a ring that fills a fifth a day towards
 * the next one — so days one to four of each five visibly count for
 * something, rather than the badge only ever changing on day five.
 *
 * Before the first badge, Bronze sits in the ring locked: what the first five
 * days are for, shown rather than described.
 *
 * Lit for the visit a rise is shown on, with one pop and a ripple. An upgrade
 * swaps the badge — the old one turns away, the new one lands — while the old
 * ring completes and the next one starts filling in the next badge's colour.
 * It, or a new best, adds a burst in the badge's own colour. None of it plays
 * on an ordinary visit: only a rise moves anything, once, on the first look of
 * the day.
 */
function BadgeSlot({ days, lit, burst }) {
  const badge = badgeFor(days);
  const shown = badge ?? badgeAt(1);
  const next = nextBadge(days);
  return (
    <span
      className="relative flex h-[50px] w-[50px] shrink-0 items-center justify-center"
      style={{ color: `hsl(var(--badge-${shown.key}))` }}
    >
      <ProgressRing
        progress={progressToNext(days)}
        tier={next.tier}
        color={`hsl(var(--badge-${next.key}))`}
      />
      {lit && (
        <motion.span
          aria-hidden="true"
          className="absolute inset-[4px] rounded-full bg-current"
          initial={{ scale: 1, opacity: 0.25 }}
          animate={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: 0.9, ease: EASE }}
        />
      )}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={badge?.tier ?? 0}
          className="relative flex items-center justify-center"
          initial={{ scale: 0.4, rotate: -30, opacity: 0 }}
          // `null` starts the pop from wherever the badge is: resting at full
          // size for a rise within a tier, or still arriving for an upgrade.
          animate={
            lit
              ? { scale: [null, 1.18, 0.96, 1], rotate: [null, -8, 5, 0], opacity: 1 }
              : { scale: 1, rotate: 0, opacity: 1 }
          }
          exit={{ scale: 0.4, rotate: 30, opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        >
          <StreakBadge badge={shown} size={38} locked={!badge} />
        </motion.span>
      </AnimatePresence>
      {burst && <Burst />}
    </span>
  );
}

const RING_STROKE = 2.5;
const RING_RADIUS = (50 - RING_STROKE) / 2;

/**
 * The fifths towards the next badge, from twelve o'clock. Keyed by the badge
 * it's filling towards, so earning one retires this ring — it completes as it
 * fades — and a fresh one fills from empty in the next colour. Mounting
 * doesn't animate, so an ordinary visit shows it already where it is.
 */
function ProgressRing({ progress, tier, color }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 50 50" className="absolute inset-0 -rotate-90">
      <circle
        cx={25}
        cy={25}
        r={RING_RADIUS}
        fill="none"
        stroke="hsl(var(--surface-3))"
        strokeWidth={RING_STROKE}
      />
      <AnimatePresence initial={false}>
        <motion.circle
          key={tier}
          cx={25}
          cy={25}
          r={RING_RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          initial={{ pathLength: 0, opacity: 1 }}
          // Hidden at zero, where a round cap would still draw a dot.
          animate={{ pathLength: progress, opacity: progress > 0 ? 1 : 0 }}
          exit={{ pathLength: 1, opacity: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
        />
      </AnimatePresence>
    </svg>
  );
}

const BURST_DOTS = 8;

/** Eight dots thrown outward from the badge, once, in its colour. */
function Burst() {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0">
      {Array.from({ length: BURST_DOTS }, (_, i) => {
        const angle = (i / BURST_DOTS) * Math.PI * 2;
        return (
          <motion.span
            key={i}
            className="absolute left-1/2 top-1/2 -ml-[2.5px] -mt-[2.5px] h-[5px] w-[5px] rounded-full bg-current"
            initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
            animate={{
              x: Math.cos(angle) * 34,
              y: Math.sin(angle) * 34,
              scale: 0.3,
              opacity: 0,
            }}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        );
      })}
    </span>
  );
}

/**
 * The whole badge ladder: the one you hold, the ones you've reached before
 * (off your best streak — the streak resets, what you once got to doesn't),
 * and the ones still ahead, with the days to the next.
 */
function BadgesSheet({ open, onClose, currentStreak, longestStreak }) {
  const tier = tierFor(currentStreak);
  const bestTier = tierFor(longestStreak);
  const top = BADGES.length;
  const next = nextBadge(currentStreak);

  return (
    <BottomSheet open={open} onClose={onClose} title="Streak Badges">
      <div className="space-y-3 pb-2">
        <p className="text-[13px] leading-relaxed text-ink-3">
          Every 5 days on budget earns the next badge. Go over and the streak
          starts again from Bronze, unless a restore saves the day.
        </p>
        <ul className="divide-y divide-hairline">
          {BADGES.map((b, i) => {
            const t = i + 1;
            // The top row stands for every level past it too.
            const held = t === top ? tier >= top : tier === t;
            const shown = held && t === top ? badgeAt(tier) : badgeAt(t);
            const earned = !held && bestTier >= t;
            const upNext = !held && t === Math.min(tier + 1, top) && tier < top;
            return (
              <li key={b.key} className="flex items-center gap-3 py-2.5">
                <StreakBadge badge={shown} size={36} locked={!held && !earned} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium tracking-[-0.01em]">{shown.label}</p>
                  <p className="text-meta text-ink-3">
                    {t === top
                      ? `${badgeAt(t).days} days, then a level every 5`
                      : `${badgeAt(t).days} days`}
                  </p>
                </div>
                {held ? (
                  <span
                    className="text-[12.5px] font-medium"
                    style={{ color: `hsl(var(--badge-${b.key}))` }}
                  >
                    Current
                  </span>
                ) : earned ? (
                  <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
                    <Check className="h-3.5 w-3.5" /> Earned
                  </span>
                ) : upNext ? (
                  <span className="num text-[12.5px] text-ink-3">
                    {next.daysToGo} {next.daysToGo === 1 ? "day" : "days"} to go
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}

/**
 * Where the streak stops, when the shields can't say it.
 *
 * Restores only repair days in the current period, but the streak runs across
 * periods. When it stops at a day in one that has ended, the shields can still
 * show restores left and the button is simply gone — which, unexplained, reads
 * as restores being broken. The one exception is the grace day, when the ended
 * period's last day can still be restored with that period's own restores.
 */
function BreakNote({ breakDay, restore, noun, mode }) {
  if (!breakDay) return null;
  const day = formatDay(breakDay.date);
  const label = formatPeriodLabel(breakDay.period, { mode });
  let text = null;
  if (restore?.fromPeriod) {
    text = `${day} was the last day of ${label}. You can restore it today only, with that ${noun}'s restores.`;
  } else if (restore) {
    return null;
  } else if (breakDay.inActivePeriod) {
    text = `Your streak stops at ${day}. This ${noun}'s restores are used up.`;
  } else {
    text = `Your streak stops at ${day}, in ${label}. Restores only repair days in the current ${noun}, so it can't be restored.`;
  }
  return <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{text}</p>;
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
