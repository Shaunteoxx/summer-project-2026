import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * The selected segment's raised surface, as one element that slides to the
 * segment you pick instead of the highlight jumping there.
 *
 * Render it once, first, inside a `relative` segmented control whose segments
 * are equal widths, and make each segment `relative` so its label paints above
 * the pill. `inset` and `gap` are the control's padding and gap in px, which is
 * all the geometry there is: the pill is one segment wide, and moving `index`
 * segments is that many widths plus that many gaps. `className` styles the
 * pill's face (radius, fill, shadow), not its position.
 *
 * `glass` gives it iOS 26's segmented-control behaviour: while the control is
 * held the pill swells into a lens of clear glass, and when it moves it
 * crosses as glass and lands solid (.segment-glass in index.css, the
 * segment-lens keyframes in tailwind.config.js). The control must carry the
 * `group` class for the held look.
 *
 * Plain CSS on purpose, not a framer `layoutId`. Inside a sheet, a shared-
 * layout node holds the sheet open: close it while the page behind re-renders
 * (saving an entry does exactly that) and its layout animation never reports
 * done, so the sheet slides away but stays mounted, invisible, over the page.
 * A transform transition can't hold anything open, and the global
 * prefers-reduced-motion rule already stills it.
 */
export default function SegmentPill({ index, count, inset = 3, gap = 2, glass = false, className }) {
  // How many times the pill has moved since it first drew, kept the way React
  // recommends for responding to a prop change during render. The glass trip
  // plays only on a move, never on first paint, and alternates between two
  // animation names because one only replays when its name changes.
  const [shown, setShown] = useState(index);
  const [moves, setMoves] = useState(0);
  if (shown !== index) {
    setShown(index);
    setMoves(moves + 1);
  }

  if (index < 0) return null;
  return (
    // Two layers, because a running animation owns `transform`: the outer one
    // slides, the inner one is the face that can turn to glass.
    <span
      aria-hidden="true"
      className="pointer-events-none absolute transition-transform duration-enter ease-out"
      style={{
        top: inset,
        bottom: inset,
        left: inset,
        width: `calc((100% - ${2 * inset + (count - 1) * gap}px) / ${count})`,
        transform: index ? `translateX(calc(${index * 100}% + ${index * gap}px))` : "none",
      }}
    >
      <span
        className={cn(
          "block h-full w-full rounded-[9px] bg-surface dark:bg-surface-3",
          // The glass face brings its own shadow, laid out to animate into
          // the lens's; shadow-card would win over it and snap instead.
          glass ? "segment-glass" : "shadow-card",
          glass && moves > 0 && (moves % 2 ? "animate-segment-a" : "animate-segment-b"),
          className
        )}
      />
    </span>
  );
}
