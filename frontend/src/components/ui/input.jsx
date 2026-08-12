import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * 16px minimum font-size is load-bearing on iOS: anything smaller makes Safari
 * zoom the viewport on focus, which fights the bottom sheet's keyboard inset
 * handling. Keep it at text-base.
 */
const Input = React.forwardRef(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      "flex h-[46px] w-full rounded-md border border-hairline-strong bg-surface px-3.5 text-base text-ink",
      "transition-colors duration-base ease-out",
      "placeholder:text-ink-3",
      "focus-visible:border-ink focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ink",
      "disabled:cursor-not-allowed disabled:opacity-40",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export { Input };
