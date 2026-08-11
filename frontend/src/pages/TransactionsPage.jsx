import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Minus,
  Trash2,
  X,
  Receipt,
  Search,
  ArrowLeftRight,
  ArrowRight,
  Wallet,
  ChevronDown,
  Check,
  Repeat,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AddTransactionSheet from "@/components/AddTransactionSheet";
import BottomSheet from "@/components/BottomSheet";
import TransferSheet from "@/components/TransferSheet";
import AnimatedNumber from "@/components/AnimatedNumber";
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
import { formatMoney } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { staggerContainer, slideInItem, fadeUp } from "@/animations/variants";

const DELETE_GRACE_MS = 10000;

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
  const [transactions, setTransactions] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Which kind of entry the sheet is adding: "income" | "expense" | null (closed).
  const [formType, setFormType] = useState(null);
  // The row the sheet is editing, or null. Mutually exclusive with formType —
  // the sheet is one sheet, and it is either adding or correcting.
  const [editing, setEditing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  // "" is every account; an id narrows to one.
  const [accountFilter, setAccountFilter] = useState("");
  const [transferOpen, setTransferOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);

  // Pending deletes awaiting their 10s undo window: id -> timeout handle.
  const pendingDeletes = useRef(new Map());

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
      .catch(() => toast.error("Couldn't load transactions. Pull to refresh or try again."))
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
    if (inView) setTransactions((prev) => [created, ...prev]);
  };

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
        ? prev.map((t) => (t._id === updated._id ? updated : t))
        : prev.filter((t) => t._id !== updated._id)
    );
  };

  const totals = transactions.reduce(
    (acc, t) => {
      if (t.type === "income") acc.income += t.amount;
      else acc.expenses += t.amount;
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
        toast.error("Couldn't remove that transfer.");
      });
  };

  // Optimistically remove, then commit the server delete after a 10s undo window.
  const handleDelete = (id) => {
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

    setTransactions((prev) => prev.filter((t) => t._id !== id));

    const timer = setTimeout(() => {
      pendingDeletes.current.delete(id);
      removeTransaction(id).catch(() => {
        restore();
        toast.error("Couldn't delete transaction.");
      });
    }, DELETE_GRACE_MS);
    pendingDeletes.current.set(id, timer);

    toast.show({
      message: "Transaction deleted",
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
        },
      },
    });
  };

  return (
    <PageWrapper>
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <h1 className="text-2xl font-extrabold tracking-tight">Transactions</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {current
            ? formatPeriodLabel(current, { mode: budgetPeriod.mode })
            : "No budget period running"}
        </p>
      </motion.div>

      {/* Balance summary */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-5">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Remaining balance
            </p>
            {loading ? (
              <>
                <Skeleton className="mt-2 h-9 w-40" />
                <Skeleton className="mt-3.5 h-5 w-48" />
              </>
            ) : (
              <>
                <p className="mt-1 text-3xl font-extrabold tracking-tight">
                  <AnimatedNumber value={balance} prefix="$" decimals={2} />
                </p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <span className="text-success">
                    +<AnimatedNumber value={totals.income} prefix="$" decimals={2} />
                    <span className="ml-1 text-muted-foreground">in</span>
                  </span>
                  <span className="text-destructive">
                    −<AnimatedNumber value={totals.expenses} prefix="$" decimals={2} />
                    <span className="ml-1 text-muted-foreground">out</span>
                  </span>
                  <span className="text-primary">
                    −<AnimatedNumber value={savingsTarget} prefix="$" decimals={2} />
                    <span className="ml-1 text-muted-foreground">saved</span>
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Add income / expense triggers */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-4 grid grid-cols-2 gap-3"
      >
        <Button variant="success" onClick={() => setFormType("income")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Income
        </Button>
        <Button variant="destructive" onClick={() => setFormType("expense")} className="gap-1.5">
          <Minus className="h-4 w-4" /> Expense
        </Button>
      </motion.div>

      {/* Moving money between your own accounts only makes sense with two. */}
      {accounts.length > 1 && (
        <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-2">
          <Button
            variant="outline"
            onClick={() => setTransferOpen(true)}
            className="w-full gap-1.5"
          >
            <ArrowLeftRight className="h-4 w-4" /> Move money between accounts
          </Button>
        </motion.div>
      )}

      <AddTransactionSheet
        type={formType}
        editing={editing}
        onClose={() => {
          setFormType(null);
          setEditing(null);
        }}
        onAdded={handleAdded}
        onUpdated={handleUpdated}
      />

      <TransferSheet
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
      />

      {/* Search, with the account filter beside it. Type and account are not
          the same kind of choice — type is three fixed options you flick
          between, accounts are however many you have and get picked rarely —
          so type keeps the always-visible segmented control below, and accounts
          collapse into one button. Nothing scrolls, and it reads the same with
          two accounts or eight. */}
      {!loading && hasEntries && (
        <div className="mt-6 flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              inputMode="search"
              aria-label="Search transactions"
              placeholder="Search description or category"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="px-9"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {hasAccounts && accounts.length > 1 && (
            <button
              type="button"
              onClick={() => setAccountPickerOpen(true)}
              aria-label={
                selectedAccount
                  ? `Filtering by ${selectedAccount.name}. Change account`
                  : "Filter by account"
              }
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selectedAccount
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-input text-muted-foreground hover:bg-accent/50"
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
          className="mt-3 flex gap-1 rounded-full bg-muted p-1"
        >
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`relative flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                filter === f.value
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {filter === f.value && (
                <motion.span
                  layoutId="tx-filter-pill"
                  className="absolute inset-0 rounded-full bg-card shadow-sm"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{f.label}</span>
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
      <div className="mt-3">
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
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Receipt className="h-6 w-6" />
              </span>
              <p className="text-sm text-muted-foreground">
                Nothing logged yet this {budgetPeriod.noun}.
                <br />
                Add income or an expense above.
              </p>
            </CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
                <Search className="h-6 w-6" />
              </span>
              <p className="text-sm text-muted-foreground">
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
                Clear filters
              </Button>
            </CardContent>
          </Card>
        ) : (
          <motion.div
            variants={staggerContainer(0.06, 0.05)}
            initial="initial"
            animate="animate"
            className="space-y-2.5"
          >
            <AnimatePresence initial={false}>
              {visible.map((entry) => {
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
                const Icon = cat.icon;
                const isIncome = t.type === "income";
                return (
                  <motion.div
                    key={t._id}
                    variants={slideInItem}
                    layout
                    exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}
                  >
                    <Card>
                      <CardContent className="flex items-center justify-between gap-1 p-3.5">
                        {/* The row itself opens the edit sheet. Everything but
                            the delete button is one target, so a mistyped
                            amount is a tap on the amount to fix — delete stays
                            a separate, deliberate button beside it rather than
                            nested inside a tappable card. */}
                        <button
                          type="button"
                          onClick={() => setEditing(t)}
                          aria-label={`Edit ${t.description}`}
                          className="-m-1 flex min-w-0 flex-1 items-center justify-between gap-3 rounded-lg p-1 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span
                              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                              style={{
                                backgroundColor: `${cat.color}22`,
                                color: cat.color,
                              }}
                            >
                              <Icon className="h-[18px] w-[18px]" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">
                                {t.description}
                              </span>
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                {/* Rows written by a repeating entry say so.
                                    Nobody typed them, so without this they
                                    read as entries you don't remember making. */}
                                {t.recurringId && (
                                  <Repeat
                                    className="h-3 w-3 shrink-0"
                                    aria-label="Repeating entry"
                                  />
                                )}
                                <span className="truncate">
                                  {new Date(t.date).toLocaleDateString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    timeZone: "UTC",
                                  })}{" "}
                                  · {t.category}
                                  {getAccount(t.accountId) && (
                                    <> · {getAccount(t.accountId).name}</>
                                  )}
                                </span>
                              </span>
                            </span>
                          </span>
                          <span
                            className={`shrink-0 font-bold tabular-nums ${
                              isIncome ? "text-success" : "text-destructive"
                            }`}
                          >
                            {isIncome ? "+" : "−"}$
                            {t.amount.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </button>
                        <button
                          onClick={() => handleDelete(t._id)}
                          aria-label={`Delete ${t.description}`}
                          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </CardContent>
                    </Card>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </PageWrapper>
  );
}

/**
 * A move between the user's own accounts.
 *
 * Rendered without a +/− sign and in a neutral colour on purpose: a transfer is
 * neither income nor spending, and signing it either way would suggest it moved
 * the budget, which it never does. It is here so the move leaves a record.
 */
function TransferRow({ transfer, from, to, onDelete }) {
  return (
    <motion.div
      variants={slideInItem}
      layout
      exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}
    >
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-between gap-3 p-3.5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ArrowLeftRight className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="flex min-w-0 items-center gap-1.5 truncate font-semibold">
                {from?.name ?? "Removed account"}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                {to?.name ?? "Removed account"}
              </p>
              <p className="text-xs text-muted-foreground">
                {new Date(transfer.date).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}{" "}
                · Transfer
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <span className="font-bold tabular-nums text-muted-foreground">
              {formatMoney(transfer.amount)}
            </span>
            <button
              type="button"
              onClick={onDelete}
              aria-label={`Delete transfer of ${formatMoney(transfer.amount)}`}
              className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
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
  const options = [{ id: "", name: "All accounts" }, ...accounts];

  return (
    <BottomSheet open={open} onClose={onClose} title="Filter by account">
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
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border hover:bg-accent/50"
                }`}
              >
                {a.color ? (
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: a.color }}
                  />
                ) : (
                  <Wallet className="h-4 w-4 shrink-0 text-muted-foreground" />
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
