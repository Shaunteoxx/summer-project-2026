import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Minus, Trash2, ArrowUpCircle, ArrowDownCircle } from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import BottomSheet from "@/components/BottomSheet";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fetchTransactions,
  addTransaction,
  removeTransaction,
} from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { monthName, formatMoney } from "@/lib/utils";
import { staggerContainer, slideInItem, fadeUp } from "@/animations/variants";

const DELETE_GRACE_MS = 10000;
const todayISO = () => new Date().toISOString().slice(0, 10);
const emptyForm = () => ({
  description: "",
  amount: "",
  date: todayISO(),
});

const FILTERS = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
];

export default function TransactionsPage() {
  const toast = useToast();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  // Which kind of entry the sheet is adding: "income" | "expense" | null (closed).
  const [formType, setFormType] = useState(null);
  const [filter, setFilter] = useState("all");

  // Pending deletes awaiting their 10s undo window: id -> timeout handle.
  const pendingDeletes = useRef(new Map());

  const now = new Date();

  const load = () => {
    fetchTransactions()
      .then(setTransactions)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

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

  const totals = transactions.reduce(
    (acc, t) => {
      if (t.category === "income") acc.income += t.amount;
      else acc.expenses += t.amount;
      return acc;
    },
    { income: 0, expenses: 0 }
  );
  const balance = totals.income - totals.expenses;

  const visible =
    filter === "all"
      ? transactions
      : transactions.filter((t) => t.category === filter);

  const openForm = (type) => {
    setForm(emptyForm());
    setFormType(type);
  };

  const closeForm = () => {
    setFormType(null);
    setForm(emptyForm());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.description || !form.amount) return;
    const category = formType;
    setSubmitting(true);
    try {
      const amount = Number(form.amount);
      const created = await addTransaction({ ...form, category, amount });
      const created_d = new Date(created.date);
      if (
        created_d.getMonth() === now.getMonth() &&
        created_d.getFullYear() === now.getFullYear()
      ) {
        setTransactions((prev) => [created, ...prev]);
      }
      closeForm();
      const sign = category === "income" ? "+" : "−";
      toast.success(`Added ${sign}${formatMoney(amount)} ${category}`);
    } catch {
      toast.error("Couldn't add transaction. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // Optimistically remove, then commit the server delete after a 10s undo window.
  const handleDelete = (id) => {
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
          {monthName(now.getMonth())} {now.getFullYear()}
        </p>
      </motion.div>

      {/* Balance summary */}
      <motion.div variants={fadeUp} initial="initial" animate="animate" className="mt-5">
        <Card className="border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card">
          <CardContent className="p-5">
            <p className="text-sm font-medium text-muted-foreground">
              Remaining balance
            </p>
            <p className="mt-1 text-3xl font-extrabold tracking-tight">
              <AnimatedNumber value={balance} prefix="$" decimals={2} />
            </p>
            <div className="mt-3 flex gap-5 text-sm">
              <span className="text-success">
                +<AnimatedNumber value={totals.income} prefix="$" decimals={2} />
                <span className="ml-1 text-muted-foreground">in</span>
              </span>
              <span className="text-destructive">
                −<AnimatedNumber value={totals.expenses} prefix="$" decimals={2} />
                <span className="ml-1 text-muted-foreground">out</span>
              </span>
            </div>
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
        <Button variant="success" onClick={() => openForm("income")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Income
        </Button>
        <Button variant="destructive" onClick={() => openForm("expense")} className="gap-1.5">
          <Minus className="h-4 w-4" /> Expense
        </Button>
      </motion.div>

      {/* Add entry bottom sheet — type is fixed by which button opened it */}
      <BottomSheet
        open={formType !== null}
        onClose={closeForm}
        title={formType === "income" ? "Add income" : "Add expense"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              placeholder={formType === "income" ? "e.g. Salary" : "e.g. Groceries"}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Amount</Label>
              <Input
                id="amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
          </div>
          <Button
            type="submit"
            variant={formType === "income" ? "success" : "destructive"}
            className="w-full"
            disabled={submitting}
          >
            {submitting
              ? "Adding…"
              : formType === "income"
                ? "Add income"
                : "Add expense"}
          </Button>
        </form>
      </BottomSheet>

      {/* Filter pills */}
      {!loading && transactions.length > 0 && (
        <div className="mt-6 flex gap-1 rounded-full bg-muted p-1">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`relative flex-1 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
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

      {/* List */}
      <div className="mt-3">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
          </div>
        ) : transactions.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              Nothing logged yet this month. Add income or an expense above.
            </CardContent>
          </Card>
        ) : visible.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center text-sm text-muted-foreground">
              No {FILTERS.find((f) => f.value === filter)?.label.toLowerCase()}{" "}
              this month.
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
              {visible.map((t) => (
                <motion.div
                  key={t._id}
                  variants={slideInItem}
                  layout
                  exit={{ opacity: 0, x: 24, transition: { duration: 0.25 } }}
                >
                  <Card>
                    <CardContent className="flex items-center justify-between gap-3 p-3.5">
                      <div className="flex min-w-0 items-center gap-3">
                        {t.category === "income" ? (
                          <ArrowUpCircle className="h-9 w-9 shrink-0 text-success" />
                        ) : (
                          <ArrowDownCircle className="h-9 w-9 shrink-0 text-destructive" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{t.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(t.date).toLocaleDateString(undefined, {
                              month: "short",
                              day: "numeric",
                            })}{" "}
                            · {t.category}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <span
                          className={`font-bold tabular-nums ${
                            t.category === "income" ? "text-success" : "text-destructive"
                          }`}
                        >
                          {t.category === "income" ? "+" : "−"}$
                          {t.amount.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <button
                          onClick={() => handleDelete(t._id)}
                          aria-label={`Delete ${t.description}`}
                          className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </PageWrapper>
  );
}
