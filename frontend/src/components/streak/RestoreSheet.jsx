import { Shield } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { Button } from "@/components/ui/button";
import { formatDay, formatPeriodLabel } from "@/lib/period";

/**
 * "Restore Your Streak?" — what a restore costs and what it gives back.
 *
 * `offer` is the one the sheet was opened with, not the live one: see the
 * note on `offer` in StreakCard. `onClose` is the backdrop and drag, which
 * StreakCard ignores mid-restore; `onCancel` is the button, which is disabled
 * then anyway.
 */
export default function RestoreSheet({
  open,
  onClose,
  onCancel,
  onConfirm,
  offer,
  restoring,
  noun,
  mode,
}) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Restore Your Streak?"
    >
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-md bg-surface-2 p-4">
          <Shield className="mt-0.5 h-5 w-5 shrink-0 text-ink-2" />
          <div className="space-y-2 text-[13px] leading-relaxed text-ink-2">
            <p>
              {offer?.date ? formatDay(offer.date) : "That day"} went over its
              budget. Restoring it uses{" "}
              {offer?.fromPeriod ? (
                // The grace day: the save comes from the period that just
                // ended, not the one the card's shields count.
                <>
                  <strong>
                    {offer.savesLeft === 1
                      ? "the last restore"
                      : `1 of the ${offer.savesLeft} restores left`}
                  </strong>{" "}
                  from {formatPeriodLabel(offer.fromPeriod, { mode })}, not this{" "}
                  {noun}&apos;s,
                </>
              ) : (
                <>
                  <strong>
                    {offer?.savesLeft === 1
                      ? "your last restore"
                      : `1 of your ${offer?.savesLeft} restores left`}
                  </strong>{" "}
                  this {noun}
                </>
              )}
              {offer?.streakAfter
                ? ` and brings your streak back to ${offer.streakAfter} ${
                    offer.streakAfter === 1 ? "day" : "days"
                  }.`
                : " and brings your streak back."}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onCancel}
            disabled={restoring}
          >
            Cancel
          </Button>
          <Button className="flex-1" onClick={onConfirm} disabled={restoring}>
            {restoring ? "Restoring…" : "Use a Restore"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
