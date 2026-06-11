import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * Mobile bottom sheet: slides up from the bottom, dims the page behind it,
 * and can be dismissed by dragging the handle down, tapping the backdrop,
 * or pressing Escape. Constrained to the phone-width app column.
 */
export default function BottomSheet({ open, onClose, title, children }) {
  // While open: lock body scroll and close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-app"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 1 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose();
            }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
          >
            <div className="rounded-t-2xl border-t border-border bg-card pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl">
              {/* Drag handle */}
              <div className="flex cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing">
                <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
              </div>

              {title && (
                <h2 className="px-5 pb-1 pt-1 text-lg font-semibold">{title}</h2>
              )}

              <div className="px-5 pt-3">{children}</div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
