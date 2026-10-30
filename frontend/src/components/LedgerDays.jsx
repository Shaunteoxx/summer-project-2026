import { AnimatePresence } from "framer-motion";

import LedgerRow from "@/components/LedgerRow";
import TransferRow from "@/components/TransferRow";
import { useAccounts } from "@/hooks/useAccounts";
import { useCategories } from "@/hooks/useCategories";
import { cn, formatMoney } from "@/lib/utils";
import { rowKey } from "@/lib/ledger";

/**
 * The ledger a day at a time, with the day's net beside its date. Rows sit on
 * hairlines inside one surface per day rather than each being its own
 * card — a card per entry gave every $4 coffee the same weight as the
 * day it belongs to, and the repetition is what made the list read as
 * noisy rather than as a register.
 *
 * `days` comes from ledgerView. `landed` is the row being highlighted and
 * `swipedId` the one the last swipe deleted; `tourRow` is the row the page tour
 * points at. onEdit(row), onDelete(id, { swiped }) and onDeleteTransfer(id) are
 * the page's.
 */
export default function LedgerDays({
  days,
  swipedId,
  landed,
  tourRow,
  onEdit,
  onDelete,
  onDeleteTransfer,
}) {
  const { getCategory } = useCategories();
  const { getAccount } = useAccounts();

  return (
    <div>
      {days.map(({ key, entries, net, counted, label }, dayIndex) => (
        <section key={key} className="mt-4 first:mt-0">
          <header
            className="flex items-baseline justify-between gap-3 pb-2"
            data-tour={dayIndex === 0 ? "tx.day" : undefined}
          >
            <h2 className="text-overline text-ink-3">{label}</h2>
            <span
              className={cn(
                "num text-[12px] font-medium",
                counted && net > 0 ? "text-positive" : "text-ink-3"
              )}
            >
              {!counted
                ? "—"
                : net > 0
                  ? `+${formatMoney(net)}`
                  : net < 0
                    ? `−${formatMoney(-net)}`
                    : formatMoney(0)}
            </span>
          </header>

          {/* The presence boundary is *inside* the day, around the rows
              only. Put it around the days instead and a day that stops
              matching the search stays mounted for as long as its rows
              take to fade — so typing leaves a trail of headers with a
              row-shaped hole under each. A day that no longer matches
              isn't leaving, it was never in this result: it goes at
              once, and only a row you actually deleted animates out. */}
          <ul className="-mx-4 border-y border-hairline bg-surface [&>*+*]:border-t [&>*+*]:border-hairline">
            <AnimatePresence initial={false} custom={swipedId}>
              {entries.map((entry) => {
                if (entry.kind === "transfer") {
                  const m = entry.row;
                  return (
                    <TransferRow
                      key={m._id}
                      transfer={m}
                      from={getAccount(String(m.from))}
                      to={getAccount(String(m.to))}
                      onDelete={() => onDeleteTransfer(m._id)}
                    />
                  );
                }
                const t = entry.row;
                return (
                  <LedgerRow
                    key={rowKey(t)}
                    t={t}
                    category={getCategory(t.category)}
                    account={getAccount(t.accountId)}
                    swipedId={swipedId}
                    landed={landed}
                    isTourRow={t === tourRow}
                    onEdit={() => onEdit(t)}
                    onDelete={(opts) => onDelete(t._id, opts)}
                  />
                );
              })}
            </AnimatePresence>
          </ul>
        </section>
      ))}
    </div>
  );
}
