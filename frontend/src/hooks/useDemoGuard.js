import { useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";

// Throttle the read-only toast so rapid taps don't stack it.
let lastShown = 0;

/**
 * Returns a guard() for write actions. When the current user is the read-only
 * demo account it shows a friendly toast and returns true (the caller should
 * bail out before mutating). Otherwise returns false and the action proceeds.
 *
 *   const guard = useDemoGuard();
 *   const handleSave = () => { if (guard()) return; ...save... };
 */
export function useDemoGuard() {
  const { user } = useAuth();
  const toast = useToast();

  return useCallback(() => {
    if (!user?.isDemo) return false;
    const now = Date.now();
    if (now - lastShown > 2000) {
      lastShown = now;
      toast.info("This is a read-only demo — sign in to make changes.");
    }
    return true;
  }, [user, toast]);
}
