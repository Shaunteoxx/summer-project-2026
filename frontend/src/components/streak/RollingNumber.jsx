import { AnimatePresence, motion } from "framer-motion";

import { EASE } from "@/animations/variants";

/**
 * The streak count, rolling like an odometer when it changes: the old figure
 * leaves upward and the new one arrives from below. Used for the overnight
 * rise and a restore alike, so any change to the number reads as movement in
 * the direction it went rather than a swap you might not notice.
 */
export default function RollingNumber({ value }) {
  return (
    <span className="relative inline-flex overflow-hidden align-top">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: "-100%", opacity: 0 }}
          transition={{ duration: 0.36, ease: EASE }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
