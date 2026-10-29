import { motion } from "framer-motion";
import { Trash2 } from "lucide-react";

import CategoryIcon from "@/components/CategoryIcon";
import EntryAmount from "@/components/EntryAmount";
import RepeatBadge from "@/components/RepeatBadge";
import SwipeToDelete from "@/components/SwipeToDelete";
import { formatMoney } from "@/lib/utils";
import { EASE } from "@/animations/variants";
import { rowKey } from "@/lib/ledger";

// How a deleted row leaves. The trash button slides it right and fades it,
// which is what says the delete can still be undone. A swipe has already
// carried the row off to the left, so what's left is the red strip, and that
// folds shut instead — the rows below close the gap rather than jumping it.
const BUTTON_EXIT = { opacity: 0, x: 24, transition: { duration: 0.25 } };
const SWIPE_EXIT = { height: 0, opacity: 0, transition: { duration: 0.22, ease: EASE } };

/**
 * One transaction in the ledger: tap to edit, a trash button or a swipe to
 * delete. `onDelete` takes `{ swiped }`, so the exit can tell which it was;
 * `swipedId` is that answer for the row already leaving, read through
 * AnimatePresence because a removed row can't take new props.
 */
export default function LedgerRow({
  t,
  category,
  account,
  swipedId,
  landed,
  isTourRow,
  onEdit,
  onDelete,
}) {
  // No entrance animation, and no `layout`. A row you just
  // added has to be readable the instant it lands — it
  // mounted mid-fade often enough that the ledger showed a
  // blank row until the next reload. Only the exit is
  // animated, because a delete is undoable and the slide is
  // what says so.
  //
  // What marks a new row instead is a tint laid *over* it
  // that fades away. The row itself is at full opacity from
  // its first frame, so a stalled animation can only ever
  // leave a faint highlight, never a blank.
  return (
    <motion.li
      data-entry-key={rowKey(t)}
      data-tour={isTourRow ? "tx.row" : undefined}
      custom={swipedId}
      variants={{
        exit: (swiped) => (swiped === t._id ? SWIPE_EXIT : BUTTON_EXIT),
      }}
      exit="exit"
      // Margins clear the sticky header above and the dock
      // below when this is scrolled to.
      className="relative overflow-hidden scroll-mt-[72px] scroll-mb-[var(--dock-clear)]"
    >
      <SwipeToDelete
        onDelete={() => onDelete({ swiped: true })}
        // Not yet saved: no server id to edit or delete by.
        disabled={t.pending}
        className="flex items-center gap-1 px-4 py-[13px]"
      >
        {/* The row itself opens the edit sheet. Everything but
            the delete button is one target, so a mistyped
            amount is a tap on the amount to fix — delete stays
            a separate, deliberate button beside it. */}
        <button
          type="button"
          onClick={onEdit}
          disabled={t.pending}
          aria-label={`Edit ${t.description}`}
          className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-sm py-1 text-left transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CategoryIcon category={category} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5 text-[15px] font-medium tracking-[-0.01em]">
              <span className="truncate">{t.description}</span>
              {/* Rows written by a repeating entry say so.
                  Nobody typed them, so without this they read
                  as entries you don't remember making. */}
              <RepeatBadge transaction={t} />
            </span>
            {/* The date has moved to the day header, so the
                meta line is category and account — plus, on a
                shared bill, what came back. The figure on the
                right is then your share, so the line says what
                it was a share of. */}
            <span className="mt-0.5 block truncate text-meta text-ink-3">
              {t.category}
              {t.paidBack > 0 &&
                (t.paidBack > t.amount ? (
                  <>
                    {" "}· {formatMoney(t.paidBack)} back on{" "}
                    {formatMoney(t.amount)}
                  </>
                ) : t.paidBack === t.amount ? (
                  <> · {formatMoney(t.amount)} paid back in full</>
                ) : (
                  <>
                    {" "}· {formatMoney(t.paidBack)} of {formatMoney(t.amount)} paid
                    back
                  </>
                ))}
              {account && <> · {account.name}</>}
              {/* Only if the save is slow enough to notice:
                  the fade holds back ~0.4s, so a normal
                  save confirms before this ever shows. */}
              {t.pending && (
                <span className="opacity-0 motion-safe:animate-fade-in-delayed motion-reduce:opacity-100">
                  {" "}· Saving…
                </span>
              )}
            </span>
          </span>
          <EntryAmount entry={t} />
        </button>
        <button
          onClick={() => onDelete()}
          disabled={t.pending}
          aria-label={`Delete ${t.description}`}
          // 44px of target in a 36px-looking button. It grows
          // to the RIGHT, into the row's own px-4 padding —
          // widening it leftward instead would close the 4px
          // gap to the edit button beside it, and a mis-tap
          // there deletes rather than opens.
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-negative/[0.08] active:bg-negative/[0.14] hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </SwipeToDelete>
      {landed?.key === rowKey(t) && (
        <span
          key={landed.n}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-row-land bg-ink/[0.07]"
        />
      )}
    </motion.li>
  );
}
