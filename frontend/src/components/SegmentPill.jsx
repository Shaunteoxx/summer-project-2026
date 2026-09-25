import { cn } from "@/lib/utils";

/**
 * The selected segment's raised surface, as one element that slides to the
 * segment you pick instead of the highlight jumping there.
 *
 * Render it once, first, inside a `relative` segmented control whose segments
 * are equal widths, and make each segment `relative` so its label paints above
 * the pill. `inset` and `gap` are the control's padding and gap in px, which is
 * all the geometry there is: the pill is one segment wide, and moving `index`
 * segments is that many widths plus that many gaps.
 *
 * Plain CSS on purpose, not a framer `layoutId`. Inside a sheet, a shared-
 * layout node holds the sheet open: close it while the page behind re-renders
 * (saving an entry does exactly that) and its layout animation never reports
 * done, so the sheet slides away but stays mounted, invisible, over the page.
 * A transform transition can't hold anything open, and the global
 * prefers-reduced-motion rule already stills it.
 */
export default function SegmentPill({ index, count, inset = 3, gap = 2, className }) {
  if (index < 0) return null;
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute rounded-[9px] bg-surface shadow-card transition-transform duration-enter ease-out dark:bg-surface-3",
        className
      )}
      style={{
        top: inset,
        bottom: inset,
        left: inset,
        width: `calc((100% - ${2 * inset + (count - 1) * gap}px) / ${count})`,
        transform: index ? `translateX(calc(${index * 100}% + ${index * gap}px))` : "none",
      }}
    />
  );
}
