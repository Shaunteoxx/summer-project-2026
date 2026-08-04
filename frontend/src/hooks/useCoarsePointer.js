import { useEffect, useState } from "react";

const QUERY = "(pointer: coarse)";

/**
 * True when the primary pointer is a finger — a phone or tablet, where tapping
 * a field should open an in-app keypad rather than the OS keyboard.
 *
 * Stays false on desktop, including touchscreen laptops: those report a mouse
 * as the *primary* pointer, so typing keeps working for anyone with a keyboard.
 */
export function useCoarsePointer() {
  const [coarse, setCoarse] = useState(
    () => window.matchMedia?.(QUERY).matches === true
  );

  useEffect(() => {
    const query = window.matchMedia?.(QUERY);
    if (!query) return;
    // Re-read on mount as well: a device can be rotated or docked between the
    // initial render and here.
    setCoarse(query.matches);
    const onChange = (event) => setCoarse(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return coarse;
}
