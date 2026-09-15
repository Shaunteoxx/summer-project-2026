import { useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Repeat } from "lucide-react";

import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import SwitchRow from "@/components/SwitchRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AccountOptions,
  AccountSelect,
  AmountHero,
  CategoryPicker,
  EntryTypeToggle,
  useAccountChoice,
  useCategoryPicker,
} from "@/components/EntryFields";
import { addTransaction, updateTransaction } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useAccounts } from "@/hooks/useAccounts";
import { useRecurring } from "@/hooks/useRecurring";
import { cn, formatMoney, localToday, ordinal } from "@/lib/utils";
import { SHAKE } from "@/animations/variants";

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
  const { defaultAccountId, rememberAccount } = useAccounts();
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
  const categoryPicker = useCategoryPicker();

  // Closing the keypad unmounts it, which would drop focus to <body>. Put it
  // back on the amount control so keyboard and screen-reader users keep their
  // place in the form.
  const closeCalculator = () => {
    setCalcOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("amount")?.focus({ preventScroll: true });
    });
  };

  const accountChoice = useAccountChoice(form.accountId);

  // Reseed every time the sheet opens, so a cancelled entry never leaks into
  // the next one and an edit always starts from the row as it stands.
  useEffect(() => {
    if (type === null) return;
    setForm(editing ? formFrom(editing) : emptyForm(defaultAccountId()));
    setErrors({});
    setFormError("");
    setRepeat(false);
    categoryPicker.reset();
    setCalcOpen(false);
    setAccountPickerOpen(false);
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
          ? `Edit ${type === "income" ? "Income" : "Expense"}`
          : "New Entry"
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
        {!isEdit && <EntryTypeToggle value={type} onChange={setDraftType} />}

        {/* The amount is the hero of this sheet — see AmountHero. */}
        <AmountHero
          id="amount"
          amount={form.amount}
          type={type}
          error={errors.amount}
          shake={shakeControls.amount}
          onOpen={() => setCalcOpen(true)}
        />

        <CategoryPicker
          idPrefix="tx"
          type={type}
          value={form.category}
          onChange={(name) => updateForm({ category: name })}
          error={errors.category}
          shake={shakeControls.category}
          picker={categoryPicker}
        />

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
          {/* Side by side when they fit, stacked when they don't — a wrapping
              flex row, not a two-column grid.

              The grid was the bug: its tracks were sized off the date input,
              which on iOS is a native control that refuses to shrink, so it
              overflowed its column and sat on the account field. Dropping the
              native appearance (see index.css) makes it shrink, and this makes
              the point moot either way — anything that still can't fit in half
              the width pushes the account onto its own line instead of
              overlapping it. Correctness first; the row is the nice-to-have. */}
          <div className="flex flex-wrap items-start gap-2.5">
            <motion.div animate={shakeControls.date} className="flex-1 basis-[9rem]">
              <Input
                id="date"
                type="date"
                aria-label="Date"
                value={form.date}
                required
                aria-invalid={Boolean(errors.date)}
                aria-describedby={errors.date ? "tx-date-error" : undefined}
                className={cn(
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
            {accountChoice.available && (
              <AccountSelect
                type={type}
                choice={accountChoice}
                open={accountPickerOpen}
                onToggle={() => setAccountPickerOpen((v) => !v)}
                className="flex-1 basis-[9rem]"
              />
            )}
          </div>

          {accountPickerOpen && accountChoice.available && (
            <AccountOptions
              type={type}
              choice={accountChoice}
              value={form.accountId}
              onChange={(id) => updateForm({ accountId: id })}
              onClose={() => setAccountPickerOpen(false)}
            />
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
            label="Repeat Monthly"
            description={
              repeat && repeatPlan(form.date)
                ? repeatPlan(form.date).caption
                : undefined
            }
          />
        )}
        {/* The same slot, while editing a row a rule wrote: say that changing
            or deleting it is this one time only. Otherwise a one-off month —
            a cheaper bill, a skipped subscription — looks like it might break
            the rule, and people leave a wrong entry rather than risk that. */}
        {isEdit && editing.recurringId && (
          <p className="flex gap-2 rounded-md bg-surface-2 px-3 py-2.5 text-[13px] leading-snug text-ink-2">
            <Repeat className="mt-px h-3.5 w-3.5 shrink-0 text-ink-3" aria-hidden="true" />
            <span>
              Added by a repeating entry. Changing or deleting it only affects
              this one, not the entries still to come.
            </span>
          </p>
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
              : "Save Changes"
            : submitting
              ? "Adding…"
              : type === "income"
                ? "Add Income"
                : "Add Expense"}
        </Button>
      </form>
    )}
  </BottomSheet>
  );
}
