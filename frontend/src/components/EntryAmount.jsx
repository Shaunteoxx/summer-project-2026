import { cn, formatMoney, rowAmount } from "@/lib/utils";

/**
 * An entry's figure at the end of a list row: a green plus for income, and for
 * a bill friends paid back more than (the extra is what it brought in);
 * otherwise what it cost, signed, in ink.
 *
 * Expenses are ink, not red. Spending is the normal case in a spending
 * tracker, and red has to still mean "over budget" when it appears.
 *
 * Used by Transactions, Home's Recent list and the calendar's day sheet, so an
 * entry reads the same in all three.
 */
export default function EntryAmount({ entry }) {
  const { gain, value } = rowAmount(entry);
  return (
    <span
      className={cn(
        "num shrink-0 text-[15px] font-medium",
        gain ? "text-positive" : "text-ink"
      )}
    >
      {gain ? "+" : "−"}
      {formatMoney(value)}
    </span>
  );
}
