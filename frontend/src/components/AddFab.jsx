import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";

import { EASE, DUR } from "@/animations/variants";

// Where adding an entry is a sensible next action. Plan is a what-if surface
// and More is settings; a button offering to log an expense on either is noise.
const SHOW_ON = ["/", "/transactions", "/tracker"];

/**
 * The add-transaction button.
 *
 * This is the app's primary verb — it's a manual tracker with no bank sync, so
 * logging is the whole daily job — and it deliberately lives here rather than
 * as a centre tab in the nav. A tab bar is a set of destinations: every slot
 * navigates and holds an active state, and a "+" that opens a modal can do
 * neither. It would also cost a destination, pushing Plan into a More menu that
 * already holds Stats, Friends, Repeating entries, Budget period and Profile.
 *
 * Practical upside: 54px against a ~44px tab, and the bottom-right corner is an
 * easier thumb reach on a tall phone than dead centre.
 */
export default function AddFab() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const visible = SHOW_ON.includes(pathname);

  return (
    // The wrapper tracks the phone-width column so the button hugs the content's
    // right edge rather than the viewport's on a desktop window. It's
    // pointer-events-none so it never swallows taps on the page behind it.
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.9rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-app justify-end px-5">
      <AnimatePresence>
        {visible && (
          <motion.button
            type="button"
            aria-label="Add a transaction"
            onClick={() =>
              navigate("/transactions", { state: { openAdd: "expense" } })
            }
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            whileTap={{ scale: 0.94 }}
            transition={{ duration: DUR.base, ease: EASE }}
            className="pointer-events-auto flex h-[54px] w-[54px] items-center justify-center rounded-xl bg-ink text-surface shadow-float focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Plus className="h-[23px] w-[23px]" strokeWidth={2.4} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
