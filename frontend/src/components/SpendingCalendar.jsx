import { cn, monthName, formatMoney } from "@/lib/utils";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/**
 * Month calendar of daily spending. Cell tint mirrors the streak's verdict for
 * the day — green when the day stayed within its own daily budget, red (with a
 * ring, so it isn't color-alone) when it went over. Today wears a bold ring.
 * Tap a day to open its transactions.
 */
export default function SpendingCalendar({
  days,
  year,
  monthIdx,
  budgetsAvailable,
  onSelectDay,
}) {
  const offset = new Date(year, monthIdx, 1).getDay();

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
          const label = d.isFuture
            ? `${monthName(monthIdx)} ${d.day}`
            : `${monthName(monthIdx)} ${d.day}: spent ${formatMoney(d.amount)}${
                d.budget !== null ? (d.over ? ", over budget" : ", within budget") : ""
              }`;
          return (
            <button
              key={d.day}
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
