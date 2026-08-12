import * as React from "react";
import { cva } from "class-variance-authority";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * Buttons are quiet. The default is ink-on-surface rather than a brand colour:
 * green is reserved for money, so a "primary" action can't claim it.
 *
 * Motion note: there is deliberately no hover transform. The old button lifted
 * 1px and scaled 1.03 on a 400-stiffness spring, which reads as fussy in an app
 * you open six times a day — and does nothing at all on touch, where most of
 * these are pressed. Press feedback is a 1.5% scale, fast.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-[15px] font-semibold tracking-[-0.01em] " +
    "transition-colors duration-base ease-out " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
    "disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default: "bg-ink text-surface hover:bg-ink-2",
        destructive: "bg-negative text-white hover:bg-negative/90",
        success: "bg-positive text-white hover:bg-positive/90",
        outline: "border border-hairline-strong bg-surface text-ink hover:bg-surface-2",
        secondary: "bg-surface-2 text-ink hover:bg-surface-3",
        ghost: "text-ink hover:bg-surface-2",
        link: "text-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[46px] px-5",
        sm: "h-9 rounded-sm px-3 text-[13px]",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10 rounded-sm",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const Button = React.forwardRef(({ className, variant, size, ...props }, ref) => (
  <motion.button
    ref={ref}
    whileTap={{ scale: 0.985 }}
    transition={{ duration: 0.12, ease: [0.32, 0.72, 0, 1] }}
    className={cn(buttonVariants({ variant, size, className }))}
    {...props}
  />
));
Button.displayName = "Button";

export { Button, buttonVariants };
