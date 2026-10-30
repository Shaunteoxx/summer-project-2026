import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Receipt, Search } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AccountsCard from "@/components/AccountsCard";
import AddTransactionSheet from "@/components/AddTransactionSheet";
import EmptyState from "@/components/EmptyState";
import TransferSheet from "@/components/TransferSheet";
import { ruleFor } from "@/components/RepeatBadge";
import AccountFilterSheet from "@/components/AccountFilterSheet";
import LedgerFilters, { FILTERS } from "@/components/LedgerFilters";
import LedgerRow from "@/components/LedgerRow";
import TransferRow from "@/components/TransferRow";
import { ledgerView, rowKey } from "@/lib/ledger";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchTransactions,
  removeTransaction,
  fetchTransfers,
  removeTransfer,
} from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { cn, formatMoney } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useRecurring } from "@/hooks/useRecurring";
import { useTour } from "@/tour/TourProvider";
import { DUR, fadeUp } from "@/animations/variants";

const DELETE_GRACE_MS = 10000;

// Let the sheet finish leaving before the page moves under it, so the scroll
// to a new row reads as a second step rather than a lurch behind the sheet.
const AFTER_SHEET_MS = DUR.sheet * 1000 + 40;
// Longer than the row-land animation (0.3s delay + 2.2s). After it the tint is
// dropped, or leaving a filter and coming back would remount it and replay it.
const LANDED_MS = 2800;

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

export default function TransactionsPage() {
  const toast = useToast();
  const guard = useDemoGuard();
  const { getCategory } = useCategories();
  const { active: accounts, hasAccounts, getAccount } = useAccounts();
  const { rules } = useRecurring();
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Which kind of entry the sheet is adding: "income" | "expense" | null (closed).
  const [formType, setFormType] = useState(null);
  // The add button lives in the app shell, so it navigates here and asks for
  // the sheet rather than opening it itself — the sheet needs this page's
  // categories, accounts and optimistic-insert handlers.
  //
  // The request is consumed once and then wiped off the history entry. Router
  // state lives in history.state, which survives a reload — leave it there and
  // every refresh of /transactions re-opens the add sheet over the ledger, long
  // after the tap that asked for it.
  const { state: navState, pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    if (!navState?.openAdd) return;
    setFormType(navState.openAdd);
    navigate(pathname, { replace: true, state: null });
  }, [navState, pathname, navigate]);
  // The row the sheet is editing, or null. Mutually exclusive with formType —
  // the sheet is one sheet, and it is either adding or correcting.
  const [editing, setEditing] = useState(null);
  // A save that failed after the sheet closed: the draft and the reason, for
  // the sheet to reopen on. Cleared whenever the sheet closes.
  const [restore, setRestore] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  // "" is every account; an id narrows to one.
  const [accountFilter, setAccountFilter] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  // Pending deletes awaiting their 10s undo window: id -> timeout handle.
  const pendingDeletes = useRef(new Map());
  // The row that just arrived — added, edited or undeleted — so it can be
  // highlighted and scrolled to. `n` changes every time, so landing the same
  // row twice replays the highlight.
  const [landed, setLanded] = useState(null);
  const land = (key) => setLanded({ key, n: Date.now() });
  // The row deleted by swiping, if the last delete was one. Read by the exit
  // animation through AnimatePresence, since a removed row can't take props.
  const [swipedId, setSwipedId] = useState(null);
  // Bumped whenever the ledger changes in a way the Account Activity card
  // above sums over, so it re-fetches instead of showing the old totals.
  const [ledgerVersion, setLedgerVersion] = useState(0);
  const touchedLedger = () => setLedgerVersion((v) => v + 1);

  const now = new Date();
  const budgetPeriod = useBudgetPeriod();
  const current = budgetPeriod.current;

  // The ledger lists the active budget period. With no period running there's
  // no window to list, so it falls back to the calendar month.
  const load = useCallback(() => {
    const params = current
      ? { start: current.start, end: current.end }
      : { month: now.getMonth(), year: now.getFullYear() };
    Promise.all([
      fetchTransactions(params),
      // Only meaningful over a date range, and only once accounts exist.
      current && hasAccounts
        ? fetchTransfers({ start: current.start, end: current.end }).catch(() => [])
        : Promise.resolve([]),
    ])
      .then(([txns, moves]) => {
        setTransactions(txns);
        setTransfers(moves);
      })
      .catch(() => toast.error("Couldn't load transactions. Please try again."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, hasAccounts]);

  useEffect(() => {
    if (budgetPeriod.loading) return;
    load();
  }, [load, budgetPeriod.loading]);

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

  // Only show a new row here if it lands inside the window being listed.
  const handleAdded = (created) => {
    const createdYmd = String(created.date).slice(0, 10);
    const inView = current
      ? createdYmd >= current.start && createdYmd <= current.end
      : new Date(created.date).getUTCMonth() === now.getMonth() &&
        new Date(created.date).getUTCFullYear() === now.getFullYear();
    if (inView) {
      setTransactions((prev) => [created, ...prev]);
      land(rowKey(created));
    }
  };

  /**
   * The server has the entry the sheet already put here. Swap in its version
   * — real id, anything it normalised — and let the totals above catch up.
   */
  const handleSaved = ({ key, row }) => {
    setTransactions((prev) =>
      prev.map((t) => (rowKey(t) === key ? { ...row, clientKey: t.clientKey } : t))
    );
    touchedLedger();
  };

  /**
   * The server refused, after the sheet had closed on it. Take the new row
   * back out, or put the row as it was back in, and reopen the sheet on what
   * was typed so nothing has to be entered twice.
   */
  const handleSaveFailed = ({ key, original, retry }) => {
    setTransactions((prev) => {
      if (!original) return prev.filter((t) => rowKey(t) !== key);
      return prev.some((t) => t._id === original._id)
        ? prev.map((t) => (t._id === original._id ? original : t))
        : [original, ...prev];
    });
    if (!retry) return;
    setRestore(retry);
    if (original) setEditing(original);
    else setFormType(retry.type);
  };

  // Show where the entry went. A backdated one lands among older days, maybe
  // well below the fold, and the highlight is no use on a row you can't see.
  // "nearest" leaves the page alone when it's already on screen.
  useEffect(() => {
    if (!landed) return;
    const scroll = setTimeout(() => {
      document
        .querySelector(`[data-entry-key="${landed.key}"]`)
        // Optional: jsdom doesn't implement it.
        ?.scrollIntoView?.({ block: "nearest" });
    }, AFTER_SHEET_MS);
    const done = setTimeout(() => setLanded(null), LANDED_MS);
    return () => {
      clearTimeout(scroll);
      clearTimeout(done);
    };
  }, [landed]);

  /**
   * An edit can move a row out of the window being listed — re-dating a lunch
   * into last month, say. Replacing it in place would leave it on screen under
   * a period it no longer belongs to, so it drops out of the list instead.
   */
  const handleUpdated = (updated) => {
    const ymd = String(updated.date).slice(0, 10);
    const inView = current
      ? ymd >= current.start && ymd <= current.end
      : new Date(updated.date).getUTCMonth() === now.getMonth() &&
        new Date(updated.date).getUTCFullYear() === now.getFullYear();
    setTransactions((prev) =>
      inView
        ? prev.map((t) =>
            t._id === updated._id ? { ...updated, clientKey: t.clientKey } : t
          )
        : prev.filter((t) => t._id !== updated._id)
    );
    if (inView) land(rowKey(updated));
  };

  const { visibleTransactions, visible, days } = ledgerView({
    transactions,
    transfers,
    filter,
    accountFilter,
    query,
    getAccount,
  });

  // Transfers count as entries too: with only transfers logged the ledger still
  // has something to show, and the filters are still worth offering.
  const hasEntries = transactions.length > 0 || transfers.length > 0;
  const selectedAccount = accountFilter ? getAccount(accountFilter) : null;

  // The row the page tour points at: the first you could open right now. A
  // pending one can't be edited until the server has it.
  const tourRow = visible.find((e) => e.kind === "txn" && !e.row.pending)?.row ?? null;
  useTour("transactions", !loading && hasEntries);
  useTour("tip.repeating", !loading && visibleTransactions.some((t) => t.recurringId));
  useTour("tip.accounts", !loading && hasEntries && hasAccounts && accounts.length > 1);


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

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-title-lg">Transactions</h1>
        {/* The tail says what's in the window, not what the window is: the
            count once there's something to count, "no entries yet" before
            that. The window itself stays either way — an empty ledger means
            nothing logged *in this period*, and in days mode that could be a
            fortnight, so dropping the dates would make the emptiness read as
            bigger than it is. */}
        <p className="mt-1 text-[13px] text-ink-3">
          {current
            ? `${formatPeriodLabel(current, { mode: budgetPeriod.mode })} · this ${budgetPeriod.noun}`
            : "No Budget Period Running"}
          {loading
            ? ""
            : hasEntries
              ? ` · ${visible.length} ${visible.length === 1 ? "entry" : "entries"}`
              : " · no entries yet"}
        </p>
      </motion.div>

      {/* Account activity — above the search and filter row on purpose. It
          summarises the whole period, so it belongs above the controls that
          narrow it, keeping the filters adjacent to the rows they filter. */}
      <div className="mt-[15px]" data-tour="tx.accounts">
        <AccountsCard
          onTransfer={accounts.length > 1 ? () => setTransferOpen(true) : null}
          refreshKey={ledgerVersion}
        />
      </div>

      {/* No Income/Expense buttons here any more. The sheet carries its own
          Expense/Income toggle, so the choice happens where the form is rather
          than before you've seen it — and the + in the dock is a persistent
          target that doesn't scroll away. Moving money between accounts lives
          in the Account activity card above, next to the accounts it moves
          between. */}

      <AddTransactionSheet
        type={formType}
        editing={editing}
        restore={restore}
        onClose={() => {
          setFormType(null);
          setEditing(null);
          setRestore(null);
        }}
        onAdded={handleAdded}
        onUpdated={handleUpdated}
        onSaved={handleSaved}
        onFailed={handleSaveFailed}
      />

      <TransferSheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        // The new transfer belongs in the ledger and in the card's columns
        // straight away, not after the next visit.
        onTransferred={() => {
          load();
          touchedLedger();
        }}
      />

      {!loading && hasEntries && (
        <LedgerFilters
          query={query}
          onQuery={setQuery}
          showAccounts={hasAccounts && accounts.length > 1}
          selectedAccount={selectedAccount}
          onPickAccount={() => setAccountPickerOpen(true)}
          filter={filter}
          onFilter={setFilter}
        />
      )}

      {/* Every account listed at once, however many there are. */}
      <AccountFilterSheet
        open={accountPickerOpen}
        onClose={() => setAccountPickerOpen(false)}
        accounts={accounts}
        selectedId={accountFilter}
        onSelect={(id) => {
          setAccountFilter(id);
          setAccountPickerOpen(false);
        }}
      />


      {/* List */}
      <div className="mt-4">
        {loading ? (
          <div className="space-y-2.5">
            {[0, 1, 2, 3].map((i) => (
              <Card key={i}>
                <CardContent className="flex items-center gap-3 p-3.5">
                  <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16 shrink-0" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : !hasEntries ? (
          // The same shape Home uses for the same situation, rather than a
          // card: a border drawn around an absence gives the emptiest thing on
          // the page the most weight. It also says what to do and offers the
          // button to do it — the old copy pointed "above" at controls that
          // are hidden while the ledger is empty.
          <EmptyState
            icon={Receipt}
            title="Nothing Logged Yet"
            body="Your first entry takes about four taps. Amount, category, done."
            action={
              <Button
                className="mt-[22px] w-auto px-5"
                onClick={() => setFormType("expense")}
              >
                <Plus className="h-[17px] w-[17px]" />
                Add Your First Entry
              </Button>
            }
          />
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-md bg-surface-2 text-ink-3">
                <Search className="h-6 w-6" />
              </span>
              <p className="text-[13px] leading-relaxed text-ink-3">
                {query ? (
                  <>No transactions match “{query.trim()}”.</>
                ) : (
                  <>
                    No{" "}
                    {FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}{" "}
                    this {budgetPeriod.noun}.
                  </>
                )}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                Clear Filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          /* Grouped by day, with the day's net beside its date. Rows sit on
             hairlines inside one surface per day rather than each being its own
             card — a card per entry gave every $4 coffee the same weight as the
             day it belongs to, and the repetition is what made the list read as
             noisy rather than as a register. */
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
                            onDelete={() => handleDeleteTransfer(m._id)}
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
                          onEdit={() => setEditing(t)}
                          onDelete={(opts) => handleDelete(t._id, opts)}
                        />
                      );
                    })}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
