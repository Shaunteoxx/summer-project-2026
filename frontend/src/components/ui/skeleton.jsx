import { cn } from "@/lib/utils";

/**
 * Placeholder block shown while async content loads. Pulses via `animate-pulse`
 * (a CSS animation, so it's automatically stilled under prefers-reduced-motion).
 * Sized by the caller to reserve the same space the real content will occupy,
 * which keeps layout from jumping when data arrives.
 */
export function Skeleton({ className }) {
  return (
    <div className={cn("animate-pulse rounded-md bg-muted", className)} aria-hidden="true" />
  );
}
