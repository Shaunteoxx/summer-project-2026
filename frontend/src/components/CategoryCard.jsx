import { Fragment } from "react";

import DonutChart from "@/components/DonutChart";
import AnimatedNumber from "@/components/AnimatedNumber";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/utils";

/**
 * Spending by Category — a 112px ring beside a right-aligned value list.
 *
 * Arcs are contiguous (no padding angle, butt caps): the eight category hues
 * are perceptually matched, so they separate on colour alone and a gap between
 * them just makes a small donut look chewed.
 *
 * Props only, for the design harness, as SavedVsSpentCard is.
 */
export default function CategoryCard({ byCategory, spent, emptyNoun }) {
  return (
    <Card>
      <CardContent className="px-[18px] py-5">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
          Spending by Category
        </h2>

        {byCategory.length > 0 ? (
          /* The gap is tight: every pixel the ring doesn't take is a pixel of
             gutter between a category and its amount, and the app's real labels
             ("Entertainment") run longer than the mockup's ("Fun"). */
          <div className="mt-4 flex items-center gap-[14px]">
            <div className="relative h-28 w-28 shrink-0">
              <DonutChart slices={byCategory} size={112} thickness={12} />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                {/* To the cent, matching the per-category rows immediately to
                    the right. This was whole dollars on the grounds that a
                    chart label needn't be exact and the card above carries the
                    precise figure — but the rows it sits beside are in this
                    same card and do show cents, so "$110" read as disagreeing
                    with the $70.60 + $38.90 next to it. */}
                <span className="num text-[18px] font-medium leading-none">
                  <AnimatedNumber
                    value={spent}
                    prefix="$"
                    decimals={2}
                    memoryKey="tracker.categorySpent"
                  />
                </span>
                <span className="mt-1.5 text-[10px] font-medium uppercase tracking-[0.07em] text-ink-3">
                  Spent
                </span>
              </div>
            </div>

            {/* Same flexible column as the card above: it fills the width left
                after the ring and may shrink to nothing, so long custom
                category names truncate rather than pushing the amounts out of
                alignment or wrapping the whole list under the ring. */}
            <dl className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-[12px] gap-y-[9px]">
              {byCategory.map((c) => (
                <Fragment key={c.name}>
                  <dt className="flex min-w-0 items-center gap-[6px]">
                    <span
                      className="h-[7px] w-[7px] shrink-0 rounded-[20px]"
                      style={{ background: c.color }}
                      aria-hidden="true"
                    />
                    <span className="truncate text-[12px] text-ink-2">{c.name}</span>
                  </dt>
                  <dd className="num shrink-0 text-right text-[12px] font-medium text-ink">
                    {formatMoney(c.value)}
                  </dd>
                </Fragment>
              ))}
            </dl>
          </div>
        ) : (
          /* The live case: income logged, nothing spent. The + is on this
             screen, so sending the reader to the Transactions page to do what a
             button here already does was a detour. */
          <p className="mt-4 text-[13px] leading-relaxed text-ink-3">
            No expenses yet this {emptyNoun}. Tap + to add one.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
