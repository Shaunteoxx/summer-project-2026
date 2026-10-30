import { useEffect, useRef, useState } from "react";

import { removeTransaction, removeTransfer } from "@/api/endpoints";
import { ruleFor } from "@/components/RepeatBadge";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useRecurring } from "@/hooks/useRecurring";
import { useToast } from "@/hooks/useToast";
import { rowKey } from "@/lib/ledger";

const DELETE_GRACE_MS = 10000;

/**
 * What the undo toast says after a delete.
 *
 * Deleting one row a repeating entry wrote leaves the rule alone — it has
 * already moved past that date and won't write it again. The trash button looks
 * the same on every row, though, so without saying so a skipped month reads as
 * possibly cancelling the rent for good.
 */
export function deletedMessage(transaction, rules) {
  const rule = ruleFor(transaction, rules);
  if (!rule || rule.paused) return "Transaction deleted";
  const next = rule.frequency === "weekly" ? "next week" : "next month";
  return `Deleted this one. ${rule.description} still repeats ${next}.`;
}

/**
 * Deleting from TransactionsPage's ledger. A transaction leaves at once and is
 * sent once its undo window closes; a transfer is sent straight away and put
 * back if the server refuses.
 *
 * Takes the page's two lists with their setters, and `land`, which highlights
 * a row that comes back. Hands back the two handlers, and `swipedId`, the row
 * the last swipe deleted, for the exit animation.
 */
export function useLedgerDeletes({ transactions, setTransactions, transfers, setTransfers, land }) {
  const toast = useToast();
  const guard = useDemoGuard();
  const { rules } = useRecurring();
  // Pending deletes awaiting their 10s undo window: id -> timeout handle.
  const pendingDeletes = useRef(new Map());
  // The row deleted by swiping, if the last delete was one. Read by the exit
  // animation through AnimatePresence, since a removed row can't take props.
  const [swipedId, setSwipedId] = useState(null);

  // On unmount, commit any deletes still in their undo window so they aren't lost.
  useEffect(() => {
    const timers = pendingDeletes.current;
    return () => {
      timers.forEach((timer, id) => {
        clearTimeout(timer);
        removeTransaction(id).catch(() => {});
      });
      timers.clear();
    };
  }, []);

  /**
   * Same optimistic-with-undo shape as a transaction delete, but transfers are
   * cheap to restore (nothing derived hangs off them), so this commits straight
   * away and puts the row back if the server refuses.
   */
  const handleDeleteTransfer = (id) => {
    if (guard()) return;
    const index = transfers.findIndex((m) => m._id === id);
    if (index === -1) return;
    const removed = transfers[index];

    setTransfers((prev) => prev.filter((m) => m._id !== id));
    removeTransfer(id)
      .then(() => toast.info("Transfer removed"))
      .catch(() => {
        setTransfers((prev) => {
          if (prev.some((m) => m._id === id)) return prev;
          const next = [...prev];
          next.splice(Math.min(index, next.length), 0, removed);
          return next;
        });
        toast.error("Couldn't remove that transfer. Please try again.");
      });
  };

  // Optimistically remove, then commit the server delete after a 10s undo window.
  const handleDelete = (id, { swiped = false } = {}) => {
    if (guard()) return;
    const index = transactions.findIndex((t) => t._id === id);
    if (index === -1) return;
    const removed = transactions[index];

    const restore = () =>
      setTransactions((prev) => {
        if (prev.some((t) => t._id === removed._id)) return prev;
        const next = [...prev];
        next.splice(Math.min(index, next.length), 0, removed);
        return next;
      });

    setSwipedId(swiped ? id : null);
    setTransactions((prev) => prev.filter((t) => t._id !== id));

    const timer = setTimeout(() => {
      pendingDeletes.current.delete(id);
      removeTransaction(id).catch(() => {
        restore();
        toast.error("Couldn't delete transaction. Please try again.");
      });
    }, DELETE_GRACE_MS);
    pendingDeletes.current.set(id, timer);

    toast.show({
      message: deletedMessage(removed, rules),
      variant: "info",
      duration: DELETE_GRACE_MS,
      action: {
        label: "Undo",
        onClick: () => {
          const pending = pendingDeletes.current.get(id);
          if (pending) {
            clearTimeout(pending);
            pendingDeletes.current.delete(id);
          }
          restore();
          land(rowKey(removed));
        },
      },
    });
  };

  return { handleDelete, handleDeleteTransfer, swipedId };
}
