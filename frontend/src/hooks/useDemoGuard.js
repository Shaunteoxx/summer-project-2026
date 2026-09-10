import { useCallback } from "react";

/**
 * Returns a guard() that write actions call before mutating:
 *
 *   const guard = useDemoGuard();
 *   const handleSave = () => { if (guard()) return; ...save... };
 *
 * It always allows the action now, so `if (guard())` is never taken. The demo
 * used to be one shared account that had to be read-only — one visitor's edits
 * would have shown up for everyone — so this blocked every write and toasted an
 * apology. Each visitor gets their own disposable sandbox today, with nothing
 * to protect them from but their own edits, which is the whole point of a demo.
 *
 * The hook stays, returning false, so the couple of dozen call sites keep
 * working untouched and there's still a seam here if some action ever does need
 * gating again.
 */
export function useDemoGuard() {
  return useCallback(() => false, []);
}
