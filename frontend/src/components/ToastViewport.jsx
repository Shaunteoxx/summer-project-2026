import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

const VARIANTS = {
  success: { icon: CheckCircle2, accent: "text-success" },
  error: { icon: XCircle, accent: "text-destructive" },
  info: { icon: Info, accent: "text-primary" },
};

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
                className="surface-blur pointer-events-auto flex items-center gap-3 rounded-xl border border-border/80 bg-card/95 p-3.5 shadow-lg"
                role="status"
              >
                <Icon className={`h-5 w-5 shrink-0 ${accent}`} />
                <p className="flex-1 text-sm font-medium leading-snug text-card-foreground">
                  {t.message}
                </p>
                {t.action ? (
                  <button
                    onClick={() => {
                      t.action.onClick();
                      onDismiss(t.id);
                    }}
                    className="-my-1 shrink-0 rounded-md px-2.5 py-1.5 text-sm font-semibold text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t.action.label}
                  </button>
                ) : (
                  <button
                    onClick={() => onDismiss(t.id)}
                    aria-label="Dismiss notification"
                    className="-my-1 -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
