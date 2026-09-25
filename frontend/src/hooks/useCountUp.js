import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

/**
 * What each remembered counter last settled on, for this session.
 *
 * Module state rather than component state because the counters that matter
 * unmount between the moments that matter: you log a coffee on Transactions,
 * then open Home, and Home's hero is a brand-new component. Without this it
 * could only count up from zero again, which says "here is a number" when the
 * thing worth saying is "your $32.40 is now $27.40".
 *
 * Signing out reloads the page (see clearSession in useAuth), so one account's
 * figures never become the next account's starting point.
 */
const settled = new Map();

/** A change is an update, not an introduction, so it gets less time. */
const UPDATE_MS = 700;

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Animates a number towards `value` with requestAnimationFrame on an easeOut
 * curve.
 *
 * It always moves from the figure currently on screen, never back to `from`: a
 * value that changes while mounted tweens the difference. Pass `memoryKey` and
 * that holds across mounts too — the first sighting in a session counts up
 * from `from`, and later ones start where the last one left off, which is no
 * animation at all when nothing changed.
 *
 * Honours prefers-reduced-motion by snapping straight to the final value.
 */
export function useCountUp(
  value,
  { duration = 1200, from = 0, decimals = 0, memoryKey } = {}
) {
  const target = Number(value) || 0;
  const remembered = memoryKey !== undefined && settled.has(memoryKey);
  const [display, setDisplay] = useState(() =>
    remembered ? settled.get(memoryKey) : from
  );
  // The figure on screen right now, readable from inside the effect without
  // making it a dependency — it changes every frame.
  const shown = useRef(display);
  // Whether the next animation is this counter's introduction. Cleared on the
  // first real frame rather than when the effect runs, so StrictMode's
  // run-cleanup-run in development doesn't shorten the first count.
  const intro = useRef(!remembered);
  const frame = useRef();
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Remembered as soon as it's the target, not when the tween lands: leave
    // mid-count and come back, and it shouldn't replay the part you missed.
    if (memoryKey !== undefined) settled.set(memoryKey, target);

    const start = shown.current;
    if (reduceMotion || start === target) {
      shown.current = target;
      setDisplay(target);
      return;
    }

    const ms = intro.current ? duration : Math.min(duration, UPDATE_MS);
    let startTime;

    const tick = (now) => {
      if (startTime === undefined) {
        startTime = now;
        intro.current = false;
      }
      const progress = Math.min((now - startTime) / ms, 1);
      const current =
        progress < 1 ? start + (target - start) * easeOut(progress) : target;
      shown.current = current;
      setDisplay(current);
      if (progress < 1) frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [target, duration, reduceMotion, memoryKey]);

  const factor = Math.pow(10, decimals);
  return Math.round(display * factor) / factor;
}
