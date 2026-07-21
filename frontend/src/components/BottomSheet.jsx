import { useEffect, useId, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

/**
 * Mobile bottom sheet: slides up from the bottom, dims the page behind it,
 * and can be dismissed by dragging the handle down, tapping the backdrop,
 * or pressing Escape. Constrained to the phone-width app column.
 */
export default function BottomSheet({ open, onClose, title, children }) {
  const sheetRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();

  // Read onClose through a ref so the focus-management effect can depend on
  // `open` alone. Callers often pass a fresh onClose each render; keeping it in
  // the deps would re-run this effect on every keystroke and yank focus back to
  // the first focusable element (the close button).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement;
    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const frame = requestAnimationFrame(() => {
      const first = sheetRef.current?.querySelector(focusableSelector);
      (first || sheetRef.current)?.focus();
    });
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const focusable = [...sheetRef.current.querySelectorAll(focusableSelector)];
      if (!focusable.length) {
        e.preventDefault();
        sheetRef.current.focus();
      } else if (e.shiftKey && document.activeElement === focusable[0]) {
        e.preventDefault();
        focusable.at(-1).focus();
      } else if (!e.shiftKey && document.activeElement === focusable.at(-1)) {
        e.preventDefault();
        focusable[0].focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previousFocusRef.current?.focus?.();
    };
  }, [open]);

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
            ref={sheetRef}
            tabIndex={-1}
            className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-app outline-none"
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
            aria-labelledby={title ? titleId : undefined}
            aria-label={title ? undefined : "Dialog"}
          >
            <div className="rounded-t-2xl border-t border-border bg-card pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl">
              {/* Drag handle */}
              <div className="flex cursor-grab justify-center pb-1 pt-3 active:cursor-grabbing">
                <span className="h-1.5 w-10 rounded-full bg-muted-foreground/30" />
              </div>

              <div className="flex items-center justify-between gap-3 px-5 pb-1 pt-1">
                {title ? (
                  <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close dialog"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="px-5 pt-3">{children}</div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
