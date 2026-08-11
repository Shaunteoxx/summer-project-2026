import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Plus, Check, X, Calculator } from "lucide-react";

import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTransaction } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { cn, formatMoney, localToday } from "@/lib/utils";
import { CUSTOM_COLOR_OPTIONS } from "@/lib/categories";
import { SHAKE } from "@/animations/variants";

const emptyForm = (accountId = "") => ({
  description: "",
  amount: "",
  category: "",
  date: localToday(),
  accountId,
});

/**
 * The add-entry sheet: category, description, amount and date for one new
 * income or expense. `type` doubles as the open flag — null keeps it closed,
 * and "income" or "expense" fixes which kind of entry is being added, so the
 * form never has to ask.
 *
 * Owns everything about the entry being drafted. The page owns the ledger, so a
 * successful save is handed back through onAdded rather than written from here
 * — only the page knows which window it is currently listing.
 *
 * In keypad mode the dismiss affordances (X, Escape, drag-down) step back to
 * the form instead of discarding a half-filled entry.
 */
export default function AddTransactionSheet({ type, onClose, onAdded }) {
  const toast = useToast();
  const guard = useDemoGuard();
  // On phones the keypad replaces the OS keyboard entirely, so it can't be
  // missed. On desktop the field stays a plain typeable input.
  const touchFirst = useCoarsePointer();
  const { categoriesByType, addCategory, removeCategory, custom } = useCategories();
  const { active: accounts, hasAccounts, defaultAccountId, rememberAccount } =
    useAccounts();

  const [form, setForm] = useState(emptyForm);
  // Per-field validation messages, keyed by field name (category/amount/date).
  const [errors, setErrors] = useState({});
  // Server-side / general failure not tied to one field.
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // When true the sheet shows the amount keypad instead of the form. The sheet
  // has no scroll container, so the keypad replaces the form rather than
  // stacking below it and pushing the submit button off screen.
  const [calcOpen, setCalcOpen] = useState(false);

  // Imperative shake controls so an invalid field re-shakes on every submit
  // attempt. Description isn't here — it can't be invalid now that it's
  // optional and capped by maxLength.
  const shakeControls = {
    category: useAnimationControls(),
    amount: useAnimationControls(),
    date: useAnimationControls(),
  };
  // Focus target for the category -> description hand-off.
  const descriptionRef = useRef(null);

  // Inline "create custom category" panel state.
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState(CUSTOM_COLOR_OPTIONS[0]);
  const [savingCategory, setSavingCategory] = useState(false);

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

  // Start clean every time the sheet opens, so a cancelled entry never leaks
  // into the next one.
  useEffect(() => {
    if (type === null) return;
    setForm(emptyForm(defaultAccountId()));
    setErrors({});
    setFormError("");
    resetNewCategory();
    setCalcOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

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

  /**
   * Selecting a category hands over to the description, so the common path is
   * one run down the sheet instead of a tap per field. Only when the
   * description is still empty: going back to fix a mis-tapped category must
   * not yank focus out of something already typed.
   */
  const selectCategory = (name) => {
    updateForm({ category: name });
    if (form.description.trim()) return;
    // Synchronously, inside the tap: iOS Safari only raises the keyboard for a
    // focus() call that happens within the user gesture, so deferring this to
    // a frame later would move the cursor without opening anything to type on.
    descriptionRef.current?.focus({ preventScroll: true });
  };

  /**
   * The description's return key hands over to the amount rather than
   * submitting a form that has no amount in it yet.
   */
  const handleDescriptionKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (!touchFirst) {
      document.getElementById("amount")?.focus();
      return;
    }
    // Drop the OS keyboard before the in-app keypad slides in, or the two
    // stack and the pad opens underneath it.
    e.currentTarget.blur();
    setCalcOpen(true);
  };

  const handleAddCategory = async () => {
    const name = newCategoryName.trim();
    if (!name) return;
    if (guard()) return;
    setSavingCategory(true);
    try {
      const created = await addCategory({
        name,
        type: type,
        color: newCategoryColor,
      });
      // Same hand-off as tapping an existing tile — you've just chosen a
      // category either way.
      selectCategory(created.name);
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

    // Typing is the slowest step in this form, so the description is optional
    // and falls back to the category — "Food & Drinks" reads fine in the
    // ledger, and the placeholder shows what will be saved before you submit.
    const description = form.description.trim() || form.category;
    const amount = Number(form.amount);

    // Validate every field at once so all problems light up together, rather
    // than surfacing them one refused submit at a time.
    const nextErrors = {};
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
        accountId: form.accountId || undefined,
      });
      rememberAccount(form.accountId);
      onAdded(created);
      onClose();
      const sign = type === "income" ? "+" : "−";
      toast.success(`Added ${sign}${formatMoney(amount)} · ${form.category}`);
    } catch (err) {
      const message = err?.response?.data?.message;
      setFormError(message || "Couldn't add transaction. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
  <BottomSheet
    open={type !== null}
    onClose={calcOpen ? closeCalculator : onClose}
    closeLabel={calcOpen ? "Back to form" : "Close dialog"}
    title={
      calcOpen
        ? "Calculator"
        : type === "income"
          ? "Add income"
          : "Add expense"
    }
  >
    {calcOpen ? (
      <AmountCalculator
        initialValue={form.amount}
        tone={type === "income" ? "success" : "destructive"}
        onCancel={closeCalculator}
        onApply={(amount) => {
          updateForm({ amount: String(amount) });
          closeCalculator();
        }}
      />
    ) : (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Account picker. Hidden entirely for anyone who hasn't made an
            account, so the form is exactly as it was for them. */}
        {hasAccounts && (
          <div className="space-y-2">
            <Label id="tx-account-label">
              {type === "income" ? "Paid into" : "Paid from"}
            </Label>
            <div
              role="group"
              aria-labelledby="tx-account-label"
              className="flex flex-wrap gap-2"
            >
              {accounts.map((a) => {
                const selected = form.accountId === a.id;
                return (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => updateForm({ accountId: a.id })}
                    aria-pressed={selected}
                    className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card ${
                      selected
                        ? "border-transparent"
                        : "border-border text-muted-foreground hover:bg-accent/50"
                    }`}
                    style={
                      selected
                        ? { backgroundColor: `${a.color}22`, borderColor: a.color }
                        : undefined
                    }
                  >
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: a.color }}
                    />
                    {a.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Category picker */}
        <div className="space-y-2">
          <motion.div animate={shakeControls.category} className="space-y-2">
            {/* "New" sits on the label line rather than in the grid: as a
                tile it took a whole row to itself whenever the category
                count was already a multiple of three. */}
            <div className="flex items-center justify-between gap-2">
              <Label className={errors.category ? "text-destructive" : undefined}>
                Category
              </Label>
              <button
                type="button"
                onClick={() => setShowNewCategory((v) => !v)}
                aria-expanded={showNewCategory}
                className={`-my-1 flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  showNewCategory
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            </div>
            <div
              className={`grid grid-cols-3 gap-2 ${
                errors.category
                  ? "rounded-xl ring-2 ring-destructive ring-offset-2 ring-offset-card"
                  : ""
              }`}
            >
            {(categoriesByType[type] ?? []).map((c) => {
              const Icon = c.icon;
              const selected = form.category === c.name;
              return (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => selectCategory(c.name)}
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
          {custom.filter((c) => c.type === type).length > 0 && (
            <div className="space-y-1.5 rounded-xl border border-border p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Your categories
              </p>
              {custom
                .filter((c) => c.type === type)
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

        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-2">
            <Label htmlFor="description">Description</Label>
            <span className="text-xs text-muted-foreground">Optional</span>
          </div>
          <Input
            id="description"
            ref={descriptionRef}
            // Once a category is picked the placeholder becomes the name
            // that will actually be saved, so the fallback is visible
            // rather than a surprise in the ledger.
            placeholder={
              form.category ||
              (type === "income" ? "e.g. Monthly allowance" : "e.g. Lunch")
            }
            value={form.description}
            maxLength={120}
            enterKeyHint="next"
            onKeyDown={handleDescriptionKeyDown}
            onChange={(e) => updateForm({ description: e.target.value })}
          />
        </div>
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
          variant={type === "income" ? "success" : "destructive"}
          className="w-full"
          aria-describedby={formError ? "transaction-form-error" : undefined}
          disabled={submitting}
        >
          {submitting
            ? "Adding…"
            : type === "income"
              ? "Add income"
              : "Add expense"}
        </Button>
      </form>
    )}
  </BottomSheet>
  );
}
