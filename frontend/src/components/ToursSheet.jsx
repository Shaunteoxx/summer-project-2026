import { RotateCcw } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import SwitchRow from "@/components/SwitchRow";
import { Button } from "@/components/ui/button";
import { useTourContext } from "@/tour/TourProvider";
import { ALL_TOURS, REPLAY_WITH, REPLAYABLE, TOURS } from "@/tour/tours";

/**
 * Every page's tour, to run again, and the switch for the tips that turn up as
 * you go. Replaying one takes you to its page and starts it there — tips on or
 * off, because asking for a tour by name is the opposite of having turned them
 * off.
 *
 * The Tips switch used to be its own row on More. It lives here now, beside
 * the tours it governs, so Help takes one row there instead of two. It comes
 * first because the list runs to seven tours, which would push a switch at the
 * bottom off a small screen.
 */
export default function ToursSheet({ open, onClose }) {
  const tour = useTourContext();

  const replay = (ids, route) => {
    onClose();
    tour.replay(ids, route);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Tours & Tips">
      <div className="space-y-4">
        <SwitchRow
          checked={!tour.off}
          onChange={(on) => tour.setOff(!on)}
          label="Tips"
          description={
            tour.off ? "Off — tours only when you ask" : "Shown as you come across things"
          }
        />

        <p className="text-[13px] leading-relaxed text-ink-3">
          Each page has a short tour of what&apos;s on it. Replay one and it
          starts as soon as you get there.
        </p>

        <ul className="-mx-1">
          {REPLAYABLE.map((id) => (
            <li key={id}>
              <button
                type="button"
                onClick={() => replay(REPLAY_WITH[id] ?? [id], TOURS[id].route)}
                className="flex w-full items-center gap-3 rounded-sm px-1 py-2.5 text-left transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium tracking-[-0.01em]">
                    {TOURS[id].title}
                  </span>
                  <span className="mt-0.5 block text-meta text-ink-3">
                    {tour.isDone(id) ? "Seen" : "Not seen yet"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-2">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Replay
                </span>
              </button>
            </li>
          ))}
        </ul>

        <Button variant="outline" className="w-full" onClick={() => replay(ALL_TOURS, "/")}>
          Replay Everything
        </Button>
        <p className="text-center text-[12px] leading-relaxed text-ink-3">
          Brings back the one-off tips too, starting from Home.
        </p>
      </div>
    </BottomSheet>
  );
}
