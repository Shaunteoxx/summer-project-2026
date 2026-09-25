import { Trash2, X } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The remove control on every managed list — bank accounts, categories and
 * repeating entries — so deleting works the same way wherever you do it.
 *
 * Two taps. The bin arms it; the row then shows a red "Remove" pill that
 * commits, beside a ✕ that backs out.
 *
 * The three lists used to do this three ways: a bin that turned into a red ✓
 * and a ✕, the same pair behind a ✕ (so one glyph both started a delete and
 * cancelled it), and a bin that turned into "✓ Sure?" with no way back. The
 * confirm is a word because a lone tick beside a cross doesn't say which of
 * them deletes; the ✕ stays because an armed delete you can't step back from
 * is a trap.
 *
 * The parent owns which row is armed, so arming one disarms any other.
 */
export default function ConfirmRemove({ name, armed, onArm, onConfirm, onCancel, disabled }) {
  if (!armed) {
    return (
      <button
        type="button"
        onClick={onArm}
        disabled={disabled}
        aria-label={`Remove ${name}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-negative/[0.08] active:bg-negative/[0.14] hover:text-negative disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onConfirm}
        disabled={disabled}
        // Contains the visible word, so voice control can say what it sees.
        aria-label={`Yes, remove ${name}`}
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-sm bg-negative/[0.08] px-2.5 text-[12.5px] font-semibold text-negative transition-colors duration-base ease-out hover:bg-negative/[0.14] active:bg-negative/[0.2] disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
        )}
      >
        <Trash2 className="h-3.5 w-3.5" />
        Remove
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={disabled}
        aria-label={`Keep ${name}`}
        className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 hover:text-ink disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="h-4 w-4" />
      </button>
    </span>
  );
}
