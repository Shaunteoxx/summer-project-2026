import { Repeat } from "lucide-react";

import { useRecurring } from "@/hooks/useRecurring";

const FREQUENCY_LABEL = { monthly: "Monthly", weekly: "Weekly" };

/** The rule that wrote `transaction`, or null if it has none or it's been deleted. */
export function ruleFor(transaction, rules) {
  if (!transaction?.recurringId) return null;
  return rules.find((r) => String(r.id) === String(transaction.recurringId)) ?? null;
}

/**
 * Marks a row a repeating entry wrote, on every list that shows one.
 *
 * A word, not just the ↻ glyph. On its own the glyph read as "refresh" or
 * "sync", and at 12px in ink-3 it was easy to miss entirely — yet these are the
 * rows nobody typed, so they are the ones most likely to look unfamiliar.
 *
 * The word is the rule's frequency while the rule exists. A row whose rule has
 * since been deleted still came from one, so it keeps a plain "Repeats".
 */
export default function RepeatBadge({ transaction }) {
  const { rules } = useRecurring();
  if (!transaction?.recurringId) return null;
  const rule = ruleFor(transaction, rules);

  const label = FREQUENCY_LABEL[rule?.frequency] ?? "Repeats";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-surface-2 px-1.5 py-[3px] text-[11px] font-medium leading-none text-ink-2">
      <Repeat className="h-3 w-3" aria-hidden="true" />
      <span>{label}</span>
      <span className="sr-only"> repeating entry</span>
    </span>
  );
}
