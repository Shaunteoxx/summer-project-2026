import { motion } from "framer-motion";

import FieldError from "@/components/FieldError";
import { AccountOptions, AccountSelect } from "@/components/EntryFields";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The entry's description, date and account, the three facts that are usually
 * already right. AddTransactionSheet owns the draft; this draws it and reports
 * changes through `onChange`, the sheet's own updateForm, so typing here clears
 * a field's error the same way. `error` and `shake` are the date's, the one
 * field here that can be refused.
 */
export default function EntryDetails({
  type,
  form,
  error,
  shake,
  choice,
  pickerOpen,
  setPickerOpen,
  onChange,
}) {
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

  // Three fields, no labels above them. The description carries the
  // name that will be saved as its placeholder, and the date and
  // account show their own values — a label over each would be a third
  // row of text saying what the row already says.
  return (
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
        onChange={(e) => onChange({ description: e.target.value })}
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
        <motion.div animate={shake} className="flex-1 basis-[9rem]">
          <Input
            id="date"
            type="date"
            aria-label="Date"
            value={form.date}
            required
            aria-invalid={Boolean(error)}
            aria-describedby={error ? "tx-date-error" : undefined}
            className={cn(
              error && "border-destructive focus-visible:ring-destructive"
            )}
            onChange={(e) => onChange({ date: e.target.value })}
          />
          {error && (
            <FieldError id="tx-date-error">{error}</FieldError>
          )}
        </motion.div>

        {/* The account sits beside the date because it's the same kind of
            thing: a fact about the entry that is almost always already
            right. It reads as its value, and opens the chips when it
            isn't. Hidden entirely for anyone with no accounts, so the
            form is exactly as it was for them. */}
        {choice.available && (
          <AccountSelect
            type={type}
            choice={choice}
            open={pickerOpen}
            onToggle={() => setPickerOpen((v) => !v)}
            className="flex-1 basis-[9rem]"
            data-tour="entry.account"
          />
        )}
      </div>

      {pickerOpen && choice.available && (
        <AccountOptions
          type={type}
          choice={choice}
          value={form.accountId}
          onChange={(id) => onChange({ accountId: id })}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}
