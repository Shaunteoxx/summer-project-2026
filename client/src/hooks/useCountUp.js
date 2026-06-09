import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 (or `from`) up to `value` over `duration` ms.
 * Uses requestAnimationFrame with an easeOut curve. Re-runs when value changes.
 */
export function useCountUp(value, { duration = 1200, from = 0, decimals = 0 } = {}) {
  const [display, setDisplay] = useState(from);
  const frame = useRef();
  const startTime = useRef();

  useEffect(() => {
    const target = Number(value) || 0;
    startTime.current = undefined;

    const easeOut = (t) => 1 - Math.pow(1 - t, 3);

    const tick = (now) => {
      if (startTime.current === undefined) startTime.current = now;
      const elapsed = now - startTime.current;
      const progress = Math.min(elapsed / duration, 1);
      const current = from + (target - from) * easeOut(progress);
      setDisplay(current);
      if (progress < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration]);

  const factor = Math.pow(10, decimals);
  return Math.round(display * factor) / factor;
}
