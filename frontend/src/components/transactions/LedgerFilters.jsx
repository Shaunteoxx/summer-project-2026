import { ChevronDown, Search, Wallet, X } from "lucide-react";

import SegmentPill from "@/components/SegmentPill";
import { Input } from "@/components/ui/input";

export const FILTERS = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
];

/**
 * The ledger's search, account filter button and type filter. The page owns
 * the values and the account sheet; `showAccounts` is whether there are two or
 * more accounts to choose between.
 */
export default function LedgerFilters({
  query,
  onQuery,
  showAccounts,
  selectedAccount,
  onPickAccount,
  filter,
  onFilter,
}) {
  return (
    <>
      {/* Search, with the account filter beside it. Type and account are not
          the same kind of choice — type is three fixed options you flick
          between, accounts are however many you have and get picked rarely —
          so type keeps the always-visible segmented control below, and accounts
          collapse into one button. Nothing scrolls, and it reads the same with
          two accounts or eight. */}
      <div className="mt-6 flex items-center gap-2">
        <div className="relative min-w-0 flex-1" data-tour="tx.search">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
          <Input
            type="search"
            inputMode="search"
            aria-label="Search transactions"
            placeholder="Search description or category"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            // WebKit draws its own clear button inside a search field, which
            // lands right under the one below — two crosses, a few pixels
            // apart, as soon as there's anything to clear. The custom one
            // stays because it's the one that matches the rest of the app
            // and is a real 28px target; the browser's is turned off here.
            // Only here: the friends search has no button of its own, so its
            // native cross is the only way to clear it.
            className="px-9 [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => onQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {showAccounts && (
          <button
            type="button"
            onClick={onPickAccount}
            data-tour="tx.account-filter"
            aria-label={
              selectedAccount
                ? `Filtering by ${selectedAccount.name}. Change account`
                : "Filter by Account"
            }
            className={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              selectedAccount
                ? "border-ink/40 bg-ink/[0.06] text-ink"
                : "border-hairline-strong text-ink-2 hover:bg-surface-2 active:bg-surface-3"
            }`}
          >
            {selectedAccount ? (
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: selectedAccount.color }}
              />
            ) : (
              <Wallet className="h-4 w-4 shrink-0" />
            )}
            <span className="max-w-[6.5rem] truncate">
              {selectedAccount ? selectedAccount.name : "Account"}
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
          </button>
        )}
      </div>

      {/* Type filter — three fixed options, so all of them stay on screen. */}
      <div
        role="group"
        aria-label="Filter by type"
        data-tour="tx.types"
        className="relative mt-3 flex gap-0.5 rounded-md bg-surface-2 p-[3px]"
      >
        <SegmentPill
          index={FILTERS.findIndex((f) => f.value === filter)}
          count={FILTERS.length}
        />
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => onFilter(f.value)}
            className={`relative flex-1 rounded-[9px] px-3 py-1.5 text-[13px] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              filter === f.value
                ? "text-foreground"
                : "font-medium text-ink-3 hover:text-ink-2 active:opacity-60"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
    </>
  );
}
