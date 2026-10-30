import { Shield } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The foot of the streak card: restores left this period as a row of shields,
 * and the Restore button when there's a day to repair. `onRestore` is null
 * when there isn't.
 */
export default function StreakRestores({ left, total, noun, onRestore }) {
  // Restores scale with period length, so the shield row can't be a fixed
  // three. Long periods show a count instead of an unreadable row of icons.
  const showShields = total <= 5;

  return (
    <div
      className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3"
      data-tour="streak.restores"
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-[13px] text-ink-3">
          <span className="num font-semibold text-ink">
            {left}
          </span>{" "}
          Restores left this {noun}
        </span>
        <span
          className="flex shrink-0 items-center gap-1"
          aria-label={`${left} of ${total} restores left`}
        >
          {showShields ? (
            [...Array(total)].map((_, i) => (
              <Shield
                key={i}
                className={`h-4 w-4 ${
                  i < left
                    ? "fill-ink text-ink"
                    : "text-ink-3/40"
                }`}
              />
            ))
          ) : (
            <>
              <Shield className="h-4 w-4 fill-ink text-ink" />
              <span className="num text-[12px] font-medium text-ink-3">
                / {total}
              </span>
            </>
          )}
        </span>
      </div>
      {onRestore && (
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          data-tour="streak.restore"
          onClick={onRestore}
        >
          <Shield className="h-3.5 w-3.5" /> Restore
        </Button>
      )}
    </div>
  );
}
