import { useCountUp } from "@/hooks/useCountUp";
import { LOCALE } from "@/lib/utils";

/**
 * Renders a number that counts up from 0 on first sight and tweens from the
 * figure on screen whenever the value changes.
 * Supports a currency prefix, plain-number, or percentage suffix.
 *
 * `memoryKey` names the figure across mounts (see useCountUp): give the same
 * key wherever the same number reappears on a later visit, and it picks up from
 * what the reader last saw instead of recounting from zero.
 */
export default function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1200,
  className = "",
  memoryKey,
}) {
  const display = useCountUp(value, { duration, decimals, memoryKey });

  // Same pinned locale as formatMoney, and for the same reason: every hero
  // figure on Home counts up through here, so leaving this to the runtime would
  // fix the separators in formatMoney and leave them wrong on the biggest
  // numbers on the screen.
  // The sign belongs outside the prefix, not inside the number. Concatenating
  // prefix + toLocaleString(-160) renders "$-160.00", which reads as a broken
  // string rather than as minus one hundred and sixty dollars. formatMoney
  // already puts the sign first; this matches it, so the same amount looks the
  // same wherever it appears.
  const negative = display < 0;
  const formatted = Math.abs(display).toLocaleString(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`tabular-nums ${className}`}>
      {negative ? "-" : ""}
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
