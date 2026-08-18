import { useEffect, useState } from "react";
import { Plus, Pause, Play, Trash2, Repeat, Check } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { formatMoney, localToday, ordinal } from "@/lib/utils";

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
 */
export default function RecurringSheet({ open, onClose, rules, onAdd, onUpdate, onRemove }) {
  const toast = useToast();
  const guard = useDemoGuard();
  const { categoriesByType } = useCategories();
  const { active: accounts, hasAccounts, getAccount } = useAccounts();

  // null = showing the list; "new" = adding; a rule id = editing that one.
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  // Back to the list whenever the sheet is reopened, so it never resumes
  // half-way through an entry that was abandoned.
  useEffect(() => {
    if (!open) return;
    setEditing(null);
    setConfirmId(null);
  }, [open]);

  const startAdding = () => {
    if (guard()) return;
    setForm(emptyForm());
    setErrors({});
    setFormError("");
    setEditing("new");
  };

  const startEditing = (rule) => {
    if (guard()) return;
    setForm(formFrom(rule));
    setErrors({});
    setFormError("");
    setEditing(rule.id);
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
    if (form.frequency === "monthly") {
      const day = Number(form.dayOfMonth);
      if (!Number.isInteger(day) || day < 1 || day > 31) {
        next.dayOfMonth = "Pick a day between 1 and 31.";
      }
    }
    if (Object.keys(next).length > 0) return setErrors(next);
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

  const categories = categoriesByType[form.type] ?? [];

  return (
    <BottomSheet
      open={open}
      onClose={editing ? () => setEditing(null) : onClose}
      closeLabel={editing ? "Back to the list" : "Close dialog"}
      title={
        editing === "new"
          ? "New Repeating Entry"
          : editing
            ? "Edit Repeating Entry"
            : "Repeating entries"
      }
    >
      {editing ? (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {/* Income or expense. Fixed for the life of the rule on the server,
              but free to choose while writing one. */}
          <div role="group" aria-label="Type" className="flex gap-0.5 rounded-md bg-surface-2 p-[3px]">
            {["expense", "income"].map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => update({ type: option, category: "" })}
                aria-pressed={form.type === option}
                className={`flex-1 rounded-[9px] px-3 py-1.5 text-[13px] capitalize transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  form.type === option
                    ? "bg-surface font-semibold text-ink shadow-card dark:bg-surface-3"
                    : "font-medium text-ink-3 hover:text-ink-2"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label className={errors.category ? "text-negative" : undefined}>
              Category
            </Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => {
                const selected = form.category === c.name;
                return (
                  <button
                    type="button"
                    key={c.name}
                    onClick={() => update({ category: c.name })}
                    aria-pressed={selected}
                    className={`flex h-9 items-center gap-2 rounded-sm border px-3 text-[13px] font-medium transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected ? "border-transparent" : "border-hairline-strong text-ink-2 hover:bg-surface-2"
                    }`}
                    style={
                      selected
                        ? { backgroundColor: `${c.color}22`, borderColor: c.color }
                        : undefined
                    }
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-[3px]"
                      style={{ background: c.color }}
                    />
                    {c.name}
                  </button>
                );
              })}
            </div>
            {errors.category && <FieldError>{errors.category}</FieldError>}
          </div>

          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor="rule-description">Description</Label>
              <span className="text-[12px] text-ink-3">Optional</span>
            </div>
            <Input
              id="rule-description"
              placeholder={form.category || "e.g. Rent"}
              value={form.description}
              maxLength={120}
              onChange={(e) => update({ description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label
              htmlFor="rule-amount"
              className={errors.amount ? "text-negative" : undefined}
            >
              Amount
            </Label>
            <Input
              id="rule-amount"
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={(e) => update({ amount: e.target.value })}
              className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
            />
            {errors.amount && <FieldError>{errors.amount}</FieldError>}
          </div>

          <div className="space-y-2">
            <Label>How Often</Label>
            <div role="group" aria-label="How often" className="flex gap-0.5 rounded-md bg-surface-2 p-[3px]">
              {["monthly", "weekly"].map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => update({ frequency: option })}
                  aria-pressed={form.frequency === option}
                  className={`flex-1 rounded-[9px] px-3 py-1.5 text-[13px] capitalize transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    form.frequency === option
                      ? "bg-surface font-semibold text-ink shadow-card dark:bg-surface-3"
                      : "font-medium text-ink-3 hover:text-ink-2"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          {form.frequency === "monthly" ? (
            <div className="space-y-2">
              <Label
                htmlFor="rule-day"
                className={errors.dayOfMonth ? "text-negative" : undefined}
              >
                Day of the Month
              </Label>
              <Input
                id="rule-day"
                type="number"
                inputMode="numeric"
                min="1"
                max="31"
                value={form.dayOfMonth}
                onChange={(e) => update({ dayOfMonth: e.target.value })}
                className="[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
              />
              {/* Said up front rather than discovered in February. */}
              {Number(form.dayOfMonth) > 28 && !errors.dayOfMonth && (
                <p className="text-[12px] text-ink-3">
                  Shorter months use their last day.
                </p>
              )}
              {errors.dayOfMonth && <FieldError>{errors.dayOfMonth}</FieldError>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Day of the Week</Label>
              <div role="group" aria-label="Day of the week" className="flex flex-wrap gap-2">
                {WEEKDAYS.map((label, index) => {
                  const selected = Number(form.weekday) === index;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => update({ weekday: String(index) })}
                      aria-pressed={selected}
                      className={`h-9 w-12 rounded-sm border text-[13px] font-medium transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? "border-transparent bg-ink text-surface"
                          : "border-hairline-strong text-ink-2 hover:bg-surface-2"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {hasAccounts && (
            <div className="space-y-2">
              <Label id="rule-account-label">
                {form.type === "income" ? "Paid Into" : "Paid From"}
              </Label>
              <div
                role="group"
                aria-labelledby="rule-account-label"
                className="flex flex-wrap gap-2"
              >
                {accounts.map((a) => {
                  const selected = form.accountId === a.id;
                  return (
                    <button
                      type="button"
                      key={a.id}
                      onClick={() => update({ accountId: selected ? "" : a.id })}
                      aria-pressed={selected}
                      className={`flex h-9 items-center gap-2 rounded-sm border px-3 text-[13px] font-medium transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected ? "border-transparent" : "border-hairline-strong text-ink-2 hover:bg-surface-2"
                      }`}
                      style={
                        selected
                          ? { backgroundColor: `${a.color}22`, borderColor: a.color }
                          : undefined
                      }
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-[3px]"
                        style={{ background: a.color }}
                      />
                      {a.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {editing === "new" && (
            <div className="space-y-2">
              <Label htmlFor="rule-start">Starting From</Label>
              <Input
                id="rule-start"
                type="date"
                min={localToday()}
                value={form.startKey}
                onChange={(e) => update({ startKey: e.target.value })}
              />
              {/* The rule can't reach backwards, so say what it will actually
                  do rather than letting the first entry be a surprise. */}
              <p className="text-[12px] leading-relaxed text-ink-3">
                Entries are added on each due date from here on. Anything before
                that you add yourself.
              </p>
            </div>
          )}

          {formError && (
            <p role="alert" className="rounded-md bg-negative/[0.08] px-3 py-2 text-[13px] font-medium text-negative">
              {formError}
            </p>
          )}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={saving}>
              {saving ? "Saving…" : editing === "new" ? "Add Repeating Entry" : "Save Changes"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
          </div>
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
                        className="-m-1 min-w-0 flex-1 rounded-sm p-1 text-left transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                        <button
                          type="button"
                          onClick={() => handlePause(rule)}
                          aria-label={`${rule.paused ? "Resume" : "Pause"} ${rule.description}`}
                          className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {rule.paused ? (
                            <Play className="h-4 w-4" />
                          ) : (
                            <Pause className="h-4 w-4" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            confirmId === rule.id
                              ? handleRemove(rule)
                              : setConfirmId(rule.id)
                          }
                          aria-label={
                            confirmId === rule.id
                              ? `Confirm removing ${rule.description}`
                              : `Remove ${rule.description}`
                          }
                          className={`flex h-9 items-center justify-center gap-1 rounded-sm px-2 text-[12px] font-semibold transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                            confirmId === rule.id
                              ? "bg-negative/[0.08] text-negative"
                              : "w-9 text-ink-3 hover:bg-negative/[0.08] hover:text-negative"
                          }`}
                        >
                          {confirmId === rule.id ? (
                            <>
                              <Check className="h-4 w-4" /> Sure?
                            </>
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </button>
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
