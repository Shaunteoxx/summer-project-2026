import { useEffect, useId, useRef } from "react";
import { motion, AnimatePresence, useDragControls } from "framer-motion";
import { X } from "lucide-react";

import { useKeyboardInset } from "@/hooks/useKeyboardInset";

/**
 * Mobile bottom sheet: slides up from the bottom, dims the page behind it,
 * and can be dismissed by dragging the handle down, tapping the backdrop,
 * or pressing Escape. Constrained to the phone-width app column.
 */
export default function BottomSheet({
  open,
  onClose,
  title,
  children,
  closeLabel = "Close dialog",
}) {
  const sheetRef = useRef(null);
  const previousFocusRef = useRef(null);
  const titleId = useId();
  // On iOS the keyboard covers a fixed-position sheet rather than pushing it
  // up, so lift it by however much is covered and cap its height to what's
  // left. Always 0 on desktop, where nothing is covered.
  const { inset: keyboardInset, visibleHeight } = useKeyboardInset(open);
  const dragControls = useDragControls();

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

  // The field is usually focused before the keyboard finishes opening, so the
  // browser's own scroll-into-view happens against the old geometry. Redo it
  // once the sheet has been resized around the keyboard.
  useEffect(() => {
    if (!open || !keyboardInset) return;
    const focused = document.activeElement;
    if (focused && sheetRef.current?.contains(focused)) {
      focused.scrollIntoView({ block: "center" });
    }
  }, [open, keyboardInset]);

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
            style={{ bottom: keyboardInset || undefined }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 38 }}
            drag="y"
            // With the keyboard up the body can scroll, and a drag listener on
            // the whole sheet would swallow that scroll before it ever reached
            // the content. Dragging then comes from the handle only. With no
            // keyboard nothing scrolls, so drag-anywhere stays as it was.
            dragListener={keyboardInset === 0}
            dragControls={dragControls}
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
            <div
              className={`flex flex-col rounded-t-2xl border-t border-hairline bg-surface shadow-float ${
                keyboardInset ? "pb-2" : "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
              }`}
              // Only constrained while the keyboard is up: a tall form lifted
              // clear of it would otherwise run off the top of the screen.
              // Without a keyboard the sheet sizes to its content, as before.
              style={
                keyboardInset ? { maxHeight: `${visibleHeight - 8}px` } : undefined
              }
            >
              {/* Drag handle */}
              <div
                className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing"
                onPointerDown={(e) => {
                  if (keyboardInset) dragControls.start(e);
                }}
              >
                <span className="h-1 w-9 rounded-full bg-hairline-strong/30" />
              </div>

              <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-1 pt-1">
                {title ? (
                  <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={closeLabel}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-ink-2 transition-colors duration-base ease-out hover:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3">
                {children}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
