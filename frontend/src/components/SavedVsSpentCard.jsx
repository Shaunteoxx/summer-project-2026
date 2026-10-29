import { Fragment } from "react";

import DonutChart from "@/components/DonutChart";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Saved vs spent — a 104px ring on the left, the figures written out in a
 * flexible column on the right that stays beside the ring at any width.
 *
 * The previous version stacked a 260px-tall chart above a floating legend and
 * put *income* in the middle, so the two numbers the card is actually about
 * were only reachable by hovering an arc. Listing them frees the ring to shrink
 * to the size of a glance, and makes the hover tooltip redundant — which is why
 * there isn't one any more.
 *
 * Takes everything as props, so the design harness can render it without
 * TrackerPage's data plumbing.
 */
export default function SavedVsSpentCard({
  saved,
  spent,
  percentageSaved,
  hasData,
  colors,
  footnote,
  total = null,
  totalLabel = "Income",
  // A savings target turns this into a three-part ring. With no target there is
  // nothing to reserve, so the card keeps its original two slices and its
  // "Unspent" wording — which is accurate exactly when nothing is set aside.
  reserved = 0,
  left = null,
  percentLeft = 0,
}) {
  // Drop empty slices: a lone 360° sector renders badly with rounded caps, and
  // a zero-value slice contributes nothing but a seam.
  const hasReserve = reserved > 0;
  // Order round the ring: what you can still spend, what is committed, what has
  // gone. Reading clockwise from the top that is best case to worst.
  const legend = hasReserve
    ? [
        ["Left to Spend", Math.max(left ?? 0, 0), colors.saved],
        ["Reserved", reserved, colors.reserved],
        ["Spent", spent, colors.spent],
      ]
    : [
        ["Unspent", saved, colors.saved],
        ["Spent", spent, colors.spent],
      ];
  const slices = legend
    .map(([name, value, fill]) => ({ name, value, fill }))
    .filter((s) => s.value > 0);
  const split = slices.length > 1;
  // The headline fraction. Off the spendable budget once a target exists, which
  // is the base Home divides by — see the note on `spendable` in TrackerPage.
  const ringPercent = hasReserve ? percentLeft : percentageSaved;
  const ringLabel = hasReserve ? "Left" : "Unspent";

  return (
    <Card>
      {/* No title: the ring says 77% UNSPENT and the list names both figures,
          so a heading above them would only repeat what the card already reads
          out. Matches mockups §06, where this card carries no title either.

          "Unspent", not "Saved": this is a live period, so income minus
          spending is money not spent yet, not money set aside. Calling it
          saved put an apparent 3x win directly above a "Goal: set aside $300"
          footnote. The SavingsGoalCard below is the one place that answers
          "am I actually saving?", and it says "covers" for the same reason. */}
      {/* Everything inside this card is sized in px, not rem. The point of the
          card is that it survives any browser font size, and rem figures grow
          with that font until "$1,162.75" runs outside the card — it did, by
          16px at 399px wide and 95px at 320px. Fixed px sizes plus a truncating
          label column (below) mean the pair can neither overflow nor wrap at
          any width or zoom. No breakpoint: Tailwind's sm: is 640px, above every
          phone, so a responsive variant here would only ever hit one case. */}
      <CardContent className="px-[20px] py-[22px]">
        {/* Ring and figures stay side by side at any width or browser-font
            size. No flex-wrap, so the figures can never drop under the ring; a
            fixed px ring that doesn't grow with the font; and a flexible figure
            column whose labels truncate before anything can overflow. Sized
            down from the old 128px/25px/19px so the pair fits a 320px screen
            with a large font and still has room. */}
        {hasData ? (
          <div className="flex items-center gap-[14px]">
            <div className="relative h-[104px] w-[104px] shrink-0">
              <DonutChart
                slices={slices}
                size={104}
                thickness={12}
                rounded={split}
                gap={split ? 12 : 0}
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="num text-[22px] font-medium leading-none">
                  <AnimatedNumber value={ringPercent} suffix="%" memoryKey="tracker.ring" />
                </span>
                <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.07em] text-ink-3">
                  {ringLabel}
                </span>
              </div>
            </div>

            {/* The figure column fills whatever width is left after the ring
                (flex-1) and is allowed to shrink to nothing (min-w-0) so its
                labels can truncate. Two grid tracks — a flexible label that
                ellipsises and an auto-width amount that never does — keep the
                amounts aligned in a column while the labels give way first, so
                a long label or a large font can't push a figure off the card. */}
            <div className="min-w-0 flex-1">
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-[12px] gap-y-[4px]">
              {/* Labels truncate rather than wrap — the column can get very
                  narrow at a large font — so the amount beside them is never
                  pushed down or off. The period they cover is in the header. */}
              {legend.map(([label, value, swatch]) => (
                <Fragment key={label}>
                  <dt className="flex min-w-0 items-center gap-[6px]">
                    <span
                      className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
                      style={{ background: swatch }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[12px] text-ink-2">{label}</span>
                  </dt>
                  <dd className="num shrink-0 text-right text-[16px] font-medium text-ink">
                    <AnimatedNumber
                      value={value}
                      prefix="$"
                      decimals={2}
                      memoryKey={`tracker.legend.${label}`}
                    />
                  </dd>
                </Fragment>
              ))}
              {/* The denominator, printed. The ring reads "77% Unspent" and
                  the two tiles at the foot of the page read "% of allowance" —
                  three percentages whose base appeared nowhere on the card. In
                  month mode you could add the two figures above yourself; in
                  term mode you couldn't get it anywhere on this page at all,
                  since the allowance card below is the whole term, not the
                  month's share of it.

                  A total, not a third headline: 15px and ink-2, under a rule,
                  so it reads as the figure the two above sum to. The label is
                  one word for the reason the two above are — the comment on
                  the padding records what happened when this card's contents
                  grew — and it swaps with the mode, because "Income" is a lie
                  in a cycle funded by a lump sum banked months ago. */}
              {total != null && (
                <>
                  <div
                    className="col-span-2 mt-[8px] border-t border-hairline"
                    aria-hidden="true"
                  />
                  <dt className="flex min-w-0 items-center gap-[6px]">
                    {/* Holds the swatch column open so all three labels line
                        up; the total isn't a slice, so it has no colour. */}
                    <span className="h-[9px] w-[9px] shrink-0" aria-hidden="true" />
                    <span
                      data-measure="donut-total-label"
                      className="truncate text-[12px] text-ink-3"
                    >
                      {totalLabel}
                    </span>
                  </dt>
                  <dd className="num shrink-0 text-right text-[13px] font-medium text-ink-2">
                    <AnimatedNumber
                      value={total}
                      prefix="$"
                      decimals={2}
                      memoryKey="tracker.total"
                    />
                  </dd>
                </>
              )}
            </dl>
              {/* The goal sits under the two figures it relates to rather than
                  full-width beneath the ring, where it read as a footnote to
                  the whole card. */}
              {footnote && (
                <p className="mt-[22px] text-[11px] leading-relaxed text-ink-3">
                  {footnote}
                </p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Reached only from the design harness now: a period with nothing
                in it never gets this far, since the page short-circuits to one
                empty state. Kept honest anyway, and pointing at the + on this
                screen rather than at another page. */}
            <p className="text-[13px] leading-relaxed text-ink-3">
              Nothing logged yet. Tap + to add an entry.
            </p>
            {footnote && (
              <p className="mt-3 text-[11px] leading-relaxed text-ink-3">{footnote}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
