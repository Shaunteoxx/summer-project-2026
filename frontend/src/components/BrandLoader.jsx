import { Wallet } from "lucide-react";

/**
 * Branded full-screen loading state for the auth gate / first paint.
 * Uses 100dvh (not 100vh) so it fills the visible viewport on mobile.
 */
export default function BrandLoader() {
  return (
    <div className="app-bg flex min-h-[100dvh] flex-col items-center justify-center gap-5">
      <div className="flex h-14 w-14 animate-pulse items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
        <Wallet className="h-7 w-7" />
      </div>
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
    </div>
  );
}
