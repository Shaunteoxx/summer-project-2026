import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

import SegmentPill from "@/components/SegmentPill";

// The two views of one thing — your spending. "This period" is the running
// window in detail (the Tracker); "History" is every finished month compared
// (what used to be a separate Stats page buried in More). They live on
// separate routes still, but this control makes them read as one surface with
// a timeframe switch, which is how people actually think about it: "how am I
// doing now" vs "how have I done".
const SEGMENTS = [
  { to: "/tracker", label: "This Period" },
  { to: "/stats", label: "History" },
];

/**
 * Which segment the last control to mount had selected.
 *
 * Each page renders its own copy of this control, so the one you tap unmounts
 * and a fresh one mounts on the other route. Module state is how the new one
 * knows where the pill was, so it can slide from there rather than appear.
 */
let lastIndex = null;

/**
 * Segmented control that switches between the current-period tracker and the
 * history view. Styled like the budget-mode tabs in More so selection reads the
 * same way across the app: the active segment lifts onto a surface, the rest
 * stay quiet.
 *
 * The pill is the shared SegmentPill, but it can't just follow the route:
 * the control it would slide in has only just mounted. So it mounts where the
 * last one left it and moves a frame later, which is what gives the CSS
 * transition something to animate from.
 */
export default function SpendingTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const index = Math.max(0, SEGMENTS.findIndex((s) => s.to === pathname));
  const [pillAt, setPillAt] = useState(lastIndex ?? index);

  useEffect(() => {
    lastIndex = index;
    if (pillAt === index) return;
    // One frame at the old position first, so there's a style to transition
    // from — set in the same frame as the mount, the pill would just appear.
    const frame = requestAnimationFrame(() => setPillAt(index));
    return () => cancelAnimationFrame(frame);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  return (
    <div
      role="tablist"
      aria-label="Spending view"
      className="relative flex gap-1 rounded-lg bg-surface-2 p-1"
    >
      <SegmentPill index={pillAt} count={SEGMENTS.length} inset={4} gap={4} className="rounded-md" />
      {SEGMENTS.map(({ to, label }) => {
        const active = pathname === to;
        return (
          <button
            key={to}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) navigate(to);
            }}
            className={`relative flex-1 rounded-md px-3 py-1.5 text-center text-[13px] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "font-semibold text-ink"
                : "font-medium text-ink-3 hover:text-ink-2 active:opacity-60"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
