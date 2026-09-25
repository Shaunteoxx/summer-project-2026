import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Trash2,
  X,
  Receipt,
  Search,
  ArrowLeftRight,
  ArrowRight,
  Wallet,
  ChevronDown,
  Check,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AccountsCard from "@/components/AccountsCard";
import AddTransactionSheet from "@/components/AddTransactionSheet";
import BottomSheet from "@/components/BottomSheet";
import EmptyState from "@/components/EmptyState";
import TransferSheet from "@/components/TransferSheet";
import AnimatedNumber from "@/components/AnimatedNumber";
import CategoryIcon from "@/components/CategoryIcon";
import RepeatBadge, { ruleFor } from "@/components/RepeatBadge";
import SegmentPill from "@/components/SegmentPill";
import SwipeToDelete from "@/components/SwipeToDelete";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchTransactions,
  removeTransaction,
  fetchTransfers,
  removeTransfer,
} from "@/api/endpoints";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { cn, countedAmount, formatMoney, localToday } from "@/lib/utils";
import { addDaysYmd, formatDay, formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useRecurring } from "@/hooks/useRecurring";
import { useTour } from "@/tour/TourProvider";
import { DUR, EASE, fadeUp } from "@/animations/variants";

const DELETE_GRACE_MS = 10000;

// How a deleted row leaves. The trash button slides it right and fades it,
// which is what says the delete can still be undone. A swipe has already
// carried the row off to the left, so what's left is the red strip, and that
// folds shut instead — the rows below close the gap rather than jumping it.
const BUTTON_EXIT = { opacity: 0, x: 24, transition: { duration: 0.25 } };
const SWIPE_EXIT = { height: 0, opacity: 0, transition: { duration: 0.22, ease: EASE } };

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

/**
 * A row's React key and DOM handle. An entry added here keeps the provisional
 * key it was drawn with even after the server gives it a real id, so the row
 * doesn't remount — and replay or lose its highlight — the moment it's saved.
 */
const rowKey = (t) => t.clientKey ?? t._id;

const FILTERS = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
];

export default function TransactionsPage() {
  const toast = useToast();
  const guard = useDemoGuard();
  const { user } = useAuth();
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

  const totals = transactions.reduce(
    (acc, t) => {
      if (t.type === "income") acc.income += t.amount;
      else acc.expenses += countedAmount(t);
      return acc;
    },
    { income: 0, expenses: 0 }
  );
  // In days mode the target lives on the period; in month mode it's still the
  // savingsByMonth entry for the calendar month the period covers.
  const savingsTarget = current
    ? budgetPeriod.mode === "days"
      ? current.savings
      : Math.max(
          0,
          Number(user?.savingsByMonth?.[`${now.getFullYear()}-${now.getMonth()}`]) || 0
        )
    : 0;
  const balance = totals.income - totals.expenses - savingsTarget;

  // Transfers share the ledger with transactions so a move between your own
  // accounts leaves a record, but they are not income or spending — they only
  // appear under "All", never under the Expenses or Income filters.
  const q = query.trim().toLowerCase();
  const visibleTransactions = transactions.filter((t) => {
    if (filter !== "all" && t.type !== filter) return false;
    if (accountFilter && String(t.accountId ?? "") !== accountFilter) return false;
    if (
      q &&
      !t.description.toLowerCase().includes(q) &&
      !t.category.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
  const visibleTransfers = transfers.filter((m) => {
    if (filter !== "all") return false;
    // Either side of the move counts as belonging to that account.
    if (
      accountFilter &&
      String(m.from) !== accountFilter &&
      String(m.to) !== accountFilter
    )
      return false;
    if (q) {
      const names = `${getAccount(String(m.from))?.name ?? ""} ${
        getAccount(String(m.to))?.name ?? ""
      } transfer`.toLowerCase();
      if (!names.includes(q)) return false;
    }
    return true;
  });

  // Transfers count as entries too: with only transfers logged the ledger still
  // has something to show, and the filters are still worth offering.
  const hasEntries = transactions.length > 0 || transfers.length > 0;
  const selectedAccount = accountFilter ? getAccount(accountFilter) : null;

  // Newest first, the same order the API returns each list in.
  const visible = [
    ...visibleTransactions.map((t) => ({ kind: "txn", date: t.date, row: t })),
    ...visibleTransfers.map((m) => ({ kind: "transfer", date: m.date, row: m })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  /**
   * Entries grouped into days, newest day first.
   *
   * Dates are stored at UTC midnight, so the ISO prefix is the day key — the
   * same key the streak and the tracker calendar use, which is what keeps a day
   * here and a day there meaning the same thing.
   *
   * The day's figure is its net: income minus expenses. Transfers are left out
   * of it deliberately — moving $400 between your own accounts isn't a $400 day,
   * and a header that said so would contradict the row right beneath it. A day
   * with nothing but transfers shows an em-dash instead of a misleading $0.00.
   */
  const days = (() => {
    const map = new Map();
    for (const entry of visible) {
      const key = String(entry.date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    const todayKey = localToday();
    const yesterdayKey = addDaysYmd(todayKey, -1);
    return [...map.entries()].map(([key, entries]) => {
      const counted = entries.filter((e) => e.kind === "txn");
      const net = counted.reduce(
        (sum, e) => sum + (e.row.type === "income" ? e.row.amount : -countedAmount(e.row)),
        0
      );
      const date = formatDay(key);
      return {
        key,
        entries,
        net,
        counted: counted.length > 0,
        label:
          key === todayKey
            ? `Today · ${date}`
            : key === yesterdayKey
              ? `Yesterday · ${date}`
              : date,
      };
    });
  })();

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
          than before you've seen it — and the FAB in the app shell is a
          persistent 54px target that doesn't scroll away. Moving money between
          accounts lives in the Account activity card above, next to the
          accounts it moves between. */}

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

      {/* Search, with the account filter beside it. Type and account are not
          the same kind of choice — type is three fixed options you flick
          between, accounts are however many you have and get picked rarely —
          so type keeps the always-visible segmented control below, and accounts
          collapse into one button. Nothing scrolls, and it reads the same with
          two accounts or eight. */}
      {!loading && hasEntries && (
        <div className="mt-6 flex items-center gap-2">
          <div className="relative min-w-0 flex-1" data-tour="tx.search">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3" />
            <Input
              type="search"
              inputMode="search"
              aria-label="Search transactions"
              placeholder="Search description or category"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {hasAccounts && accounts.length > 1 && (
            <button
              type="button"
              onClick={() => setAccountPickerOpen(true)}
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
      )}

      {/* Type filter — three fixed options, so all of them stay on screen. */}
      {!loading && hasEntries && (
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
              onClick={() => setFilter(f.value)}
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
                      const cat = getCategory(t.category);
                      const account = getAccount(t.accountId);
                      const isIncome = t.type === "income";
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
                          key={rowKey(t)}
                          data-entry-key={rowKey(t)}
                          data-tour={t === tourRow ? "tx.row" : undefined}
                          custom={swipedId}
                          variants={{
                            exit: (swiped) => (swiped === t._id ? SWIPE_EXIT : BUTTON_EXIT),
                          }}
                          exit="exit"
                          // Margins clear the sticky header above and the tab
                          // bar plus add button below when this is scrolled to.
                          className="relative overflow-hidden scroll-mt-[72px] scroll-mb-[calc(148px+env(safe-area-inset-bottom))]"
                        >
                          <SwipeToDelete
                            onDelete={() => handleDelete(t._id, { swiped: true })}
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
                              onClick={() => setEditing(t)}
                              disabled={t.pending}
                              aria-label={`Edit ${t.description}`}
                              className="-my-1 flex min-w-0 flex-1 items-center gap-3 rounded-sm py-1 text-left transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <CategoryIcon category={cat} />
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
                                  {t.paidBack > 0 && (
                                    <>
                                      {" "}· {formatMoney(t.paidBack)} of {formatMoney(t.amount)} paid
                                      back
                                    </>
                                  )}
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
                              <span
                                className={cn(
                                  "num shrink-0 text-[15px] font-medium",
                                  isIncome ? "text-positive" : "text-ink"
                                )}
                              >
                                {isIncome ? "+" : "−"}
                                {formatMoney(countedAmount(t))}
                              </span>
                            </button>
                            <button
                              onClick={() => handleDelete(t._id)}
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

/** A move between the user's own accounts, recorded but never budgeted. */
function TransferRow({ transfer, from, to, onDelete }) {
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

/**
 * Picks which account the ledger is filtered to.
 *
 * A sheet rather than a row of chips: chips only fit two or three accounts
 * before they start scrolling, and a filter you have to go looking for is worse
 * than no filter. Here every account is listed at once whether you have two or
 * eight, and the row above stays one button wide.
 */
function AccountFilterSheet({ open, onClose, accounts, selectedId, onSelect }) {
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
