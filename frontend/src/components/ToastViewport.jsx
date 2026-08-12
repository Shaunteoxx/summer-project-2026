import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

// Green still means money kept and red still means something went wrong; an
// informational toast takes ink rather than a third status colour.
const VARIANTS = {
  success: { icon: CheckCircle2, accent: "text-positive" },
  error: { icon: XCircle, accent: "text-negative" },
  info: { icon: Info, accent: "text-ink-2" },
};

// Swipe far enough, or flick fast enough, and the toast is dismissed.
const SWIPE_OFFSET = 80; // px
const SWIPE_VELOCITY = 500; // px/s

/**
 * Renders the toast stack bottom-center, sitting just above the tab bar
 * (the standard mobile snackbar position). Newest toast appears at the bottom.
 */
export default function ToastViewport({ toasts, onDismiss }) {
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}
    >
      <div className="w-full max-w-app space-y-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => {
            const { icon: Icon, accent } = VARIANTS[t.variant] ?? VARIANTS.info;
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                drag
                dragElastic={0.5}
                dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
                whileDrag={{ cursor: "grabbing" }}
                onDragEnd={(_e, info) => {
                  const { offset, velocity } = info;
                  const swipedSideways =
                    Math.abs(offset.x) > SWIPE_OFFSET ||
                    Math.abs(velocity.x) > SWIPE_VELOCITY;
                  const swipedDown =
                    offset.y > SWIPE_OFFSET || velocity.y > SWIPE_VELOCITY;
                  if (swipedSideways || swipedDown) onDismiss(t.id);
                }}
                className="surface-blur pointer-events-auto flex touch-none items-center gap-3 rounded-lg border border-hairline p-3.5 shadow-float"
                role="status"
              >
                <Icon className={`h-5 w-5 shrink-0 ${accent}`} />
                <p className="flex-1 text-[13px] font-medium leading-snug text-ink">
                  {t.message}
                </p>
                {t.action ? (
                  <button
                    onClick={() => {
                      t.action.onClick();
                      onDismiss(t.id);
                    }}
                    className="-my-1 shrink-0 rounded-sm px-2.5 py-1.5 text-[13px] font-semibold text-ink transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t.action.label}
                  </button>
                ) : (
                  <button
                    onClick={() => onDismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="-my-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
