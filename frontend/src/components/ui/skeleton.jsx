import { cn } from "@/lib/utils";

/**
 * Placeholder block shown while async content loads. Sized by the caller to
 * reserve the same space the real content will occupy, so layout doesn't jump
 * when data arrives.
 *
 * `animate-pulse` is a CSS animation, so prefers-reduced-motion stills it via
 * the global rule in index.css rather than needing a check here.
 */
export function Skeleton({ className }) {
  return (
    <div
      className={cn("animate-pulse rounded-sm bg-surface-2", className)}
      aria-hidden="true"
    />
  );
}
