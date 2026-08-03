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
 * budget, red (with a ring, so it isn't color-alone) when it went over. Today
 * wears a bold ring. Tap a day to open its transactions.
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
      <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-medium text-muted-foreground">
        {DOW.map((d, i) => (
          <span key={i} aria-hidden="true">
            {d}
          </span>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
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
                "flex aspect-square flex-col items-center justify-center rounded-lg transition-colors",
                !d.isFuture && "hover:bg-accent/60",
                d.isFuture
                  ? "text-muted-foreground/40"
                  : d.over
                    ? "bg-destructive/15 text-destructive ring-1 ring-destructive/40"
                    : budgetsAvailable
                      ? "bg-success/10 text-success"
                      : spentSomething
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground",
                d.isToday && (d.over ? "ring-2 ring-destructive" : "ring-2 ring-primary")
              )}
            >
              {showMonth && (
                <span className="text-[8px] font-bold uppercase leading-none opacity-70">
                  {SHORT_MONTHS[d.monthIdx]}
                </span>
              )}
              <span className="text-xs font-semibold leading-none">{d.day}</span>
              {!d.isFuture && (
                <span
                  className={cn(
                    "mt-0.5 whitespace-nowrap text-[9px] leading-none tabular-nums",
                    d.over && "font-bold"
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
