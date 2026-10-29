import { motion } from "framer-motion";
import { ArrowLeftRight, ArrowRight, Trash2 } from "lucide-react";

import { formatMoney } from "@/lib/utils";

/** A move between the user's own accounts, recorded but never budgeted. */
export default function TransferRow({ transfer, from, to, onDelete }) {
  return (
    <motion.li
      exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}
      className="flex items-center gap-1 px-4 py-[13px]"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Neutral tile, not a category colour: a transfer has no category,
            and tinting it would file it alongside spending. */}
        <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-sm bg-surface-2 text-ink-3">
          <ArrowLeftRight className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex min-w-0 items-center gap-1.5 truncate text-[15px] font-medium tracking-[-0.01em]">
            {from?.name ?? "Removed Account"}
            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-ink-3" />
            {to?.name ?? "Removed Account"}
          </p>
          <p className="mt-0.5 truncate text-meta text-ink-3">
            Transfer · doesn&apos;t touch your budget
          </p>
        </div>
        {/* No sign and a quiet ink-3: a transfer is neither income nor
            spending, and signing it either way would suggest it moved the
            budget, which it never does. */}
        <span className="num shrink-0 text-[15px] font-medium text-ink-3">
          {formatMoney(transfer.amount)}
        </span>
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete transfer of ${formatMoney(transfer.amount)}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-negative/[0.08] active:bg-negative/[0.14] hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.li>
  );
}
