import { useEffect, useState } from "react";
import { useAnimationControls } from "framer-motion";
import {
  Plus,
  Pause,
  Play,
  Repeat,
  CalendarDays,
  ChevronDown,
} from "lucide-react";

import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import ConfirmRemove from "@/components/ConfirmRemove";
import {
  AccountOptions,
  AccountSelect,
  AmountHero,
  CategoryPicker,
  EntryTypeToggle,
  useAccountChoice,
  useCategoryPicker,
} from "@/components/EntryFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { SHAKE } from "@/animations/variants";
import { cn, formatMoney, localToday, ordinal } from "@/lib/utils";

// Short for the picker, long for the sentence describing a saved rule.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Monthly on the 1st" / "Weekly on Tuesday" — how a rule reads in the list. */
export function describeSchedule(rule) {
  return rule.frequency === "weekly"
    ? `Weekly on ${WEEKDAY_NAMES[rule.weekday] ?? "?"}`
    : `Monthly on the ${ordinal(rule.dayOfMonth ?? 1)}`;
}

const emptyForm = () => ({
  description: "",
  amount: "",
  type: "expense",
  category: "",
  accountId: "",
  frequency: "monthly",
  dayOfMonth: String(new Date().getDate()),
  weekday: String(new Date().getDay()),
  startKey: localToday(),
});

const formFrom = (rule) => ({
  description: rule.description,
  amount: String(rule.amount),
  type: rule.type,
  category: rule.category,
  accountId: rule.accountId ?? "",
  frequency: rule.frequency,
  dayOfMonth: String(rule.dayOfMonth ?? new Date().getDate()),
  weekday: String(rule.weekday ?? new Date().getDay()),
  startKey: rule.startKey,
});

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, i) => i + 1);

/**
 * Manage the entries that repeat — rent, a subscription, an allowance.
 *
 * A rule is a template, not a transaction. It writes a real entry on each due
 * date and then has no further hold over it, so the list here is about what
 * happens *next*: editing the rent changes future rent, and deleting the rule
 * leaves every month you already paid in the ledger.
 *
 * Nothing is back-filled. A rule can only start today or later, because writing
 * entries into days already lived through would rewrite the streak for them.
 *
 * The form is the add-transaction form with a schedule, built from the same
 * parts (components/EntryFields): amount first, the category grid, then the
 * facts that are usually already right. Where that form has its date, this one
 * has when the rule starts, and where it offers "Repeat Monthly", this one says
 * how it repeats.
 */
export default function RecurringSheet({ open, onClose, rules, onAdd, onUpdate, onRemove }) {
  const toast = useToast();
  const guard = useDemoGuard();
  const { getAccount } = useAccounts();

  // null = showing the list; "new" = adding; a rule id = editing that one.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  // The keypad replaces the form while it's open, as it does when adding a
  // transaction.
  const [calcOpen, setCalcOpen] = useState(false);
  const [accountPickerOpen, setAccountPickerOpen] = useState(false);
  const [dayPickerOpen, setDayPickerOpen] = useState(false);
  const categoryPicker = useCategoryPicker();
  const accountChoice = useAccountChoice(form.accountId);
  const shakeControls = {
    category: useAnimationControls(),
    amount: useAnimationControls(),
  };

  // Back to the list whenever the sheet is reopened, so it never resumes
  // half-way through an entry that was abandoned.
  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setConfirmId(null);
  }, [open]);

  // Every way into the form starts it clean: no keypad, nothing expanded.
  const openForm = (nextForm, id) => {
    setForm(nextForm);
    setErrors({});
    setFormError("");
    setCalcOpen(false);
    setAccountPickerOpen(false);
    setDayPickerOpen(false);
    categoryPicker.reset();
    setEditing(id);
  };

  const startAdding = () => {
    if (guard()) return;
    openForm(emptyForm(), "new");
  };

  const startEditing = (rule) => {
    if (guard()) return;
    openForm(formFrom(rule), rule.id);
  };

  // Same focus hand-back as the transaction sheet: closing the keypad unmounts
  // it, so put focus back on the amount rather than dropping it to <body>.
  const closeCalculator = () => {
    setCalcOpen(false);
    requestAnimationFrame(() => {
      document.getElementById("rule-amount")?.focus({ preventScroll: true });
    });
  };

  const update = (changes) => {
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
    const amount = Number(form.amount);
    const next = {};
    if (!form.category) next.category = "Choose a category.";
    if (form.amount === "" || !Number.isFinite(amount) || amount <= 0) {
      next.amount = "Enter an amount greater than $0.";
    }
    if (Object.keys(next).length > 0) {
      setErrors(next);
      Object.keys(next).forEach((field) => shakeControls[field]?.start(SHAKE));
      return;
    }
    if (guard()) return;

    // The description falls back to the category, exactly as it does when
    // adding a transaction by hand.
    const payload = {
      description: form.description.trim() || form.category,
      amount,
      type: form.type,
      category: form.category,
      accountId: form.accountId || null,
      frequency: form.frequency,
      ...(form.frequency === "monthly"
        ? { dayOfMonth: Number(form.dayOfMonth) }
        : { weekday: Number(form.weekday) }),
    };

    setSaving(true);
    try {
      if (editing === "new") {
        await onAdd({ ...payload, startKey: form.startKey });
        toast.success(`${payload.description} will repeat`);
      } else {
        // startKey is not editable: it only ever means "the day this began",
        // and moving it backwards would be a back-fill by another name.
        await onUpdate(editing, payload);
        toast.success("Repeating entry updated");
      }
      setEditing(null);
    } catch (err) {
      setFormError(err?.response?.data?.message || "Couldn't save this repeating entry.");
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async (rule) => {
    if (guard()) return;
    try {
      await onUpdate(rule.id, { paused: !rule.paused });
      toast.info(
        rule.paused ? `${rule.description} is back on` : `Paused ${rule.description}`
      );
    } catch {
      toast.error("Couldn't update that entry. Please try again.");
    }
  };

  const handleRemove = async (rule) => {
    if (guard()) return;
    try {
      await onRemove(rule.id);
      setConfirmId(null);
      toast.info(`Removed ${rule.description}`);
    } catch {
      setConfirmId(null);
      toast.error("Couldn't remove that entry. Please try again.");
    }
  };

  const dayOfMonth = Number(form.dayOfMonth);
  const weekday = Number(form.weekday);
  const scheduleLabel =
    form.frequency === "weekly"
      ? `Every ${WEEKDAY_NAMES[weekday]}`
      : `On the ${ordinal(dayOfMonth)} of each month`;

  return (
    <BottomSheet
      open={open}
      onClose={calcOpen ? closeCalculator : editing ? () => setEditing(null) : onClose}
      closeLabel={calcOpen ? "Back to form" : editing ? "Back to the list" : "Close dialog"}
      title={
        calcOpen
          ? "Calculator"
          : editing === "new"
            ? "New Repeating Entry"
            : editing
              ? "Edit Repeating Entry"
              : "Repeating Entries"
      }
    >
      {editing && calcOpen ? (
        <AmountCalculator
          initialValue={form.amount}
          tone={form.type === "income" ? "success" : "destructive"}
          onCancel={closeCalculator}
          onApply={(amount) => {
            update({ amount: String(amount) });
            closeCalculator();
          }}
        />
      ) : editing ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Unlike a logged transaction, a rule may change type when edited:
              the server re-checks the category against it, and the category is
              cleared here so it has to be chosen again. */}
          <EntryTypeToggle
            value={form.type}
            onChange={(type) => type !== form.type && update({ type, category: "" })}
          />

          <AmountHero
            id="rule-amount"
            amount={form.amount}
            type={form.type}
            error={errors.amount}
            shake={shakeControls.amount}
            onOpen={() => setCalcOpen(true)}
          />

          <CategoryPicker
            idPrefix="rule"
            type={form.type}
            value={form.category}
            onChange={(category) => update({ category })}
            error={errors.category}
            shake={shakeControls.category}
            picker={categoryPicker}
          />

          <div className="space-y-2.5">
            <Input
              id="rule-description"
              aria-label="Description"
              // As when adding a transaction, the placeholder is the name that
              // will be saved if this is left empty.
              placeholder={
                form.category || (form.type === "income" ? "e.g. Allowance" : "e.g. Rent")
              }
              value={form.description}
              maxLength={120}
              enterKeyHint="done"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.currentTarget.blur();
              }}
              onChange={(e) => update({ description: e.target.value })}
            />

            {/* The start date takes the place the transaction form gives its
                date, beside the account, and wraps the same way when the two
                don't fit. It's fixed once the rule exists — it only ever means
                the day this began, and moving it back would be a back-fill by
                another name — so an edit shows the account alone. */}
            {(editing === "new" || accountChoice.available) && (
              <div className="flex flex-wrap items-start gap-2.5">
                {editing === "new" && (
                  <Input
                    id="rule-start"
                    type="date"
                    aria-label="Starting from"
                    min={localToday()}
                    value={form.startKey}
                    onChange={(e) => update({ startKey: e.target.value })}
                    className="flex-1 basis-[9rem]"
                  />
                )}
                {accountChoice.available && (
                  <AccountSelect
                    type={form.type}
                    choice={accountChoice}
                    open={accountPickerOpen}
                    onToggle={() => setAccountPickerOpen((v) => !v)}
                    className="flex-1 basis-[9rem]"
                  />
                )}
              </div>
            )}

            {accountPickerOpen && accountChoice.available && (
              <AccountOptions
                type={form.type}
                choice={accountChoice}
                value={form.accountId}
                onChange={(accountId) => update({ accountId })}
                onClose={() => setAccountPickerOpen(false)}
              />
            )}

            {/* The rule can't reach backwards, so say what it will actually do
                rather than letting the first entry be a surprise. */}
            {editing === "new" && (
              <p className="text-[12px] leading-relaxed text-ink-3">
                Entries are added on each due date from here on. Anything before
                that you add yourself.
              </p>
            )}
          </div>

          {/* How it repeats — where the transaction form has its "Repeat
              Monthly" switch. The day reads as a field showing its value, like
              the account, and opens the choices inline. */}
          <div className="space-y-2.5">
            <p className="text-overline text-ink-3">Repeats</p>
            <div
              role="group"
              aria-label="How often"
              className="grid grid-cols-2 gap-0.5 rounded-md bg-surface-2 p-[3px]"
            >
              {[
                { value: "monthly", label: "Monthly" },
                { value: "weekly", label: "Weekly" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    update({ frequency: opt.value });
                    setDayPickerOpen(false);
                  }}
                  aria-pressed={form.frequency === opt.value}
                  className={`rounded-[9px] py-1.5 text-[13px] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    form.frequency === opt.value
                      ? "bg-surface font-semibold text-ink shadow-card"
                      : "font-medium text-ink-3 hover:text-ink-2 active:opacity-60"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setDayPickerOpen((v) => !v)}
              aria-expanded={dayPickerOpen}
              aria-label={`${scheduleLabel}. Choose day`}
              className="flex h-[46px] w-full min-w-0 items-center gap-2.5 rounded-md bg-surface-2 px-3.5 text-sm transition-colors duration-base ease-out hover:bg-surface-3 active:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <CalendarDays className="h-[15px] w-[15px] shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate text-left font-medium">
                {scheduleLabel}
              </span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
            </button>

            {dayPickerOpen && (
              <div
                role="group"
                aria-label={form.frequency === "weekly" ? "Day of the week" : "Day of the month"}
                className="grid grid-cols-7 gap-1.5 rounded-xl bg-surface-2 p-3"
              >
                {(form.frequency === "weekly" ? WEEKDAYS : DAYS_OF_MONTH).map((option, index) => {
                  const weekly = form.frequency === "weekly";
                  const selected = weekly ? weekday === index : dayOfMonth === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        update(weekly ? { weekday: String(index) } : { dayOfMonth: String(option) });
                        setDayPickerOpen(false);
                      }}
                      aria-pressed={selected}
                      aria-label={weekly ? WEEKDAY_NAMES[index] : ordinal(option)}
                      className={cn(
                        "num grid h-9 place-items-center rounded-[9px] text-[13px] font-medium transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected ? "bg-ink text-surface" : "bg-surface text-ink-2 hover:bg-surface-3 active:bg-hairline-strong"
                      )}
                    >
                      {weekly ? option.slice(0, 2) : option}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Said up front rather than discovered in February. */}
            {form.frequency === "monthly" && dayOfMonth > 28 && (
              <p className="text-[12px] text-ink-3">Shorter months use their last day.</p>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-md bg-negative/[0.08] px-3 py-2 text-[13px] font-medium text-negative">
              {formError}
            </p>
          )}

          {/* One button, as on the transaction form. Leaving without saving is
              the sheet's own close button, which steps back to the list. */}
          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Saving…" : editing === "new" ? "Add Repeating Entry" : "Save Changes"}
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          {rules.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-hairline-strong p-8 text-center">
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-md bg-surface-2 text-ink-3">
                <Repeat className="h-6 w-6" />
              </span>
              <p className="text-[13px] leading-relaxed text-ink-3">
                Rent, a subscription, an allowance — anything that lands on the
                same day each month. It gets added for you when the day comes.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {rules.map((rule) => {
                const account = getAccount(rule.accountId);
                return (
                  <li
                    key={rule.id}
                    className={`rounded-lg border border-hairline p-3 ${rule.paused ? "opacity-60" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => startEditing(rule)}
                        aria-label={`Edit ${rule.description}`}
                        className="-m-1 min-w-0 flex-1 rounded-sm p-1 text-left transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="truncate text-[15px] font-medium tracking-[-0.01em]">{rule.description}</span>
                          <span
                            className={`num shrink-0 text-[14px] font-medium ${
                              rule.type === "income" ? "text-positive" : "text-ink"
                            }`}
                          >
                            {rule.type === "income" ? "+" : "−"}
                            {formatMoney(rule.amount)}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-meta text-ink-3">
                          {describeSchedule(rule)} · {rule.category}
                          {account && <> · {account.name}</>}
                          {rule.paused && " · Paused"}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-1">
                        {/* Pausing steps aside while a removal is being
                            confirmed, as archiving does on bank accounts. */}
                        {confirmId !== rule.id && (
                          <button
                            type="button"
                            onClick={() => handlePause(rule)}
                            aria-label={`${rule.paused ? "Resume" : "Pause"} ${rule.description}`}
                            className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {rule.paused ? (
                              <Play className="h-4 w-4" />
                            ) : (
                              <Pause className="h-4 w-4" />
                            )}
                          </button>
                        )}
                        <ConfirmRemove
                          name={rule.description}
                          armed={confirmId === rule.id}
                          onArm={() => setConfirmId(rule.id)}
                          onConfirm={() => handleRemove(rule)}
                          onCancel={() => setConfirmId(null)}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* Deleting a rule leaves its history: worth saying, because the
              other list on this page (accounts) refuses deletion for exactly
              the opposite reason. */}
          {rules.length > 0 && (
            <p className="text-[12px] leading-relaxed text-ink-3">
              Removing a repeating entry stops it happening again. The entries it
              has already added stay in your ledger.
            </p>
          )}

          <Button onClick={startAdding} className="w-full gap-1.5">
            <Plus className="h-4 w-4" /> New Repeating Entry
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
