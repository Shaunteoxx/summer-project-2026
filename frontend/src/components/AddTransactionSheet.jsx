import { useEffect, useRef, useState } from "react";
import { useAnimationControls } from "framer-motion";

import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import EntryDetails from "@/components/EntryDetails";
import EntryRepeat from "@/components/EntryRepeat";
import PaidBackField from "@/components/PaidBackField";
import { Button } from "@/components/ui/button";
import {
  AmountHero,
  CategoryPicker,
  EntryTypeToggle,
  useAccountChoice,
  useCategoryPicker,
} from "@/components/EntryFields";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useAccounts } from "@/hooks/useAccounts";
import { useEntrySave } from "@/hooks/useEntrySave";
import { useEntryTip } from "@/hooks/useEntryTip";
import { haptic } from "@/lib/haptics";
import { SHAKE } from "@/animations/variants";
import { emptyForm, formFrom, readDraft } from "@/lib/entryDraft";


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
 *
 * Saving doesn't wait for the server. The row goes into the ledger and the
 * sheet closes on the tap — on mobile data, or with the API waking from idle,
 * waiting meant staring at "Adding…" for seconds on the app's most frequent
 * action. So the page hears about a save twice:
 *
 *   onAdded(row) / onUpdated(row)  straight away, with the row as it will be
 *                                  (`pending: true`, and for an add a
 *                                  provisional id plus a `clientKey` the row
 *                                  keeps for life, so it never remounts)
 *   onSaved({ key, row })          when the server has it, with its version
 *   onFailed({ key, original, retry })
 *                                  when it doesn't: `original` is the row to
 *                                  put back (null for an add), and `retry` is
 *                                  the draft and the error, for the page to
 *                                  reopen this sheet with via `restore`
 *
 * Nothing is lost on a failure — the entry comes back exactly as typed, with
 * the reason, one tap from trying again.
 */
export default function AddTransactionSheet({
  type: addType = null,
  editing = null,
  restore = null,
  onClose,
  onAdded,
  onUpdated,
  onSaved,
  onFailed,
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
  const guard = useDemoGuard();
  const { defaultAccountId } = useAccounts();

  const [form, setForm] = useState(emptyForm);
  // Ticked while adding: also set this entry up to repeat every month.
  const [repeat, setRepeat] = useState(false);
  // Per-field validation messages, keyed by field name (category/amount/date).
  const [errors, setErrors] = useState({});
  // Server-side / general failure not tied to one field.
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // Whether the page (and so this sheet) is still there when a save answers,
  // and whether the sheet is open again for another entry by then.
  const mounted = useRef(true);
  const openNow = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    openNow.current = type !== null;
  });
  // Which figure the keypad is entering — "amount" or "paidBack" — or false
  // while the form shows. The keypad replaces the form rather than stacking
  // below it and pushing the submit button off screen.
  const [calcOpen, setCalcOpen] = useState(false);

  // Imperative shake controls so an invalid field re-shakes on every submit
  // attempt. Description isn't here — it can't be invalid now that it's
  // optional and capped by maxLength.
  const shakeControls = {
    category: useAnimationControls(),
    amount: useAnimationControls(),
    date: useAnimationControls(),
    paidBack: useAnimationControls(),
  };

  // The account row reads as a field showing what's tagged, because that's how
  // it's used — the default is remembered and usually right, so the common
  // case is confirming it rather than choosing. The chips are one tap away,
  // expanded inline the same way the new-category panel is.
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [paidBackPickerOpen, setPaidBackPickerOpen] = useState(false);
  const categoryPicker = useCategoryPicker();

  // Closing the keypad unmounts it, which would drop focus to <body>. Put it
  // back on the amount control so keyboard and screen-reader users keep their
  // place in the form.
  const closeCalculator = () => {
    const field = calcOpen === "paidBack" ? "paid-back" : "amount";
    setCalcOpen(false);
    requestAnimationFrame(() => {
      document.getElementById(field)?.focus({ preventScroll: true });
    });
  };

  const accountChoice = useAccountChoice(form.accountId);
  const paidBackChoice = useAccountChoice(form.paidBackAccountId);
  // Paid back is only ever part of an expense: nobody pays back income.
  const paidBackNumber = type === "expense" ? Number(form.paidBack) || 0 : 0;

  useEntryTip({ type, isEdit, calcOpen });

  // Reseed every time the sheet opens, so a cancelled entry never leaks into
  // the next one and an edit always starts from the row as it stands — unless
  // it's reopening on a save that failed, which puts the draft back.
  useEffect(() => {
    if (type === null) return;
    setForm(
      restore?.form ?? (editing ? formFrom(editing) : emptyForm(defaultAccountId()))
    );
    setErrors({});
    setFormError(restore?.message ?? "");
    setRepeat(restore?.repeat ?? false);
    // Held since the last save so a double tap on the closing sheet can't log
    // the entry twice; a fresh open is where it's let go.
    setSubmitting(false);
    categoryPicker.reset();
    setCalcOpen(false);
    setAccountPickerOpen(false);
    setPaidBackPickerOpen(false);
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





  const handleSubmit = async (e) => {
    e.preventDefault();

    const { description, amount, errors: nextErrors } = readDraft(form);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setFormError("");
      // Shake each invalid field to draw the eye to what needs fixing.
      Object.keys(nextErrors).forEach((field) =>
        shakeControls[field]?.start(SHAKE)
      );
      haptic("warning");
      return;
    }
    if (guard()) return;

    setErrors({});
    setFormError("");
    setSubmitting(true);
    if (isEdit) saveEdit({ description, amount });
    else saveAdd({ description, amount });
  };

  const { saveAdd, saveEdit } = useEntrySave({
    type,
    editing,
    form,
    repeat,
    paidBackNumber,
    mounted,
    openNow,
    onClose,
    onAdded,
    onUpdated,
    onSaved,
    onFailed,
  });
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
      <div data-tour="entry.keypad">
        <AmountCalculator
          initialValue={form[calcOpen]}
          // Money coming back reads as money coming in.
          tone={type === "income" || calcOpen === "paidBack" ? "success" : "destructive"}
          onCancel={closeCalculator}
          onApply={(value) => {
            updateForm({ [calcOpen]: String(value) });
            closeCalculator();
          }}
        />
      </div>
    ) : (
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        {/* Expense / Income. Only while adding: the API refuses a type change
            on an existing row, and the categories are per-type, so an edit that
            could flip this would silently invalidate its own category. */}
        {!isEdit && (
          <div data-tour="entry.type">
            <EntryTypeToggle value={type} onChange={setDraftType} />
          </div>
        )}

        {/* The amount is the hero of this sheet — see AmountHero. `data-filled`
            is how the setup guide knows a step is done without reaching into
            this form's state. */}
        <div data-tour="entry.amount" data-filled={form.amount !== "" ? "true" : "false"}>
          <AmountHero
            id="amount"
            amount={form.amount}
            type={type}
            error={errors.amount}
            shake={shakeControls.amount}
            onOpen={() => setCalcOpen("amount")}
          />
        </div>

        <div data-tour="entry.category" data-filled={form.category ? "true" : "false"}>
          <CategoryPicker
            idPrefix="tx"
            type={type}
            value={form.category}
            onChange={(name) => updateForm({ category: name })}
            error={errors.category}
            shake={shakeControls.category}
            picker={categoryPicker}
          />
        </div>

        <EntryDetails
          type={type}
          form={form}
          error={errors.date}
          shake={shakeControls.date}
          choice={accountChoice}
          pickerOpen={accountPickerOpen}
          setPickerOpen={setAccountPickerOpen}
          onChange={updateForm}
        />
        {/* Paid back: what friends returned for a shared bill. Expenses only.
            The amount above stays the whole bill — it's what left the account —
            and the budget counts the bill less this, on the bill's own date.
            The money usually comes back into a different account (PayWave out,
            PayNow back), so it asks where. Friends tend to pay a few days
            later, so this is as much for editing an entry as for adding one. */}
        {type === "expense" && (
          <PaidBackField
            type={type}
            amount={form.amount}
            paidBack={paidBackNumber}
            accountId={form.paidBackAccountId}
            error={errors.paidBack}
            shake={shakeControls.paidBack}
            choice={paidBackChoice}
            pickerOpen={paidBackPickerOpen}
            setPickerOpen={setPaidBackPickerOpen}
            onOpenCalculator={() => setCalcOpen("paidBack")}
            onChange={updateForm}
          />
        )}

        <EntryRepeat
          editing={editing}
          repeat={repeat}
          onRepeat={setRepeat}
          date={form.date}
        />

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
          data-tour="entry.submit"
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
