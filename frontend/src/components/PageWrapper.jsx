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
      className={`w-full px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] ${className}`}
    >
      {children}
    </motion.div>
  );
}
