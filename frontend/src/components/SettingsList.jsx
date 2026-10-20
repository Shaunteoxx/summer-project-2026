import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";

import SegmentPill from "@/components/SegmentPill";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fadeUp } from "@/animations/variants";

/* ── Settings list primitives ───────────────────────────────────────────
   A labelled group of rows in one card, which is what the whole page is now.
   Rows are separated by a hairline rather than each being its own card — the
   old version gave every setting a card, so nothing on the page was quieter
   than anything else.                                                      */

export function Section({ label, children }) {
  return (
    <motion.section
      variants={fadeUp}
      initial="initial"
      animate="animate"
      className="mt-6"
    >
      <h2 className="mb-2.5 px-0.5 text-overline text-ink-3">{label}</h2>
      <Card className="overflow-hidden [&>*+*]:border-t [&>*+*]:border-hairline">
        {children}
      </Card>
    </motion.section>
  );
}

/**
 * One settings row: a 34px tile, a title with optional meta line, an optional
 * right-edge value, and a chevron when the row leads somewhere.
 *
 * Renders as a button only when it does something — a static row shouldn't be
 * in the tab order or announce itself as clickable.
 */
export function Row({ icon: Icon, title, meta, value, onClick, chevron = true, ...rest }) {
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      {...(onClick ? { onClick, type: "button" } : {})}
      {...rest}
      className={cn(
        "flex w-full items-center gap-3 px-4 py-[13px] text-left",
        // `group` lets a SwitchTrack in `value` turn to glass while the row
        // is held; nothing else in a row keys off it.
        onClick &&
          "group transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      )}
    >
      <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium tracking-[-0.01em]">
          {title}
        </span>
        {meta && (
          <span className="mt-0.5 block truncate text-meta text-ink-3">{meta}</span>
        )}
      </span>
      {value}
      {chevron && onClick && (
        <ChevronRight className="h-4 w-4 shrink-0 text-ink-3" />
      )}
    </Tag>
  );
}

/** The current setting, right-aligned in tabular figures. */
export function RowValue({ children, strong }) {
  return (
    <span
      className={cn(
        "num shrink-0",
        strong ? "text-[14px] font-semibold text-ink" : "text-[13px] font-medium text-ink-2"
      )}
    >
      {children}
    </span>
  );
}

/**
 * Segmented control. Replaces the theme toggle switch: a switch implies
 * on/off, but light and dark are two peers — and the labels say which is
 * which without the user having to work out what "on" meant.
 *
 * The selected side is iOS 26's glass pill (SegmentPill's `glass`): it slides
 * rather than jumping, swells into clear glass while the control is held
 * (hence `group`), and crosses as glass when it moves.
 *
 * The pill needs equal segments, so they're grid columns, each at least
 * 64px. The floor matters: the chosen label is set semibold, and columns
 * sized to the widest label would shrink by a few px each time the bold side
 * swapped, nudging the whole row.
 */
export function Segmented({ label, options, value, onChange, className }) {
  const index = options.findIndex((o) => o.value === value);
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("group relative grid shrink-0 gap-0.5 rounded-md bg-surface-2 p-[3px]", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(64px, 1fr))` }}
    >
      <SegmentPill index={index} count={options.length} glass />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative rounded-[9px] px-3.5 py-1.5 text-[13px] transition-colors duration-base ease-out",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              on ? "font-semibold text-ink" : "font-medium text-ink-3"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
