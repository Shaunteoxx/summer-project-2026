import { useState } from "react";
import { Check, X } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCategories } from "@/hooks/useCategories";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { CUSTOM_COLOR_OPTIONS } from "@/lib/categories";

const TYPES = [
  { value: "expense", label: "Expense" },
  { value: "income", label: "Income" },
];

/**
 * Manage your own categories: the built-in five and three aren't listed,
 * because there is nothing to do to them.
 *
 * This lives on More, next to Bank accounts and Repeating entries, which are
 * the same shape of thing: used constantly in the entry sheet, managed from
 * here. Deleting used to hang off the entry sheet's "+ New" panel, which meant
 * pressing a button labelled New when what you wanted was to remove something.
 *
 * Creating stays in the entry sheet as well as here. That isn't duplication for
 * its own sake — you discover a missing category at the moment you're logging
 * something, and sending you to a settings screen would lose the entry you were
 * part-way through writing.
 *
 * Deletes are confirmed in place, the same two-step the accounts sheet uses:
 * one tap arms, the tick commits. Nothing here is undoable once it goes.
 */
export default function CategoriesSheet({ open, onClose }) {
  const { custom, addCategory, removeCategory } = useCategories();
  const toast = useToast();
  const guard = useDemoGuard();

  const [type, setType] = useState("expense");
  const [name, setName] = useState("");
  const [color, setColor] = useState(CUSTOM_COLOR_OPTIONS[0]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Id of the category awaiting an inline "really delete?" confirmation.
  const [confirmId, setConfirmId] = useState(null);

  const mine = custom.filter((c) => c.type === type);

  const handleAdd = async () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the category a name.");
    if (guard()) return;
    setSaving(true);
    try {
      await addCategory({ name: trimmed, type, color });
      setName("");
      setColor(CUSTOM_COLOR_OPTIONS[0]);
      setError("");
      toast.success(`Added ${trimmed}`);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't add that category.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (category) => {
    if (guard()) return;
    try {
      await removeCategory(category.id);
      setConfirmId(null);
      toast.info(`Removed ${category.name}`);
    } catch (err) {
      setConfirmId(null);
      toast.error(
        err?.response?.data?.message || "Couldn't remove that category."
      );
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Categories">
      <div className="space-y-4">
        <p className="text-[13px] leading-relaxed text-ink-3">
          The built-in categories are always there. These are the ones you added
          — entries already filed under a deleted one keep their label.
        </p>

        {/* Income and expense categories are separate sets, the same way they
            are in the entry sheet, so this picks which set is being managed. */}
        <div
          className="grid grid-cols-2 gap-0.5 rounded-md bg-surface-2 p-[3px]"
          role="group"
          aria-label="Category type"
        >
          {TYPES.map((opt) => (
            <button
              key={opt.value}
              type="button"
              aria-pressed={type === opt.value}
              onClick={() => {
                setType(opt.value);
                setConfirmId(null);
                setError("");
              }}
              className={`rounded-[9px] py-1.5 text-[13px] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                type === opt.value
                  ? "bg-surface font-semibold text-ink shadow-card dark:bg-surface-3"
                  : "font-medium text-ink-3 hover:text-ink-2"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {mine.length > 0 ? (
          <ul className="space-y-1.5">
            {mine.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 rounded-lg border border-hairline p-2.5"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ background: c.color }}
                  />
                  <span className="truncate text-sm font-medium">{c.name}</span>
                </span>

                {confirmId === c.id ? (
                  <span className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDelete(c)}
                      aria-label={`Confirm removing ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-sm text-negative transition-colors duration-base ease-out hover:bg-negative/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmId(null)}
                      aria-label={`Keep ${c.name}`}
                      className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(c.id)}
                    aria-label={`Remove ${c.name}`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-negative/[0.08] hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-hairline-strong p-4 text-center text-[13px] text-ink-3">
            No categories of your own yet
            {type === "income" ? " for income" : ""}.
          </p>
        )}

        <div className="space-y-3 border-t border-hairline pt-4">
          <p className="text-overline text-ink-3">Add one</p>
          <Input
            placeholder="Category name"
            aria-label="Category name"
            value={name}
            maxLength={24}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
          <div className="flex flex-wrap gap-2.5">
            {CUSTOM_COLOR_OPTIONS.map((col) => (
              <button
                type="button"
                key={col}
                onClick={() => setColor(col)}
                aria-label={`Colour ${col}`}
                aria-pressed={color === col}
                className="h-[30px] w-[30px] rounded-[9px] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                style={{
                  backgroundColor: col,
                  boxShadow:
                    color === col
                      ? "0 0 0 2px hsl(var(--surface)), 0 0 0 3.5px hsl(var(--ink))"
                      : undefined,
                }}
              />
            ))}
          </div>
          {error && <FieldError>{error}</FieldError>}
          <Button
            type="button"
            onClick={handleAdd}
            disabled={!name.trim() || saving}
            className="w-full"
          >
            {saving ? "Adding…" : "Add category"}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
