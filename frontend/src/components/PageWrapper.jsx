import { motion } from "framer-motion";
import { pageVariants } from "@/animations/variants";

/**
 * Wraps a page with the fade + slide-up transition.
 * Bottom padding clears the fixed bottom tab bar (plus the home indicator).
 *
 * Clearing the *add button* is not this component's job — that button only
 * exists on three routes, and only the app shell knows which one is showing.
 * AppLayout adds the difference there; see App.jsx.
 */
export default function PageWrapper({ children, className = "" }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      // px, not rem: this clears the fixed px-height tab bar, so a rem value
      // would over-pad at large fonts and (worse) under-clear at small ones.
      // 88px == the old 5.5rem at the default font, but font-independent.
      className={`w-full px-4 pt-6 pb-[calc(88px+env(safe-area-inset-bottom))] ${className}`}
    >
      {children}
    </motion.div>
  );
}
