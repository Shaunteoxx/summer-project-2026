import { useCountUp } from "@/hooks/useCountUp";

/**
 * Renders a number that counts up from 0 on mount / value change.
 * Supports a currency prefix, plain-number, or percentage suffix.
 */
export default function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  duration = 1200,
  className = "",
}) {
  const display = useCountUp(value, { duration, decimals });

  const formatted = display.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return (
    <span className={`tabular-nums ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
