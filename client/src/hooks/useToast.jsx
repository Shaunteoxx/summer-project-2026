import { createContext, useContext, useCallback, useRef, useState } from "react";
import ToastViewport from "@/components/ToastViewport";

const ToastContext = createContext(null);
const MAX_VISIBLE = 3;

let idCounter = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  /**
   * show("message") or show({ message, variant, duration, action }).
   * `action` = { label, onClick } renders a button (e.g. Undo) instead of a close X.
   * duration 0 keeps the toast until dismissed manually.
   */
  const show = useCallback(
    (opts) => {
      const {
        message,
        variant = "info",
        duration = 3000,
        action,
      } = typeof opts === "string" ? { message: opts } : opts;

      const id = ++idCounter;
      setToasts((prev) => [...prev, { id, message, variant, action }].slice(-MAX_VISIBLE));

      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
      return id;
    },
    [dismiss]
  );

  const success = useCallback((message, opts) => show({ message, variant: "success", ...opts }), [show]);
  const error = useCallback((message, opts) => show({ message, variant: "error", ...opts }), [show]);
  const info = useCallback((message, opts) => show({ message, variant: "info", ...opts }), [show]);

  return (
    <ToastContext.Provider value={{ show, success, error, info, dismiss }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
