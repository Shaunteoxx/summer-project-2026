import mark from "@/assets/brand-mark.svg";
import { cn } from "@/lib/utils";

/**
 * The brand mark: the app icon's wallet on its ink tile, rendered by
 * scripts/icons.mjs from the same artwork as the Home Screen icon. The top bar,
 * sign-in and the loader all show it, so the app has one face from the Home
 * Screen in.
 *
 * The tile stays ink in dark mode rather than inverting, as the icon it
 * matches does. Decorative unless given a label.
 */
export default function BrandMark({ size, label, className }) {
  return (
    <img
      src={mark}
      width={size}
      height={size}
      alt={label ?? ""}
      draggable={false}
      className={cn("shrink-0 select-none", className)}
    />
  );
}
