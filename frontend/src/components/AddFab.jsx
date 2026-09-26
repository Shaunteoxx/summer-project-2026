import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";

import { EASE, DUR } from "@/animations/variants";

/**
 * The add-transaction button, at the trailing end of the dock (see BottomNav,
 * which places it).
 *
 * This is the app's primary verb — it's a manual tracker with no bank sync, so
 * logging is the whole daily job — and it deliberately sits beside the tab bar
 * rather than in it. A tab bar is a set of destinations: every slot navigates
 * and holds an active state, and a "+" that opens a modal can do neither. It
 * would also cost a destination, pushing Plan into a More menu that already
 * holds Stats, Friends, Repeating entries, Budget period and Profile.
 *
 * It's the one control in the app on stained glass. Apple tints only the
 * primary action, on its background, and ink rather than green keeps green
 * meaning money. Being in the dock also puts it in the bottom-right corner,
 * an easier thumb reach on a tall phone than dead centre.
 *
 * It stays put while the page scrolls — deliberately. TransactionsPage dropped
 * its own Income/Expense buttons on the strength of this being a persistent
 * target that doesn't scroll away, so hiding it on scroll would take away the
 * only way into the sheet on the page that needs it most.
 */
export default function AddFab() {
  const navigate = useNavigate();

  return (
    <motion.button
      type="button"
      data-tour="fab"
      aria-label="Add a transaction"
      onClick={() => navigate("/transactions", { state: { openAdd: "expense" } })}
      whileTap={{ scale: 0.94 }}
      transition={{ duration: DUR.base, ease: EASE }}
      // A disc as tall as the tab bar beside it: Apple rounds anything that
      // floats alone, and matching heights is what makes the two read as one
      // dock rather than a bar with a button parked next to it.
      className="glass-ink pointer-events-auto flex h-full w-[var(--dock-h)] shrink-0 items-center justify-center rounded-full text-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Plus className="h-[24px] w-[24px]" strokeWidth={2.4} />
    </motion.button>
  );
}
