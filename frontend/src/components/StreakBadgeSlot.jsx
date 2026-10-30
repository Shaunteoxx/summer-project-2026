import { AnimatePresence, motion } from "framer-motion";

import StreakBadge from "@/components/StreakBadge";
import { badgeAt, badgeFor, nextBadge, progressToNext } from "@/lib/streakBadges";
import { EASE } from "@/animations/variants";

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
export default function StreakBadgeSlot({ days, lit, burst }) {
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
