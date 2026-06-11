// Shared Framer Motion variants. Default easing is easeOut, durations 0.4s–0.8s.

export const EASE = [0.16, 1, 0.3, 1]; // smooth easeOut-style curve

// Page transition: fade + slide up
export const pageVariants = {
  initial: { opacity: 0, y: 24 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASE },
  },
  exit: {
    opacity: 0,
    y: -16,
    transition: { duration: 0.3, ease: EASE },
  },
};

// Container that staggers its children (e.g. transaction list, card grids)
export const staggerContainer = (stagger = 0.08, delayChildren = 0.1) => ({
  initial: {},
  animate: {
    transition: { staggerChildren: stagger, delayChildren },
  },
});

// List item slide-in (used per transaction card)
export const slideInItem = {
  initial: { opacity: 0, x: -24 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.5, ease: EASE },
  },
};

// Fade + scale in (friend cards, comparison cards)
export const fadeScaleItem = {
  initial: { opacity: 0, scale: 0.92 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, ease: EASE },
  },
};

// Generic fade-up for stat cards / sections
export const fadeUp = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: EASE },
  },
};
