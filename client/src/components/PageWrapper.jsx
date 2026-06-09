import { motion } from "framer-motion";
import { pageVariants } from "@/animations/variants";

/** Wraps a page with the fade + slide-up transition. */
export default function PageWrapper({ children, className = "" }) {
  return (
    <motion.div
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={`mx-auto w-full max-w-5xl px-4 py-8 ${className}`}
    >
      {children}
    </motion.div>
  );
}
