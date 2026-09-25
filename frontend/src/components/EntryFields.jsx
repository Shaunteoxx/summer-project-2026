import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Wallet, ChevronDown, Check, Tag } from "lucide-react";

import FieldError from "@/components/FieldError";
import SegmentPill from "@/components/SegmentPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useCategories } from "@/hooks/useCategories";
import { useAccounts } from "@/hooks/useAccounts";
import { cn } from "@/lib/utils";
import { CUSTOM_COLOR_OPTIONS } from "@/lib/categories";

/**
 * The pieces an entry form is built from, shared by the add-transaction sheet
 * and the repeating-entry sheet.
 *
 * A repeating entry is a transaction with a schedule, so its form should look
 * and behave like the one people already know. It used to be a separate,
 * older layout — labelled inputs and chips — that drifted further from the
 * entry sheet with every change made there. One set of parts keeps them the
 * same thing.
 *
 * Nothing here owns the form. Values come in as props and go out through
 * onChange, and the little bits of open/closed state that must survive the
 * keypad replacing the form live in the parent via the hooks below.
 */

/** Expense / Income, as a segmented control. */
export function EntryTypeToggle({ value, onChange }) {
  return (
    <div
      className="relative grid grid-cols-2 gap-0.5 rounded-md bg-surface-2 p-[3px]"
      role="group"
      aria-label="Entry type"
    >
      <SegmentPill index={value === "income" ? 1 : 0} count={2} />
      {[
        { value: "expense", label: "Expense" },
        { value: "income", label: "Income" },
      ].map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`relative rounded-[9px] py-1.5 text-[13px] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === opt.value
              ? "font-semibold text-ink"
              : "font-medium text-ink-3 hover:text-ink-2 active:opacity-60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The amount, as the hero of the form. Tapping it opens the keypad, which the
 * parent swaps in for the form.
 *
 * The amount is the one field that is never optional and never guessable, and
 * at 44px it's legible from the moment the sheet lands — which is what the old
 * 44px-tall input, sharing a row with the date, was not.
 *
 * One control on every device, not a keypad on phones and a text input on
 * desktop: the keypad takes digits, operators, backspace and Enter from a
 * hardware keyboard, so there is nothing left for the plain input to be better
 * at.
 */
export function AmountHero({ id, amount, type, error, shake, onOpen }) {
  // The keypad is the only source of this value, so it's always a clean number
  // or empty — safe to render at a fixed 2dp.
  const amountNumber = Number(amount);
  const amountSet = amount !== "" && Number.isFinite(amountNumber);
  const amountDisplay = amountSet ? amountNumber.toFixed(2) : "0.00";
  // The sign rides the number, as on the Home hero: this is the figure the
  // entry is, not a sum with an operator applied to it later.
  const amountSign = amountSet ? (type === "income" ? "+" : "−") : "";
  const errorId = `${id}-error`;

  return (
    <motion.div animate={shake} className="text-center">
      <p className={`text-overline ${error ? "text-negative" : "text-ink-3"}`}>Amount</p>
      <button
        type="button"
        id={id}
        onClick={onOpen}
        aria-label={
          amountSet
            ? `Amount, ${amountDisplay} dollars. Opens calculator.`
            : "Amount, not set. Opens calculator."
        }
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={cn(
          "num-display mt-1.5 w-full rounded-md py-1 text-[44px] leading-[1.1] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          !amountSet && "text-ink-3",
          amountSet && type === "income" && "text-positive"
        )}
      >
        {amountSign}${amountDisplay}
      </button>
      {error && (
        <FieldError id={errorId} className="justify-center">
          {error}
        </FieldError>
      )}
    </motion.div>
  );
}

/**
 * How many categories the six-across grid will show before the picker
 * collapses to a field and a list. Two full rows: a third row is 81px the
 * sheet doesn't have on a short phone, and by then the tiles are being read
 * as names rather than recognised as icons.
 */
const CATEGORY_GRID_MAX = 12;

/**
 * The category picker's own open/closed state, held by the parent.
 *
 * Held there rather than inside the picker because the keypad replaces the
 * form while it's open, which unmounts the picker — and a half-typed new
 * category shouldn't vanish because the amount was tapped in between.
 */
export function useCategoryPicker() {
  // Only used in list mode; the grid is always open.
  const [listOpen, setListOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(CUSTOM_COLOR_OPTIONS[0]);
  const [saving, setSaving] = useState(false);

  const resetNew = () => {
    setShowNew(false);
    setNewName("");
    setNewColor(CUSTOM_COLOR_OPTIONS[0]);
  };

  return {
    listOpen,
    setListOpen,
    showNew,
    setShowNew,
    newName,
    setNewName,
    newColor,
    setNewColor,
    saving,
    setSaving,
    resetNew,
    reset: () => {
      resetNew();
      setListOpen(false);
    },
  };
}

/**
 * Selecting a category does exactly that, and nothing else.
 *
 * It used to hand focus straight to the description to save a tap. In practice
 * that jerked the OS keyboard up over the sheet mid-scroll on every category
 * tap — including the taps that were only correcting a mis-tap — which cost
 * more in disruption than the tap it saved.
 */
export function CategoryPicker({ idPrefix, type, value, onChange, error, shake, picker }) {
  const toast = useToast();
  const guard = useDemoGuard();
  const { categoriesByType, getCategory, addCategory } = useCategories();

  // The grid is six across, so twelve is exactly two rows — the most it can
  // show without the sheet getting taller than the screen it opens on. Past
  // that it becomes a field and a list, which costs one tap and a fixed 44px
  // however many categories you have.
  //
  // An entry can be filed under a category that has since been deleted. Show
  // it alongside the live ones so the tag reads as it is rather than as
  // cleared — the same thing the account picker does for an archived account,
  // and the same promise the Categories sheet makes: entries already filed
  // under a deleted category keep their label.
  //
  // `getCategory` answers with a neutral grey Tag for a name it doesn't know,
  // so an orphan renders exactly as it does in the ledger and reads as the odd
  // one out without needing a badge.
  const liveCategories = categoriesByType[type] ?? [];
  const orphanCategory =
    value && !liveCategories.some((c) => c.name === value)
      ? getCategory(value)
      : null;
  const categoryList = orphanCategory ? [...liveCategories, orphanCategory] : liveCategories;
  const useGrid = categoryList.length <= CATEGORY_GRID_MAX;
  const selectedCategory = categoryList.find((c) => c.name === value);
  const errorId = `${idPrefix}-category-error`;

  const handleAddCategory = async () => {
    const name = picker.newName.trim();
    if (!name) return;
    if (guard()) return;
    picker.setSaving(true);
    try {
      const created = await addCategory({ name, type, color: picker.newColor });
      // Same hand-off as tapping an existing tile — you've just chosen a
      // category either way.
      onChange(created.name);
      picker.resetNew();
      toast.success(`Added category “${created.name}”`);
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't add category. Please try again.");
    } finally {
      picker.setSaving(false);
    }
  };

  return (
    <div className="space-y-2">
      <motion.div animate={shake} className="space-y-2">
        {/* "New" sits on the label line, not in the grid. As a tile it works
            right up until the grid becomes a list — and it has to, once there
            are more categories than fit — at which point a create affordance
            shaped like a category tile has nowhere to live. On the label line
            it reads the same in both modes. */}
        <div className="flex items-center justify-between gap-2">
          <p className={`text-overline ${error ? "text-negative" : "text-ink-3"}`}>Category</p>
          <button
            type="button"
            onClick={() => picker.setShowNew((v) => !v)}
            aria-expanded={picker.showNew}
            className={`-my-1 flex h-8 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              picker.showNew ? "bg-ink/[0.06] text-ink" : "text-ink-3 hover:bg-surface-2 active:bg-surface-3 hover:text-ink"
            }`}
          >
            <Plus className="h-3.5 w-3.5" />
            New
          </button>
        </div>

        {useGrid ? (
          <div
            className={`grid grid-cols-6 gap-[7px] ${
              error ? "rounded-sm ring-2 ring-negative ring-offset-4 ring-offset-surface" : ""
            }`}
          >
            {categoryList.map((c) => {
              const Icon = c.icon;
              const selected = !picker.showNew && value === c.name;
              return (
                <button
                  type="button"
                  key={c.name}
                  onClick={() => onChange(c.name)}
                  aria-pressed={selected}
                  // The tile may show a short label; the full name is what the
                  // entry is filed under, so that's what it announces.
                  aria-label={c.name}
                  className="group flex flex-col items-center gap-1.5 rounded-[11px] text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <span
                    className={`grid aspect-square w-full place-items-center rounded-[11px] transition-colors duration-base ease-out ${
                      selected ? "" : "bg-surface-2 group-hover:bg-surface-3 active:bg-hairline-strong"
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
                    <Icon className="h-[17px] w-[17px]" strokeWidth={selected ? 2.2 : 2} />
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
          /* Past two rows the grid stops paying for itself: it costs a row of
             81px per six categories, and at that size the icon has stopped
             being the thing you recognise — you're reading the names anyway.
             So it collapses to the value plus a list, the same shape the
             account field uses. */
          <>
            <button
              type="button"
              onClick={() => picker.setListOpen((v) => !v)}
              aria-expanded={picker.listOpen}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className={cn(
                "flex h-11 w-full items-center gap-2.5 rounded-md bg-surface-2 px-3.5 text-sm transition-colors duration-base ease-out hover:bg-surface-3 active:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                error && "ring-2 ring-negative"
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

            {picker.listOpen && (
              <ul
                // Capped and scrolled in place. The sheet scrolls too, but a
                // list that pushed the amount and the submit button off screen
                // every time it opened would make choosing a category cost a
                // scroll back up.
                className="max-h-[248px] space-y-0.5 overflow-y-auto overscroll-contain rounded-xl bg-surface-2 p-2"
              >
                {categoryList.map((c) => {
                  const Icon = c.icon;
                  const selected = value === c.name;
                  return (
                    <li key={c.name}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(c.name);
                          picker.setListOpen(false);
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
                          style={{ backgroundColor: `${c.color}26`, color: c.color }}
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
        {error && <FieldError id={errorId}>{error}</FieldError>}
      </motion.div>

      {/* Create only. Deleting lives on More → Categories, with the accounts
          and repeating entries — the same shape of thing, used here and
          managed there. It briefly lived in this panel, which meant pressing a
          button labelled "New" to remove something. */}
      {picker.showNew && (
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-[13.5px] font-semibold tracking-[-0.01em]">New Category</p>
          <Input
            placeholder="Category name"
            value={picker.newName}
            maxLength={24}
            onChange={(e) => picker.setNewName(e.target.value)}
            className="mt-2.5 bg-surface"
          />
          <p className="mb-2 mt-3.5 text-overline text-ink-3">Colour</p>
          <div className="flex flex-wrap gap-2.5">
            {CUSTOM_COLOR_OPTIONS.map((col) => (
              <button
                type="button"
                key={col}
                onClick={() => picker.setNewColor(col)}
                aria-label={`Colour ${col}`}
                aria-pressed={picker.newColor === col}
                // Ringed in ink with a gap in the panel's own surface, so the
                // marker reads at every hue — a border in the swatch colour
                // disappears on the swatch it's marking.
                className="h-[30px] w-[30px] rounded-[9px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2"
                style={{
                  backgroundColor: col,
                  boxShadow:
                    picker.newColor === col
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
              onClick={picker.resetNew}
              className="h-10 flex-1 bg-surface text-sm"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleAddCategory}
              disabled={!picker.newName.trim() || picker.saving}
              className="h-10 flex-1 text-sm"
            >
              {picker.saving ? "Creating…" : "Create"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Which accounts an entry can be tagged to, given the one it has now.
 *
 * An older entry can be tagged to an account that has since been archived.
 * It's listed beside the active ones so the tag reads as it is rather than as
 * cleared; moving off it is one-way, which is what archiving means.
 */
export function useAccountChoice(accountId) {
  const { active: accounts, hasAccounts, getAccount } = useAccounts();
  const taggedAccount =
    accountId && !accounts.some((a) => a.id === accountId) ? getAccount(accountId) : null;
  return {
    pickable: taggedAccount ? [...accounts, taggedAccount] : accounts,
    selected: accountId ? getAccount(accountId) : null,
    // Hidden entirely for anyone with no accounts, so the form is exactly as
    // it was for them.
    available: Boolean(hasAccounts || taggedAccount),
  };
}

/**
 * The account field. It reads as its value, because that's how it's used —
 * the default is remembered and usually right, so the common case is
 * confirming it rather than choosing. The options open inline below; see
 * AccountOptions.
 */
export function AccountSelect({ type, choice, open, onToggle, className, ...rest }) {
  const { selected } = choice;
  return (
    <button
      {...rest}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${type === "income" ? "Paid into" : "Paid from"}: ${
        selected ? selected.name : "no account"
      }. Choose account`}
      className={cn(
        "flex h-[46px] w-full min-w-0 items-center gap-2.5 rounded-md bg-surface-2 px-3.5 text-sm transition-colors duration-base ease-out hover:bg-surface-3 active:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {selected ? (
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: selected.color }} />
      ) : (
        <Wallet className="h-[15px] w-[15px] shrink-0 text-ink-3" />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate text-left font-medium",
          !selected && "font-normal text-ink-3"
        )}
      >
        {selected ? selected.name : "No account"}
      </span>
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-3" />
    </button>
  );
}

/** The account chips the field opens. Picking one closes them. */
export function AccountOptions({ type, choice, value, onChange, onClose }) {
  return (
    <div
      role="group"
      aria-label={type === "income" ? "Paid into" : "Paid from"}
      className="flex flex-wrap gap-2 rounded-xl bg-surface-2 p-3"
    >
      {choice.pickable.map((a) => {
        const selected = value === a.id;
        return (
          <button
            type="button"
            key={a.id}
            // Tapping the selected chip clears it. Without that a mis-tag is
            // unfixable: there is no "none" chip, and every other tap only ever
            // moves the tag somewhere else.
            onClick={() => {
              onChange(selected ? "" : a.id);
              onClose();
            }}
            aria-pressed={selected}
            className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface-2 ${
              selected
                ? "border-transparent"
                : "border-hairline-strong bg-surface text-ink-2 hover:bg-surface-3 active:bg-hairline-strong"
            }`}
            style={selected ? { backgroundColor: `${a.color}22`, borderColor: a.color } : undefined}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            {a.name}
          </button>
        );
      })}
    </div>
  );
}
