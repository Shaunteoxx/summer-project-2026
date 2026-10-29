import { Check, Wallet } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";

/**
 * Picks which account the ledger is filtered to.
 *
 * A sheet rather than a row of chips: chips only fit two or three accounts
 * before they start scrolling, and a filter you have to go looking for is worse
 * than no filter. Here every account is listed at once whether you have two or
 * eight, and the row above stays one button wide.
 */
export default function AccountFilterSheet({ open, onClose, accounts, selectedId, onSelect }) {
  const options = [{ id: "", name: "All Accounts" }, ...accounts];

  return (
    <BottomSheet open={open} onClose={onClose} title="Filter by Account">
      <ul className="space-y-1.5">
        {options.map((a) => {
          const selected = selectedId === a.id;
          return (
            <li key={a.id || "all"}>
              <button
                type="button"
                onClick={() => onSelect(a.id)}
                aria-pressed={selected}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  selected
                    ? "border-ink/40 bg-ink/[0.06] text-ink"
                    : "border-hairline-strong hover:bg-surface-2 active:bg-surface-3"
                }`}
              >
                {a.color ? (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: a.color }}
                  />
                ) : (
                  <Wallet className="h-4 w-4 shrink-0 text-ink-3" />
                )}
                <span className="min-w-0 flex-1 truncate">{a.name}</span>
                {selected && <Check className="h-4 w-4 shrink-0" />}
              </button>
            </li>
          );
        })}
      </ul>
    </BottomSheet>
  );
}
