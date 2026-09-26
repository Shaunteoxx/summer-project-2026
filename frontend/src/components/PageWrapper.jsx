import { motion } from "framer-motion";
import { pageVariants } from "@/animations/variants";

/**
 * Wraps a page with the fade + slide-up transition.
 * Bottom padding clears the floating dock, so a page scrolled to its end
 * leaves its last row above the glass rather than under it.
 */
export default function PageWrapper({ children, className = "" }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      // --dock-clear is px throughout, like the dock: a rem value would
      // over-pad at large fonts and (worse) under-clear at small ones.
      className={`w-full px-4 pt-6 pb-[var(--dock-clear)] ${className}`}
    >
      {children}
    </motion.div>
  );
}
