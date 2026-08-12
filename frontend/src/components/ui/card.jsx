import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * One card recipe: a hairline on a surface. The previous version stacked three
 * depth cues — border AND shadow AND (on the hero) a tinted gradient plus a
 * blurred glow. `shadow-card` here is a 4%-opacity 1px hint in light mode and
 * nothing at all in dark; real elevation is reserved for things that actually
 * float, which is bottom sheets and the add button.
 */
const Card = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-lg border border-hairline bg-surface text-ink shadow-card",
      className
    )}
    {...props}
  />
));
Card.displayName = "Card";

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("flex flex-col gap-1.5 p-[18px] pb-0", className)} {...props} />
));
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("text-[15px] font-semibold leading-tight tracking-[-0.015em]", className)}
    {...props}
  />
));
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p ref={ref} className={cn("text-meta text-ink-3", className)} {...props} />
));
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-[18px]", className)} {...props} />
));
CardContent.displayName = "CardContent";

export { Card, CardHeader, CardTitle, CardDescription, CardContent };
