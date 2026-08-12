import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";

/**
 * Inline, red, animated validation message shown directly beneath an invalid
 * field. Pair with a shaking wrapper (useAnimationControls + SHAKE) and a red
 * border/ring on the field itself for a clear, consistent error state.
 */
export default function FieldError({ id, children }) {
  return (
    <motion.p
      id={id}
      role="alert"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-1.5 text-[12px] font-medium text-negative"
    >
      <AlertCircle className="h-3.5 w-3.5 shrink-0" />
      {children}
    </motion.p>
  );
}
