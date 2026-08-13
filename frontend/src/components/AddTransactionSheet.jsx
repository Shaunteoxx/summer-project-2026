import { useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Plus, Wallet, ChevronDown, Check, Tag } from "lucide-react";

import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import SwitchRow from "@/components/SwitchRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { addTransaction, updateTransaction } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useRecurring } from "@/hooks/useRecurring";
import { cn, formatMoney, localToday, ordinal } from "@/lib/utils";
import { CUSTOM_COLOR_OPTIONS } from "@/lib/categories";
import { SHAKE } from "@/animations/variants";

/**
 * How many categories the six-across grid will show before the picker
 * collapses to a field and a list. Two full rows: a third row is 81px the
 * sheet doesn't have on a short phone, and by then the tiles are being read
 * as names rather than recognised as icons.
 */
const CATEGORY_GRID_MAX = 12;

const emptyForm = (accountId = "") => ({
  description: "",
  amount: "",
  category: "",
  date: localToday(),
  accountId,
});

/**
 * What a "repeat this" rule would do, worked out from the entry being added.
 *
 * The rule starts the day *after* this entry, never on it — the entry being
 * saved is this month's, and a rule that also fired today would post it twice.
 * Because of that the first repeat is always the following month, whatever
 * date the entry carries. Never earlier than today either, since a rule can't
 * reach into days already lived through.
 */
export function repeatPlan(dateYmd) {
  const day = Number(String(dateYmd).slice(8, 10));
  if (!Number.isInteger(day) || day < 1) return null;

  const dayAfter = new Date(`${dateYmd}T00:00:00.000Z`);
  dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
  const startKey =
    dayAfter.toISOString().slice(0, 10) > localToday()
      ? dayAfter.toISOString().slice(0, 10)
      : localToday();

  const entry = new Date(`${dateYmd}T00:00:00.000Z`);
  const nextMonth = new Date(
    Date.UTC(entry.getUTCFullYear(), entry.getUTCMonth() + 1, 1)
  );
  return {
    dayOfMonth: day,
    startKey,
    caption:
      `Adds this again on the ${ordinal(day)} of each month, from ` +
      `${nextMonth.toLocaleDateString(undefined, { month: "long", timeZone: "UTC" })}.` +
      (day > 28 ? " Shorter months use their last day." : ""),
  };
}

/** Seed the form from an existing row, so an edit starts from what's there. */
const formFrom = (transaction) => ({
  description: transaction.description,
  amount: String(transaction.amount),
  category: transaction.category,
  // Transaction dates are stored at UTC midnight; slicing the ISO string keeps
  // the day the user chose, which building a local Date from it would not.
  date: String(transaction.date).slice(0, 10),
  accountId: transaction.accountId ? String(transaction.accountId) : "",
});

/**
 * The entry sheet: category, description, amount and date for one income or
 * expense. It both adds and edits, because an edit asks for exactly the same
 * fields under the same rules — a second form would be the same 600 lines
 * drifting out of step.
 *
 * Which mode it is in comes from the props, and either one doubles as the open
 * flag: `editing` is the row being corrected, otherwise `type` ("income" or
 * "expense") fixes which kind of entry is being added, so the form never has to
 * ask. Both null keeps it closed.
 *
 * An edit sends only the fields that actually changed. That keeps a row tagged
 * to an account the user has since archived — the picker can't show it, and
 * resending it would be refused — and makes "opened it, changed nothing" cost
 * no request at all.
 *
 * Owns everything about the entry being drafted. The page owns the ledger, so a
 * successful save is handed back through onAdded/onUpdated rather than written
 * from here — only the page knows which window it is currently listing.
 *
 * Laid out amount-first: the figure is the hero at 44px, then the category
 * grid, then the three facts that are usually already right (description, date,
 * account). Nothing is labelled twice — each control reads as its own value.
 *
 * In keypad mode the dismiss affordances (X, Escape, drag-down) step back to
 * the form instead of discarding a half-filled entry.
 */
export default function AddTransactionSheet({
  type: addType = null,
  editing = null,
  onClose,
  onAdded,
  onUpdated,
}) {
  // An edit is fixed to the kind of entry it already is: categories are
  // per-type, and the API refuses a type change for the same reason.
  //
  // While ADDING, the type is switchable from inside the sheet — it used to be
  // fixed by whichever of two buttons you pressed on the page behind it. That
  // made the choice before you'd seen the form, and it cost the page two
  // buttons that duplicated what the sheet could say itself.
  const [draftType, setDraftType] = useState(addType);
  useEffect(() => setDraftType(addType), [addType]);
  const type = editing ? editing.type : draftType;
  const isEdit = Boolean(editing);
  const toast = useToast();
  const guard = useDemoGuard();
  const { categoriesByType, addCategory } = useCategories();
  const {
    active: accounts,
    hasAccounts,
    getAccount,
    defaultAccountId,
    rememberAccount,
  } = useAccounts();
  const { addRule } = useRecurring();

  const [form, setForm] = useState(emptyForm);
  // Ticked while adding: also set this entry up to repeat every month.
  const [repeat, setRepeat] = useState(false);
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

  // The account row reads as a field showing what's tagged, because that's how
  // it's used — the default is remembered and usually right, so the common
  // case is confirming it rather than choosing. The chips are one tap away,
  // expanded inline the same way the new-category panel is.
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  // Only used in list mode; the grid is always open.
  const [categoryListOpen, setCategoryListOpen] = useState(false);

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

  // The keypad is the only source of this value now, so it's always a clean
  // number or empty — safe to render at a fixed 2dp.
  const amountNumber = Number(form.amount);
  const amountSet = form.amount !== "" && Number.isFinite(amountNumber);
  const amountDisplay = amountSet ? amountNumber.toFixed(2) : "0.00";
  // The sign rides the number, as on the Home hero: this is the figure the
  // entry is, not a sum with an operator applied to it later.
  const amountSign = amountSet ? (type === "income" ? "+" : "−") : "";

  // An older entry can be tagged to an account that has since been archived.
  // List it beside the active ones so the tag reads as it is rather than as
  // cleared; moving off it is one-way, which is what archiving means.
  const taggedAccount =
    form.accountId && !accounts.some((a) => a.id === form.accountId)
      ? getAccount(form.accountId)
      : null;
  const pickableAccounts = taggedAccount ? [...accounts, taggedAccount] : accounts;
  const selectedAccount = form.accountId ? getAccount(form.accountId) : null;

  // The grid is six across, so twelve is exactly two rows — the most it can
  // show without the sheet getting taller than the screen it opens on. Past
  // that it becomes a field and a list, which costs one tap and a fixed 44px
  // however many categories you have.
  const categoryList = categoriesByType[type] ?? [];
  const useCategoryGrid = categoryList.length <= CATEGORY_GRID_MAX;
  const selectedCategory = categoryList.find((c) => c.name === form.category);

  const resetNewCategory = () => {
    setShowNewCategory(false);
    setNewCategoryName("");
    setNewCategoryColor(CUSTOM_COLOR_OPTIONS[0]);
  };

  // Reseed every time the sheet opens, so a cancelled entry never leaks into
  // the next one and an edit always starts from the row as it stands.
  useEffect(() => {
    if (type === null) return;
    setForm(editing ? formFrom(editing) : emptyForm(defaultAccountId()));
    setErrors({});
    setFormError("");
    setRepeat(false);
    resetNewCategory();
    setCalcOpen(false);
    setAccountPickerOpen(false);
    setCategoryListOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, editing]);

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
   * Selecting a category does exactly that, and nothing else.
   *
   * It used to hand focus straight to the description to save a tap. In
   * practice that jerked the OS keyboard up over the sheet mid-scroll on every
   * category tap — including the taps that were only correcting a mis-tap —
   * which cost more in disruption than the tap it saved. The fields below are
   * one press each; the user makes those presses when they want them.
   */
  const selectCategory = (name) => updateForm({ category: name });

  /**
   * The description's return key just puts the keyboard away.
   *
   * It must not fall through to the browser's implicit submit — the amount
   * isn't filled in yet at this point, so that would only ever bounce the form
   * back with errors. It doesn't jump on to the amount either: that's one
   * button sitting right there, and moving focus for the user is what made
   * this form feel like it was fighting them.
   */
  const handleDescriptionKeyDown = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    e.currentTarget.blur();
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


  const handleSubmit = async (e) => {
    e.preventDefault();

    // Typing is the slowest step in this form, so the description is optional
    // and falls back to the category — "F & B" reads fine in the
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
      if (isEdit) {
        await saveEdit({ description, amount });
      } else {
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
        // After the entry, and never in place of it: the entry is what was
        // asked for, so a rule that fails to save must not lose it.
        if (repeat) await createRepeat({ description, amount });
      }
    } catch (err) {
      const message = err?.response?.data?.message;
      setFormError(
        message ||
          `Couldn't ${isEdit ? "save your changes" : "add transaction"}. Please try again.`
      );
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * Turn the entry just added into a monthly rule.
   *
   * Deliberately after the transaction has saved and the sheet has closed: the
   * entry is what the user asked for and it is already safe. If the rule fails
   * they are told, and the entry stays — the alternative, one request that
   * either does both or neither, would throw away a logged expense over a
   * failed convenience.
   */
  const createRepeat = async ({ description, amount }) => {
    const plan = repeatPlan(form.date);
    if (!plan) return;
    try {
      await addRule({
        description,
        amount,
        type,
        category: form.category,
        accountId: form.accountId || null,
        frequency: "monthly",
        dayOfMonth: plan.dayOfMonth,
        startKey: plan.startKey,
      });
      toast.success(`Repeating on the ${ordinal(plan.dayOfMonth)} of each month`);
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Added the entry, but couldn't set it to repeat."
      );
    }
  };

  /**
   * Send only what moved. Anything the user didn't touch is left out of the
   * request entirely, so the server keeps whatever it already had — including
   * an account that has since been archived, which the picker can't offer and
   * the API would refuse to be sent.
   */
  const saveEdit = async ({ description, amount }) => {
    const patch = {};
    if (description !== editing.description) patch.description = description;
    if (amount !== editing.amount) patch.amount = amount;
    if (form.category !== editing.category) patch.category = form.category;
    if (form.date !== String(editing.date).slice(0, 10)) patch.date = form.date;

    const wasAccount = editing.accountId ? String(editing.accountId) : "";
    // Null, not undefined: clearing the tag has to be said out loud.
    if (form.accountId !== wasAccount) patch.accountId = form.accountId || null;

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    const updated = await updateTransaction(editing._id, patch);
    if (patch.accountId) rememberAccount(patch.accountId);
    onUpdated(updated);
    onClose();
    toast.success("Transaction updated");
  };

  return (
  <BottomSheet
    open={type !== null}
    onClose={calcOpen ? closeCalculator : onClose}
    closeLabel={calcOpen ? "Back to form" : "Close dialog"}
    title={
      calcOpen
        ? "Calculator"
        : isEdit
          ? `Edit ${type === "income" ? "income" : "expense"}`
          : "New entry"
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
        {/* Expense / Income. Only while adding: the API refuses a type change
            on an existing row, and the categories are per-type, so an edit that
            could flip this would silently invalidate its own category. */}
        {!isEdit && (
          <div
            className="grid grid-cols-2 gap-0.5 rounded-md bg-surface-2 p-[3px]"
            role="group"
            aria-label="Entry type"
          >
            {[
              { value: "expense", label: "Expense" },
              { value: "income", label: "Income" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                aria-pressed={type === opt.value}
                onClick={() => setDraftType(opt.value)}
                className={`rounded-[9px] py-1.5 text-[13px] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  type === opt.value
                    ? "bg-surface font-semibold text-ink shadow-card"
                    : "font-medium text-ink-3 hover:text-ink-2"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {/* The amount is the hero of this sheet. It's the one field that is
            never optional and never guessable, and at 44px it's legible from
            the moment the sheet lands — which is what the old 44px-tall input,
            sharing a row with the date, was not.

            One control on every device, not a keypad on phones and a text
            input on desktop: the keypad takes digits, operators, backspace and
            Enter from a hardware keyboard, so there is nothing left for the
            plain input to be better at. */}
        <motion.div animate={shakeControls.amount} className="text-center">
          <p
            className={`text-overline ${errors.amount ? "text-negative" : "text-ink-3"}`}
          >
            Amount
          </p>
          <button
            type="button"
            id="amount"
            onClick={() => setCalcOpen(true)}
            aria-label={
              amountSet
                ? `Amount, ${amountDisplay} dollars. Opens calculator.`
                : "Amount, not set. Opens calculator."
            }
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={errors.amount ? "tx-amount-error" : undefined}
            className={cn(
              "num-display mt-1.5 w-full rounded-md py-1 text-[44px] leading-[1.1] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              !amountSet && "text-ink-3",
              amountSet && type === "income" && "text-positive"
            )}
          >
            {amountSign}${amountDisplay}
          </button>
          {errors.amount && (
            <FieldError id="tx-amount-error" className="justify-center">
              {errors.amount}
            </FieldError>
          )}
        </motion.div>

        {/* Category picker */}
        <div className="space-y-2">
          <motion.div animate={shakeControls.category} className="space-y-2">
            {/* "New" sits on the label line, not in the grid. As a tile it
                works right up until the grid becomes a list — and it has to,
                once there are more categories than fit — at which point a
                create affordance shaped like a category tile has nowhere to
                live. On the label line it reads the same in both modes. */}
            <div className="flex items-center justify-between gap-2">
              <p
                className={`text-overline ${errors.category ? "text-negative" : "text-ink-3"}`}
              >
                Category
              </p>
              <button
                type="button"
                onClick={() => setShowNewCategory((v) => !v)}
                aria-expanded={showNewCategory}
                className={`-my-1 flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  showNewCategory
                    ? "bg-ink/[0.06] text-ink"
                    : "text-ink-3 hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            </div>

            {useCategoryGrid ? (
            <div
              className={`grid grid-cols-6 gap-[7px] ${
                errors.category
                  ? "rounded-sm ring-2 ring-negative ring-offset-4 ring-offset-surface"
                  : ""
              }`}
            >
            {(categoriesByType[type] ?? []).map((c) => {
              const Icon = c.icon;
              const selected = !showNewCategory && form.category === c.name;
              return (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => selectCategory(c.name)}
                  aria-pressed={selected}
                  // The tile may show a short label; the full name is what the
                  // entry is filed under, so that's what it announces.
                  aria-label={c.name}
                  className="group flex flex-col items-center gap-1.5 rounded-[11px] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <span
                    className={`grid aspect-square w-full place-items-center rounded-[11px] transition-colors duration-base ease-out ${
                      selected ? "" : "bg-surface-2 group-hover:bg-surface-3"
                    }`}
                    style={
                      selected
                        ? {
                            backgroundColor: `${c.color}26`,
                            boxShadow: `0 0 0 1.5px ${c.color}`,
                            color: c.color,
                          }
                        : { color: c.color }
                    }
                  >
                    <Icon
                      className="h-[17px] w-[17px]"
                      strokeWidth={selected ? 2.2 : 2}
                    />
                  </span>
                  {/* Fixed height and full width: the names here are the real
                      ones ("Entertainment", not "Fun"), so they wrap to two
                      lines and would otherwise both overflow their column and
                      leave the tiles beside them sitting at different heights. */}
                  <span
                    className={`block h-[22px] w-full overflow-hidden text-center text-[9px] leading-[1.1] ${
                      selected ? "font-semibold text-ink" : "font-medium text-ink-3"
                    }`}
                  >
                    {c.short ?? c.name}
                  </span>
                </button>
              );
            })}
            </div>
            ) : (
              /* Past two rows the grid stops paying for itself: it costs a
                 row of 81px per six categories, and at that size the icon has
                 stopped being the thing you recognise — you're reading the
                 names anyway. So it collapses to the value plus a list, the
                 same shape the account field below uses. */
              <>
                <button
                  type="button"
                  onClick={() => setCategoryListOpen((v) => !v)}
                  aria-expanded={categoryListOpen}
                  aria-invalid={Boolean(errors.category)}
                  aria-describedby={errors.category ? "tx-category-error" : undefined}
                  className={cn(
                    "flex h-11 w-full items-center gap-2.5 rounded-md bg-surface-2 px-3.5 text-sm transition-colors duration-base ease-out hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    errors.category && "ring-2 ring-negative"
                  )}
                >
                  {selectedCategory ? (
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px]"
                      style={{
                        backgroundColor: `${selectedCategory.color}26`,
                        color: selectedCategory.color,
                      }}
                    >
                      <selectedCategory.icon className="h-3.5 w-3.5" />
                    </span>
                  ) : (
                    <Tag className="h-[15px] w-[15px] shrink-0 text-ink-3" />
                  )}
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-left font-medium",
                      !selectedCategory && "font-normal text-ink-3"
                    )}
                  >
                    {selectedCategory ? selectedCategory.name : "Choose a category"}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
                </button>

                {categoryListOpen && (
                  <ul
                    // Capped and scrolled in place. The sheet scrolls too, but
                    // a list that pushed the amount and the submit button off
                    // screen every time it opened would make choosing a
                    // category cost a scroll back up.
                    className="max-h-[248px] space-y-0.5 overflow-y-auto overscroll-contain rounded-xl bg-surface-2 p-2"
                  >
                    {(categoriesByType[type] ?? []).map((c) => {
                      const Icon = c.icon;
                      const selected = form.category === c.name;
                      return (
                        <li key={c.name}>
                          <button
                            type="button"
                            onClick={() => {
                              selectCategory(c.name);
                              setCategoryListOpen(false);
                            }}
                            aria-pressed={selected}
                            className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                              selected
                                ? "bg-surface font-semibold text-ink shadow-card"
                                : "font-medium text-ink-2 hover:bg-surface"
                            }`}
                          >
                            <span
                              className="grid h-6 w-6 shrink-0 place-items-center rounded-[7px]"
                              style={{
                                backgroundColor: `${c.color}26`,
                                color: c.color,
                              }}
                            >
                              <Icon className="h-3.5 w-3.5" />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{c.name}</span>
                            {selected && <Check className="h-4 w-4 shrink-0" />}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}
            {errors.category && (
              <FieldError id="tx-category-error">{errors.category}</FieldError>
            )}
          </motion.div>

          {/* Create only. Deleting lives on More → Categories, with the
              accounts and repeating entries — the same shape of thing, used
              here and managed there. It briefly lived in this panel, which
              meant pressing a button labelled "New" to remove something. */}
          {showNewCategory && (
            <div className="rounded-xl bg-surface-2 p-4">
              <p className="text-[13.5px] font-semibold tracking-[-0.01em]">
                New category
              </p>
              <Input
                placeholder="Category name"
                value={newCategoryName}
                maxLength={24}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="mt-2.5 bg-surface"
              />
              <p className="mb-2 mt-3.5 text-overline text-ink-3">Colour</p>
              <div className="flex flex-wrap gap-2.5">
                {CUSTOM_COLOR_OPTIONS.map((col) => (
                  <button
                    type="button"
                    key={col}
                    onClick={() => setNewCategoryColor(col)}
                    aria-label={`Colour ${col}`}
                    aria-pressed={newCategoryColor === col}
                    // Ringed in ink with a gap in the panel's own surface, so
                    // the marker reads at every hue — a border in the swatch
                    // colour disappears on the swatch it's marking.
                    className="h-[30px] w-[30px] rounded-[9px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
                    style={{
                      backgroundColor: col,
                      boxShadow:
                        newCategoryColor === col
                          ? "0 0 0 2px hsl(var(--surface-2)), 0 0 0 3.5px hsl(var(--ink))"
                          : undefined,
                    }}
                  />
                ))}
              </div>
              <div className="mt-4 flex gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={resetNewCategory}
                  className="h-10 flex-1 bg-surface text-sm"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleAddCategory}
                  disabled={!newCategoryName.trim() || savingCategory}
                  className="h-10 flex-1 text-sm"
                >
                  {savingCategory ? "Creating…" : "Create"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Three fields, no labels above them. The description carries the
            name that will be saved as its placeholder, and the date and
            account show their own values — a label over each would be a third
            row of text saying what the row already says. */}
        <div className="space-y-2.5">
          <Input
            id="description"
            aria-label="Description"
            // Once a category is picked the placeholder becomes the name
            // that will actually be saved, so the fallback is visible
            // rather than a surprise in the ledger.
            placeholder={
              form.category ||
              (type === "income" ? "e.g. Monthly allowance" : "e.g. Lunch")
            }
            value={form.description}
            maxLength={120}
            enterKeyHint="done"
            onKeyDown={handleDescriptionKeyDown}
            onChange={(e) => updateForm({ description: e.target.value })}
          />
          {/* Two up only when there's an account to put beside the date.
              Without one, a half-width date field with empty space next to it
              reads as a control that failed to render.

              `minmax(0,1fr)`, not `1fr`. A grid track is `minmax(auto,1fr)` by
              default, and `auto` floors at the item's min-content width —
              which for a native date input on iOS is the rendered date plus
              the calendar button, wider than half this sheet. The track grew
              to fit it and the account field beside it got sat on. The
              `min-w-0` on each child is the same fix one level down. */}
          <div
            className={`grid items-start gap-2.5 ${
              hasAccounts || taggedAccount
                ? "grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"
                : "grid-cols-1"
            }`}
          >
            <motion.div animate={shakeControls.date} className="min-w-0">
              <Input
                id="date"
                type="date"
                aria-label="Date"
                value={form.date}
                required
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? "tx-date-error" : undefined}
                className={cn(
                  "min-w-0",
                  errors.date && "border-destructive focus-visible:ring-destructive"
                )}
                onChange={(e) => updateForm({ date: e.target.value })}
              />
              {errors.date && (
                <FieldError id="tx-date-error">{errors.date}</FieldError>
              )}
            </motion.div>

            {/* The account sits beside the date because it's the same kind of
                thing: a fact about the entry that is almost always already
                right. It reads as its value, and opens the chips when it
                isn't. Hidden entirely for anyone with no accounts, so the
                form is exactly as it was for them. */}
            {(hasAccounts || taggedAccount) && (
              <button
                type="button"
                onClick={() => setAccountPickerOpen((v) => !v)}
                aria-expanded={accountPickerOpen}
                aria-label={`${type === "income" ? "Paid into" : "Paid from"}: ${
                  selectedAccount ? selectedAccount.name : "no account"
                }. Choose account`}
                className="flex h-11 w-full min-w-0 items-center gap-2.5 rounded-md bg-surface-2 px-3.5 text-sm transition-colors duration-base ease-out hover:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {selectedAccount ? (
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: selectedAccount.color }}
                  />
                ) : (
                  <Wallet className="h-[15px] w-[15px] shrink-0 text-ink-3" />
                )}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate text-left font-medium",
                    !selectedAccount && "font-normal text-ink-3"
                  )}
                >
                  {selectedAccount ? selectedAccount.name : "No account"}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
              </button>
            )}
          </div>

          {accountPickerOpen && (hasAccounts || taggedAccount) && (
            <div
              role="group"
              aria-label={type === "income" ? "Paid into" : "Paid from"}
              className="flex flex-wrap gap-2 rounded-xl bg-surface-2 p-3"
            >
              {pickableAccounts.map((a) => {
                const selected = form.accountId === a.id;
                return (
                  <button
                    type="button"
                    key={a.id}
                    // Tapping the selected chip clears it. Without that a
                    // mis-tag is unfixable: there is no "none" chip, and every
                    // other tap only ever moves the tag somewhere else.
                    onClick={() => {
                      updateForm({ accountId: selected ? "" : a.id });
                      setAccountPickerOpen(false);
                    }}
                    aria-pressed={selected}
                    className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 ${
                      selected
                        ? "border-transparent"
                        : "border-hairline-strong bg-surface text-ink-2 hover:bg-surface-3"
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
          )}
        </div>
        {/* Rent and subscriptions are realised at the moment you log them, not
            later in a settings screen — so the offer to repeat sits here,
            after the date it derives its schedule from. Editing an existing
            entry doesn't offer it: that entry has already happened, and its
            rule (if any) is managed on the More page. */}
        {!isEdit && (
          <SwitchRow
            checked={repeat}
            onChange={setRepeat}
            label="Repeat monthly"
            description={
              repeat && repeatPlan(form.date)
                ? repeatPlan(form.date).caption
                : undefined
            }
          />
        )}

        {formError && (
          <p
            id="transaction-form-error"
            role="alert"
            className="rounded-md bg-negative/[0.08] px-3 py-2 text-[13px] font-medium text-negative"
          >
            {formError}
          </p>
        )}
        {/* Ink, not green or red. Confirming the form isn't a destructive act
            and doesn't need warning about, and colouring it by entry type made
            the same button mean two different things on two taps. Red is
            reserved for being over budget. */}
        <Button
          type="submit"
          className="w-full"
          aria-describedby={formError ? "transaction-form-error" : undefined}
          disabled={submitting}
        >
          {isEdit
            ? submitting
              ? "Saving…"
              : "Save changes"
            : submitting
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
