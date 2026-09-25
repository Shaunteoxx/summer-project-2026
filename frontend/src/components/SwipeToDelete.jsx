import { useRef } from "react";
import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { Trash2 } from "lucide-react";

import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { EASE } from "@/animations/variants";

// Drag this far left and letting go deletes. Far enough that a sloppy
// vertical scroll can't get there by accident, short enough for one thumb.
const COMMIT_PX = 96;
// ...or flick: a fast swipe commits from a shorter distance, as it does in
// Mail. The distance floor stops a twitch from counting as a flick.
const FLICK_PX_S = 600;
const FLICK_MIN_PX = 32;

/**
 * Swipe a row left to delete it — the gesture every phone list has trained.
 *
 * An accelerator, not the only way: the row keeps its trash button, which is
 * what a mouse, a keyboard and a screen reader use. For the same reason the
 * gesture exists only on touch-first devices; on a desktop a click-drag on a
 * row is far more likely to be someone selecting text.
 *
 * The row's own surface slides over a red strip that says what letting go will
 * do. Crossing the point of no return ticks once — the icon grows and the
 * phone taps — so the commit is felt before it happens rather than after.
 * Released short of it, the row springs back and nothing is deleted. Past it,
 * the row slides the rest of the way out and `onDelete` runs once it's gone;
 * the caller decides what "deleted" means (here: gone, with an undo).
 *
 * `disabled` holds the row still — an entry the server hasn't confirmed yet
 * has nothing to delete.
 */
export default function SwipeToDelete({ onDelete, disabled = false, className, children }) {
  const coarse = useCoarsePointer();
  const x = useMotionValue(0);
  const armed = useRef(false);
  // Set once a drag actually starts, so the click that ends it can be eaten —
  // otherwise releasing a short swipe over the row opens its edit sheet.
  const dragged = useRef(false);
  const surface = useRef(null);

  const iconScale = useTransform(x, [-COMMIT_PX - 1, -COMMIT_PX, 0], [1.15, 1, 0.8]);
  const iconOpacity = useTransform(x, [-COMMIT_PX * 0.6, -16], [1, 0]);

  if (!coarse || disabled) {
    return <div className={className}>{children}</div>;
  }

  const release = (_event, info) => {
    const offset = x.get();
    const committed =
      offset <= -COMMIT_PX ||
      (info.velocity.x < -FLICK_PX_S && offset < -FLICK_MIN_PX);
    armed.current = false;
    if (!committed) {
      animate(x, 0, { type: "spring", stiffness: 500, damping: 40 });
      return;
    }
    const width = surface.current?.offsetWidth ?? 400;
    animate(x, -width, { duration: 0.18, ease: EASE }).then(onDelete);
  };

  return (
    <div className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-end bg-negative pr-6 text-destructive-foreground"
      >
        <motion.span style={{ scale: iconScale, opacity: iconOpacity }}>
          <Trash2 className="h-5 w-5" />
        </motion.span>
      </div>
      <motion.div
        ref={surface}
        drag="x"
        dragDirectionLock
        // Left is free; right stops dead at the resting position, since
        // there's nothing behind the row on that side.
        dragConstraints={{ right: 0 }}
        dragElastic={0}
        dragMomentum={false}
        // Vertical pans stay the browser's, so the ledger still scrolls from
        // anywhere on a row.
        style={{ x, touchAction: "pan-y" }}
        onPointerDownCapture={() => {
          dragged.current = false;
        }}
        onDragStart={() => {
          dragged.current = true;
        }}
        onDrag={() => {
          const past = x.get() <= -COMMIT_PX;
          if (past !== armed.current) {
            armed.current = past;
            if (past) haptic();
          }
        }}
        onDragEnd={release}
        onClickCapture={(event) => {
          if (!dragged.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        className={cn("relative bg-surface", className)}
      >
        {children}
      </motion.div>
    </div>
  );
}
