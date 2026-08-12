import { cn, formatMoney } from "@/lib/utils";
import { formatDay } from "@/lib/period";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const SHORT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Calendar of daily spending across a budget period. Cell tint mirrors the
 * streak's verdict for the day — green when the day stayed within its own daily
 * budget, red (with a ring, so it isn't color-alone) when it went over. Today is
 * the one solid cell in the grid, and days still to come are dashed outlines
 * rather than fills, since there's no verdict to show yet. Tap a day to open its
 * transactions.
 *
 * A period is any length and may straddle a month boundary, so the grid is
 * aligned to the weekday of its first day rather than to the 1st of a month.
 * `showMonthTags` labels the first cell of each new month — wanted when the
 * whole period is in one grid, redundant when the caller pages by month and
 * already shows the month in a header.
 */
export default function SpendingCalendar({
  days,
  budgetsAvailable,
  showMonthTags = true,
  onSelectDay,
}) {
  if (days.length === 0) return null;
  const offset = new Date(`${days[0].ymd}T00:00:00.000Z`).getUTCDay();

  return (
    <div>
      <div className="grid grid-cols-7 gap-[5px] text-center text-[9.5px] font-medium uppercase tracking-[0.04em] text-ink-3">
        {DOW.map((d, i) => (
          <span key={i} aria-hidden="true">
            {d}
          </span>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-7 gap-[5px]">
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad-${i}`} />
        ))}

        {days.map((d) => {
          const spentSomething = d.amount > 0;
          const dateLabel = formatDay(d.ymd);
          const label = d.isFuture
            ? dateLabel
            : `${dateLabel}: spent ${formatMoney(d.amount)}${
                d.budget !== null ? (d.over ? ", over budget" : ", within budget") : ""
              }`;
          // The first day of a new month carries its month name, so day numbers
          // restarting mid-period never read as the same month.
          const showMonth = showMonthTags && (d.startsMonth || d.index === 0);
          return (
            <button
              key={d.ymd}
              type="button"
              disabled={d.isFuture}
              onClick={() => onSelectDay(d)}
              aria-label={label}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-[8px] transition-colors duration-base ease-out",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                !d.isFuture && !d.isToday && "hover:brightness-[0.97]",
                // Future days in the period are an outline, not a fill: nothing
                // has happened yet, so there's no verdict to tint.
                d.isFuture
                  ? "border border-dashed border-hairline-strong text-ink-3"
                  : // Today is a solid cell — the one filled shape in the grid.
                    // It keeps its verdict's colour rather than a neutral ink,
                    // because "today, and already over" is the single most
                    // useful thing this calendar can tell you.
                    d.isToday
                    ? d.over
                      ? "bg-negative text-white"
                      : "bg-ink text-surface"
                    : d.over
                      ? // The ring is deliberate: over-budget must not be
                        // signalled by colour alone.
                        "bg-negative/[0.12] text-negative ring-1 ring-negative/40"
                      : budgetsAvailable
                        ? "bg-positive/[0.12] text-positive"
                        : spentSomething
                          ? "bg-surface-2 text-ink"
                          : "bg-surface-2 text-ink-3"
              )}
            >
              {showMonth && (
                <span className="text-[8px] font-semibold uppercase leading-none opacity-70">
                  {SHORT_MONTHS[d.monthIdx]}
                </span>
              )}
              <span
                className={cn(
                  "text-[11px] leading-none",
                  d.isToday ? "font-semibold" : d.isFuture ? "font-normal" : "font-medium"
                )}
              >
                {d.day}
              </span>
              {!d.isFuture && (
                <span
                  className={cn(
                    "num mt-0.5 whitespace-nowrap text-[9px] leading-none",
                    d.over && !d.isToday && "font-semibold"
                  )}
                >
                  {formatMoney(d.amount)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
