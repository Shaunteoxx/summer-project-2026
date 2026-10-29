import { Card, CardContent } from "@/components/ui/card";
import { cn, formatMoney, monthName } from "@/lib/utils";
import { formatDay } from "@/lib/period";

/**
 * Where the whole allowance stands, as opposed to the month drawn from it.
 *
 * Deliberately a bar and not a second donut: the page already has one, and two
 * rings side by side invite you to compare figures that are measured over
 * different spans.
 */
export default function TermCard({ term, current, cycles = [] }) {
  const income = term.income ?? 0;
  const spent = term.spent ?? 0;
  // Finished months' savings targets, taken out of the allowance when each
  // month ended. `left` already excludes them, so the bar counts them as gone
  // too — otherwise it would stop short of what the headline says is left.
  const saved = term.saved ?? 0;
  const left = term.left ?? 0;
  const pct = income > 0 ? Math.min(((spent + saved) / income) * 100, 100) : 0;
  const monthsLeft = current.cycles - current.cycle;

  // What each month of the allowance gets. The server prices every cycle up to
  // this one; the ones after it can't be priced, because their share depends on
  // what still gets spent this month. They're shown at this month's rate, which
  // is what they'd actually be if the month lands on budget — the split is
  // calibrated so that spending exactly your share less its savings target
  // leaves the next month's share alone.
  const crossesYear = term.start.slice(0, 4) !== term.end.slice(0, 4);
  const months = [...cycles]
    .sort((a, b) => (a.start < b.start ? -1 : 1))
    .map((c) => {
      const month = Number(c.start.slice(5, 7)) - 1;
      return {
        start: c.start,
        label: `${monthName(month).slice(0, 3)}${crossesYear ? ` ${c.start.slice(2, 4)}` : ""}`,
        amount: c.funding ?? current.funding ?? 0,
        projected: c.funding == null,
        isCurrent: c.start === current.start,
      };
    });
  const hasProjected = months.some((m) => m.projected);

  return (
    <Card>
      <CardContent className="px-[18px] py-5">
        {/* 15px, not text-title's 19px: every other card on this page — Daily
            Spending, Savings Target, Spending by Category — heads itself this
            way, and 19px was borrowed from Account Activity, which lives on a
            different page. */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
            Your Allowance
          </h2>
          <span className="shrink-0 text-meta text-ink-3">
            Month {current.cycle} of {current.cycles}
            {monthsLeft === 0 && " · last"}
          </span>
        </div>
        <p className="mt-0.5 text-[12px] text-ink-3">
          {formatDay(term.start, { withYear: true })} –{" "}
          {formatDay(term.end, { withYear: true })}
        </p>

        <div className="mt-3 flex items-baseline gap-1.5">
          <span
            className={cn(
              "num text-[26px] font-medium",
              left < 0 ? "text-negative" : "text-ink"
            )}
          >
            {formatMoney(left)}
          </span>
          <span className="text-[13px] text-ink-3">left of {formatMoney(income)}</span>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-enter ease-out",
              left < 0 ? "bg-negative" : "bg-ink"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Just the figure. The tail used to add "with 3 months to go after
            this one", which is the same fact as the "Month 3 of 6" chip five
            lines above — and it was what pushed this line to two. The last
            month's emphasis moved up into that chip rather than being lost. */}
        {/* data-measure: this line has to fit on one, and jsdom has no layout
            to prove it. The harness publishes the rendered line count, so the
            constraint is checkable instead of eyeballed. */}
        <p
          data-measure="term-caption"
          className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3"
        >
          {/* With savings in it the sentence runs long, and "since it
              started" is what wraps it at 320px; "so far" says the same. */}
          {saved > 0 ? (
            <>
              {formatMoney(spent)} spent and {formatMoney(saved)} saved so far.
            </>
          ) : (
            <>{formatMoney(spent)} spent since it started.</>
          )}
        </p>

        {months.length > 0 && (
          <>
            {/* A grid, not a list: four of six months carry the same projected
                figure, and printed one per row that reads as padding rather
                than as information. Three across puts a six-month allowance in
                two rows and a year-long one in four. */}
            <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-hairline pt-3.5">
              {months.map((m) => (
                <div
                  key={m.start}
                  className={cn(
                    "rounded-md border px-2 py-1.5",
                    m.isCurrent
                      ? "border-transparent bg-surface-2"
                      : m.projected
                        ? // Same dashes the spending calendar puts on days that
                          // haven't happened.
                          "border-dashed border-hairline-strong"
                        : "border-transparent"
                  )}
                >
                  <p
                    className={cn(
                      "text-[11px] leading-none",
                      m.isCurrent ? "text-ink-2" : "text-ink-3"
                    )}
                  >
                    {m.label}
                    {/* The highlight says which month is current to anyone
                        looking; this says it to anyone listening. */}
                    {m.isCurrent && <span className="sr-only"> (this month)</span>}
                  </p>
                  <p
                    className={cn(
                      "num mt-1 text-[13px] leading-none",
                      m.isCurrent
                        ? "font-medium text-ink"
                        : m.projected
                          ? "text-ink-3"
                          : "text-ink-2"
                    )}
                  >
                    {formatMoney(m.amount)}
                  </p>
                </div>
              ))}
            </div>
            {hasProjected && (
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-ink-3">
                Dashed months are at this month&apos;s rate. They move as you
                spend — go under and they grow, go over and they shrink.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
