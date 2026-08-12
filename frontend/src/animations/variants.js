// Shared Framer Motion variants.
//
// Retuned for a daily-use tool. The previous set moved a lot: pages slid 24px,
// list items slid in 24px horizontally, cards scaled from 0.92, buttons lifted
// on hover. Opened six times a day that reads as fussy rather than polished.
// Now: mostly opacity, translations of 4–6px, and durations under 300ms.

export const EASE = [0.32, 0.72, 0, 1]; // iOS-flavoured ease-out

export const DUR = {
  micro: 0.12,
  base: 0.18,
  enter: 0.26,
  sheet: 0.34,
};

// Page transition: opacity carries it, 6px of travel gives direction.
export const pageVariants = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.enter, ease: EASE } },
  exit: { opacity: 0, y: -4, transition: { duration: DUR.base, ease: EASE } },
};

// Container that staggers its children. Defaults are tight — a long list
// should finish arriving in well under half a second, so cap the stagger at
// the first handful of items at the call site.
export const staggerContainer = (stagger = 0.024, delayChildren = 0.04) => ({
  initial: {},
  animate: { transition: { staggerChildren: stagger, delayChildren } },
});

// List item. Fade only: a horizontal slide on every transaction row made the
// ledger feel like it was assembling itself.
export const slideInItem = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.enter, ease: EASE } },
};

// Cards / tiles. Scale removed; 4px of lift reads as "arriving" without the
// zoom.
export const fadeScaleItem = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.enter, ease: EASE } },
};

// Generic fade-up for sections.
export const fadeUp = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: DUR.enter, ease: EASE } },
};

// Horizontal shake to flag an invalid field on submit. Trigger imperatively
// with useAnimationControls().start(SHAKE) so it replays on each attempt.
// Kept punchy — this one is supposed to interrupt you.
export const SHAKE = {
  x: [0, -7, 7, -5, 5, -2, 2, 0],
  transition: { duration: 0.4, ease: "easeInOut" },
};
