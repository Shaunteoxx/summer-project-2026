import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import {
  Plus,
  Minus,
  Trash2,
  Check,
  X,
  Receipt,
  Search,
  Calculator,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import AnimatedNumber from "@/components/AnimatedNumber";
import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  fetchTransactions,
  addTransaction,
  removeTransaction,
} from "@/api/endpoints";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { cn, formatMoney, localToday } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { CUSTOM_COLOR_OPTIONS } from "@/lib/categories";
import { useCategories } from "@/hooks/useCategories";
import { staggerContainer, slideInItem, fadeUp, SHAKE } from "@/animations/variants";

const DELETE_GRACE_MS = 10000;
const todayISO = localToday;
const emptyForm = () => ({
  description: "",
  amount: "",
  category: "",
  date: todayISO(),
});

const FILTERS = [
  { value: "all", label: "All" },
  { value: "expense", label: "Expenses" },
  { value: "income", label: "Income" },
];

export default function TransactionsPage() {
  const toast = useToast();
  const guard = useDemoGuard();
  const { user } = useAuth();
  // On phones the keypad replaces the OS keyboard entirely, so it can't be
  // missed. On desktop the field stays a plain typeable input.
  const touchFirst = useCoarsePointer();
  const { categoriesByType, getCategory, addCategory, removeCategory, custom } =
    useCategories();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  // Per-field validation messages, keyed by field name (description/category/amount/date).
  const [errors, setErrors] = useState({});
  // Server-side / general failure not tied to one field.
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Imperative shake controls so an invalid field re-shakes on every submit attempt.
  const shakeControls = {
    description: useAnimationControls(),
    category: useAnimationControls(),
    amount: useAnimationControls(),
    date: useAnimationControls(),
  };
  // Which kind of entry the sheet is adding: "income" | "expense" | null (closed).
  const [formType, setFormType] = useState(null);
  // When true the sheet shows the amount keypad instead of the form. The sheet
  // has no scroll container, so the keypad replaces the form rather than
  // stacking below it and pushing the submit button off screen.
  const [calcOpen, setCalcOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");

  // Inline "create custom category" panel state.
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CUSTOM_COLOR_OPTIONS[0]);
  const [savingCategory, setSavingCategory] = useState(false);

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
    fetchTransactions(params)
      .then(setTransactions)
      .catch(() => toast.error("Couldn't load transactions. Pull to refresh or try again."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

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

  // Filter by type (pills) and a free-text query matching description or category.
  const q = query.trim().toLowerCase();
  const visible = transactions.filter((t) => {
    if (filter !== "all" && t.type !== filter) return false;
    if (
      q &&
      !t.description.toLowerCase().includes(q) &&
      !t.category.toLowerCase().includes(q)
    )
      return false;
    return true;
  });

  // Closing the keypad unmounts it, which would drop focus to <body>. Put it
  // back on the amount control so keyboard and screen-reader users keep their
  // place in the form.
  const closeCalculator = () => {
    setCalcOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("amount")?.focus({ preventScroll: true });
    });
  };

  // On touch the keypad is the only source of this value, so it's always a
  // clean number or empty — safe to render at a fixed 2dp.
  const amountNumber = Number(form.amount);
  const amountDisplay =
    form.amount !== "" && Number.isFinite(amountNumber)
      ? amountNumber.toFixed(2)
      : "";

  const resetNewCategory = () => {
    setShowNewCategory(false);
    setNewCategoryName("");
    setNewCategoryColor(CUSTOM_COLOR_OPTIONS[0]);
  };

  const openForm = (type) => {
    setForm(emptyForm());
    setErrors({});
    setFormError("");
    resetNewCategory();
    setCalcOpen(false);
    setFormType(type);
  };

  const closeForm = () => {
    setFormType(null);
    setForm(emptyForm());
    setErrors({});
    setFormError("");
    resetNewCategory();
    setCalcOpen(false);
  };

  // Merge form changes and clear the error(s) for whichever field(s) just changed,
  // so the red state disappears the moment the user starts fixing it.
  const updateForm = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(changes)) delete next[key];
      return next;
    });
    setFormError("");
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (guard()) return;
    setSavingCategory(true);
    try {
      const created = await addCategory({
        name,
        type: formType,
        color: newCategoryColor,
      });
      setForm((f) => ({ ...f, category: created.name }));
      setErrors((prev) => {
        const { category, ...rest } = prev;
        return rest;
      });
      resetNewCategory();
      toast.success(`Added category “${created.name}”`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't add category.");
    } finally {
      setSavingCategory(false);
    }
  };

  const handleRemoveCategory = async (id, name) => {
    if (guard()) return;
    try {
      await removeCategory(id);
      setForm((f) => (f.category === name ? { ...f, category: "" } : f));
      toast.info(`Removed “${name}”`);
    } catch {
      toast.error("Couldn't remove category.");
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const description = form.description.trim();
    const amount = Number(form.amount);

    // Validate every field at once so all problems light up together, rather
    // than surfacing them one refused submit at a time.
    const nextErrors = {};
    if (!description) nextErrors.description = "Enter a description.";
    if (!form.category) nextErrors.category = "Choose a category.";
    if (form.amount === "" || !Number.isFinite(amount) || amount <= 0) {
      nextErrors.amount = "Enter an amount greater than $0.";
    } else if (amount > 1e9) {
      nextErrors.amount = "Keep it under $1,000,000,000.";
    }
    if (!form.date || Number.isNaN(new Date(`${form.date}T00:00:00`).getTime())) {
      nextErrors.date = "Choose a valid date.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError("");
      // Shake each invalid field to draw the eye to what needs fixing.
      Object.keys(nextErrors).forEach((field) =>
        shakeControls[field]?.start(SHAKE)
      );
      return;
    }
    if (guard()) return;

    const type = formType;
    setErrors({});
    setFormError("");
    setSubmitting(true);
    try {
      const created = await addTransaction({
        description,
        amount,
        type,
        category: form.category,
        date: form.date,
      });
      // Only show it here if it lands inside the window being listed.
      const createdYmd = String(created.date).slice(0, 10);
      const inView = current
        ? createdYmd >= current.start && createdYmd <= current.end
        : new Date(created.date).getUTCMonth() === now.getMonth() &&
          new Date(created.date).getUTCFullYear() === now.getFullYear();
      if (inView) setTransactions((prev) => [created, ...prev]);
      closeForm();
      const sign = type === "income" ? "+" : "−";
      toast.success(`Added ${sign}${formatMoney(amount)} · ${form.category}`);
    } catch (err) {
      const message = err?.response?.data?.message;
      setFormError(message || "Couldn't add transaction. Please try again.");
    } finally {
      setSubmitting(false);
    }
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
        <Button variant="success" onClick={() => openForm("income")} className="gap-1.5">
          <Plus className="h-4 w-4" /> Income
        </Button>
        <Button variant="destructive" onClick={() => openForm("expense")} className="gap-1.5">
          <Minus className="h-4 w-4" /> Expense
        </Button>
      </motion.div>

      {/* Add entry bottom sheet — type is fixed by which button opened it.
          In keypad mode the dismiss affordances (X, Escape, drag-down) step
          back to the form instead of discarding a half-filled entry. */}
      <BottomSheet
        open={formType !== null}
        onClose={calcOpen ? closeCalculator : closeForm}
        closeLabel={calcOpen ? "Back to form" : "Close dialog"}
        title={
          calcOpen
            ? "Calculator"
            : formType === "income"
              ? "Add income"
              : "Add expense"
        }
      >
        {calcOpen ? (
          <AmountCalculator
            initialValue={form.amount}
            tone={formType === "income" ? "success" : "destructive"}
            onCancel={closeCalculator}
            onApply={(amount) => {
              updateForm({ amount: String(amount) });
              closeCalculator();
            }}
          />
        ) : (
          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {/* Category picker */}
            <div className="space-y-2">
              <motion.div animate={shakeControls.category} className="space-y-2">
                <Label className={errors.category ? "text-destructive" : undefined}>
                  Category
                </Label>
                <div
                  className={`grid grid-cols-3 gap-2 ${
                    errors.category
                      ? "rounded-xl ring-2 ring-destructive ring-offset-2 ring-offset-card"
                      : ""
                  }`}
                >
                {(categoriesByType[formType] ?? []).map((c) => {
                  const Icon = c.icon;
                  const selected = form.category === c.name;
                  return (
                    <button
                      type="button"
                      key={c.name}
                      onClick={() => updateForm({ category: c.name })}
                      aria-pressed={selected}
                      className={`relative flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border p-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                        selected ? "border-transparent" : "border-border hover:bg-accent/50"
                      }`}
                      style={
                        selected
                          ? { backgroundColor: `${c.color}22`, borderColor: c.color }
                          : undefined
                      }
                    >
                      {selected && (
                        <span
                          className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full text-white"
                          style={{ backgroundColor: c.color }}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                      <span
                        className="flex h-9 w-9 items-center justify-center rounded-full"
                        style={{ backgroundColor: `${c.color}22`, color: c.color }}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span className="text-[11px] font-medium leading-tight">
                        {c.name}
                      </span>
                    </button>
                  );
                })}

                {/* Create a custom category */}
                <button
                  type="button"
                  onClick={() => setShowNewCategory((v) => !v)}
                  aria-expanded={showNewCategory}
                  className={`flex min-h-[68px] flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-2 text-center transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                    showNewCategory
                      ? "border-primary text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
                    <Plus className="h-[18px] w-[18px]" />
                  </span>
                  <span className="text-[11px] font-medium leading-tight">New</span>
                </button>
                </div>
                {errors.category && (
                  <FieldError id="tx-category-error">{errors.category}</FieldError>
                )}
              </motion.div>

              {/* Custom category creator + manager */}
              {showNewCategory && (
                <div className="space-y-3 rounded-xl border border-border p-3">
                  <Input
                    placeholder="Category name"
                    value={newCategoryName}
                    maxLength={24}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    {CUSTOM_COLOR_OPTIONS.map((col) => (
                      <button
                        type="button"
                        key={col}
                        onClick={() => setNewCategoryColor(col)}
                        aria-label={`Colour ${col}`}
                        aria-pressed={newCategoryColor === col}
                        className={`h-8 w-8 rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                          newCategoryColor === col
                            ? "border-foreground"
                            : "border-transparent"
                        }`}
                        style={{ backgroundColor: col }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      onClick={handleAddCategory}
                      disabled={!newCategoryName.trim() || savingCategory}
                      className="flex-1"
                    >
                      {savingCategory ? "Adding…" : "Add category"}
                    </Button>
                    <Button type="button" variant="outline" onClick={resetNewCategory}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* Manage custom categories — always visible when any exist */}
              {custom.filter((c) => c.type === formType).length > 0 && (
                <div className="space-y-1.5 rounded-xl border border-border p-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Your categories
                  </p>
                  {custom
                    .filter((c) => c.type === formType)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-3 w-3 shrink-0 rounded-full"
                            style={{ background: c.color }}
                          />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveCategory(c.id, c.name)}
                          aria-label={`Remove ${c.name}`}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <motion.div animate={shakeControls.description} className="space-y-2">
              <Label
                htmlFor="description"
                className={errors.description ? "text-destructive" : undefined}
              >
                Description
              </Label>
              <Input
                id="description"
                placeholder={formType === "income" ? "e.g. Monthly allowance" : "e.g. Lunch"}
                value={form.description}
                required
                maxLength={120}
                aria-invalid={Boolean(errors.description)}
                aria-describedby={errors.description ? "tx-description-error" : undefined}
                className={
                  errors.description
                    ? "border-destructive focus-visible:ring-destructive"
                    : undefined
                }
                onChange={(e) => updateForm({ description: e.target.value })}
              />
              {errors.description && (
                <FieldError id="tx-description-error">{errors.description}</FieldError>
              )}
            </motion.div>
            <div className="grid grid-cols-2 items-start gap-3">
              <motion.div animate={shakeControls.amount} className="space-y-2">
                <Label
                  htmlFor="amount"
                  className={errors.amount ? "text-destructive" : undefined}
                >
                  Amount
                </Label>
                {/* On a phone the keypad is the only way in, so this is a button
                    rather than a text field — honest to screen readers, and it
                    can't be missed. The keypad covers everything the OS decimal
                    pad does plus operators, so nothing is lost. Desktop, which
                    has a real keyboard, keeps a plain typeable input. */}
                {touchFirst ? (
                  <button
                    type="button"
                    id="amount"
                    onClick={() => setCalcOpen(true)}
                    aria-label={
                      amountDisplay
                        ? `Amount, ${amountDisplay} dollars. Opens calculator.`
                        : "Amount, not set. Opens calculator."
                    }
                    aria-invalid={Boolean(errors.amount)}
                    aria-describedby={errors.amount ? "tx-amount-error" : undefined}
                    className={cn(
                      "flex h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-input bg-card px-3 py-2 text-base ring-offset-background transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                      errors.amount && "border-destructive focus-visible:ring-destructive"
                    )}
                  >
                    <span
                      className={cn(
                        "truncate tabular-nums",
                        !amountDisplay && "text-muted-foreground"
                      )}
                    >
                      {amountDisplay || "0.00"}
                    </span>
                    <Calculator className="h-[18px] w-[18px] shrink-0 text-primary" />
                  </button>
                ) : (
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      inputMode="decimal"
                      min="0.01"
                      max="1000000000"
                      step="0.01"
                      placeholder="0.00"
                      value={form.amount}
                      required
                      aria-invalid={Boolean(errors.amount)}
                      aria-describedby={errors.amount ? "tx-amount-error" : undefined}
                      className={cn(
                        // Drop the desktop spinner arrows — they render in the
                        // same spot as the keypad button.
                        "pr-11 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        errors.amount &&
                          "border-destructive focus-visible:ring-destructive"
                      )}
                      onChange={(e) => updateForm({ amount: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setCalcOpen(true)}
                      aria-label="Open calculator"
                      className="absolute inset-y-0 right-0 flex w-11 cursor-pointer items-center justify-center rounded-r-md text-primary transition-colors hover:text-primary/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                    >
                      <Calculator className="h-[18px] w-[18px]" />
                    </button>
                  </div>
                )}
                {errors.amount && (
                  <FieldError id="tx-amount-error">{errors.amount}</FieldError>
                )}
              </motion.div>
              <motion.div animate={shakeControls.date} className="space-y-2">
                <Label
                  htmlFor="date"
                  className={errors.date ? "text-destructive" : undefined}
                >
                  Date
                </Label>
                <Input
                  id="date"
                  type="date"
                  value={form.date}
                  required
                  aria-invalid={Boolean(errors.date)}
                  aria-describedby={errors.date ? "tx-date-error" : undefined}
                  className={
                    errors.date
                      ? "border-destructive focus-visible:ring-destructive"
                      : undefined
                  }
                  onChange={(e) => updateForm({ date: e.target.value })}
                />
                {errors.date && (
                  <FieldError id="tx-date-error">{errors.date}</FieldError>
                )}
              </motion.div>
            </div>
            {formError && (
              <p
                id="transaction-form-error"
                role="alert"
                className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
              >
                {formError}
              </p>
            )}
            <Button
              type="submit"
              variant={formType === "income" ? "success" : "destructive"}
              className="w-full"
              aria-describedby={formError ? "transaction-form-error" : undefined}
              disabled={submitting}
            >
              {submitting
                ? "Adding…"
                : formType === "income"
                  ? "Add income"
                  : "Add expense"}
            </Button>
          </form>
        )}
      </BottomSheet>

      {/* Search */}
      {!loading && transactions.length > 0 && (
        <div className="relative mt-6">
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
      )}

      {/* Filter pills */}
      {!loading && transactions.length > 0 && (
        <div className="mt-3 flex gap-1 rounded-full bg-muted p-1">
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
        ) : transactions.length === 0 ? (
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
              {visible.map((t) => {
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
                      <CardContent className="flex items-center justify-between gap-3 p-3.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <span
                            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                            style={{
                              backgroundColor: `${cat.color}22`,
                              color: cat.color,
                            }}
                          >
                            <Icon className="h-[18px] w-[18px]" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold">{t.description}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(t.date).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              })}{" "}
                              · {t.category}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span
                            className={`font-bold tabular-nums ${
                              isIncome ? "text-success" : "text-destructive"
                            }`}
                          >
                            {isIncome ? "+" : "−"}$
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
                );
              })}
            </AnimatePresence>
          </motion.div>
        )}
      </div>
    </PageWrapper>
  );
}
