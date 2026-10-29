import { motion } from "framer-motion";
import { HandCoins, X } from "lucide-react";

import FieldError from "@/components/FieldError";
import { AccountOptions, AccountSelect } from "@/components/EntryFields";
import { cn, countedAmount, extraPaidBack, formatMoney } from "@/lib/utils";

/**
 * "Paid back by friends" on an expense: the figure, the account it came back
 * into, and a line saying what the budget counts. AddTransactionSheet owns the
 * draft; this draws it and reports changes through `onChange`, the sheet's own
 * updateForm, so editing here clears the field's error the same way.
 *
 * `amount` is the draft's amount as typed (a string), `paidBack` the paid-back
 * figure as a number, `accountId` where it landed.
 */
export default function PaidBackField({
  type,
  amount,
  paidBack,
  accountId,
  error,
  shake,
  choice,
  pickerOpen,
  setPickerOpen,
  onOpenCalculator,
  onChange,
}) {
  return (
    <div className="space-y-2.5" data-tour="entry.paid-back">
      <motion.div
        animate={shake}
        className="flex flex-wrap items-start gap-2.5"
      >
        <button
          type="button"
          id="paid-back"
          onClick={() => onOpenCalculator()}
          aria-label={
            paidBack > 0
              ? `Paid back by friends, ${paidBack.toFixed(2)} dollars. Opens calculator.`
              : "Paid back by friends, none. Opens calculator."
          }
          aria-invalid={Boolean(error)}
          aria-describedby={error ? "tx-paid-back-error" : undefined}
          className={cn(
            "flex h-[46px] w-full min-w-0 flex-1 basis-[9rem] items-center gap-2.5 rounded-md bg-surface-2 px-3.5 text-sm transition-colors duration-base ease-out hover:bg-surface-3 active:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            error && "ring-2 ring-negative"
          )}
        >
          <HandCoins className="h-[15px] w-[15px] shrink-0 text-ink-3" />
          {paidBack > 0 ? (
            <span className="num min-w-0 flex-1 truncate text-left font-medium text-positive">
              +{formatMoney(paidBack)} paid back
            </span>
          ) : (
            <span className="min-w-0 flex-1 truncate text-left text-ink-3">
              Paid back by friends
            </span>
          )}
        </button>

        {paidBack > 0 && choice.available && (
          <AccountSelect
            type="income"
            choice={choice}
            open={pickerOpen}
            onToggle={() => setPickerOpen((v) => !v)}
            className="flex-1 basis-[9rem]"
          />
        )}
      </motion.div>

      {pickerOpen && paidBack > 0 && choice.available && (
        <AccountOptions
          type="income"
          choice={choice}
          value={accountId}
          onChange={(id) => onChange({ paidBackAccountId: id })}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {error ? (
        <FieldError id="tx-paid-back-error">{error}</FieldError>
      ) : (
        paidBack > 0 && (
          <p className="flex items-center justify-between gap-3 text-[12px] leading-relaxed text-ink-3">
            {paidBack > Number(amount) ? (
              // A tip or a little extra on top. Past the bill it's
              // income, the way the server counts it.
              <span>
                Your budget doesn&apos;t count it, and the extra{" "}
                <b className="num font-medium text-positive">
                  {formatMoney(extraPaidBack({ type, amount: Number(amount) || 0, paidBack: paidBack }))}
                </b>{" "}
                counts as income.
              </span>
            ) : Number(amount) === paidBack ? (
              <span>Paid back in full, so your budget doesn&apos;t count it.</span>
            ) : (
              <span>
                Your share is{" "}
                <b className="num font-medium text-ink-2">
                  {formatMoney(countedAmount({ amount: Number(amount), paidBack: paidBack }))}
                </b>
                , and that&apos;s what your budget counts.
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                onChange({ paidBack: "", paidBackAccountId: "" });
                setPickerOpen(false);
              }}
              className="-my-1 flex shrink-0 items-center gap-1 rounded-sm px-1 py-1 font-medium text-ink-3 hover:text-ink active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="h-3.5 w-3.5" />
              Remove
            </button>
          </p>
        )
      )}
    </div>
  );
}
