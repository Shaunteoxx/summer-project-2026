import { useEffect, useRef, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Repeat } from "lucide-react";

import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import PaidBackField from "@/components/PaidBackField";
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
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useAccounts } from "@/hooks/useAccounts";
import { useEntrySave } from "@/hooks/useEntrySave";
import { haptic } from "@/lib/haptics";
import { useTour, useTourContext } from "@/tour/TourProvider";
import { cn } from "@/lib/utils";
import { SHAKE } from "@/animations/variants";
import { emptyForm, formFrom, pickEntryTip, repeatPlan } from "@/lib/entryDraft";


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
  const { defaultAccountId, hasAccounts } = useAccounts();
  const tour = useTourContext();

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

  // Which tip this opening gets, chosen as the sheet opens and held until it
  // closes — so finishing one doesn't queue the next up behind it. None while
  // editing: that entry has already happened. Asked for only while the form is
  // showing, since the keypad covers all three.
  const [openTip, setOpenTip] = useState(null);
  const wasOpen = useRef(false);
  // No dependency list on purpose: it runs after every render and acts only
  // when the sheet goes from closed to open, which the ref detects.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const open = type !== null;
    if (open === wasOpen.current) return;
    wasOpen.current = open;
    setOpenTip(open && !isEdit ? pickEntryTip(tour, { type, hasAccounts }) : null);
  });
  useTour(openTip, Boolean(openTip) && !calcOpen);

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

        {/* Three fields, no labels above them. The description carries the
            name that will be saved as its placeholder, and the date and
            account show their own values — a label over each would be a third
            row of text saying what the row already says. */}
        <div className="space-y-2.5" data-tour="entry.details">
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
                data-tour="entry.account"
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

        {/* Rent and subscriptions are realised at the moment you log them, not
            later in a settings screen — so the offer to repeat sits here,
            after the date it derives its schedule from. Editing an existing
            entry doesn't offer it: that entry has already happened, and its
            rule (if any) is managed on the More page. */}
        {!isEdit && (
          <div data-tour="entry.repeat">
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
          </div>
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
