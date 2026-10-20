import { useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import SwitchRow from "@/components/SwitchRow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useToast } from "@/hooks/useToast";
import { emitTour } from "@/tour/signals";
import { monthName } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { setMonthlySavings, updatePeriod } from "@/api/endpoints";
import { SHAKE } from "@/animations/variants";

/**
 * The savings target: a month's in month and term mode, with a stepper to set
 * others ahead of time, or the running period's own in days mode.
 */
export default function SavingsTargetSheet({ open, onClose }) {
  const { user, refresh } = useAuth();
  const period = useBudgetPeriod();
  const toast = useToast();
  const isDays = period.mode === "days";
  // Term cycles are calendar months, so everything here follows the month path
  // except the sentence explaining where the target comes from.
  const isTerm = period.mode === "term";
  const [savingsInput, setSavingsInput] = useState("");
  const [savingSavings, setSavingSavings] = useState(false);
  const [savingsError, setSavingsError] = useState("");
  const savingsShake = useAnimationControls();
  const now = new Date();
  const [savingsYear, setSavingsYear] = useState(now.getFullYear());
  const [savingsMonth, setSavingsMonth] = useState(now.getMonth());
  // Carry the target into each new month instead of re-entering it. Per-user
  // rather than per-month, so it's seeded from the profile every time the sheet
  // opens rather than from whichever month the stepper is on.
  const [repeatSavings, setRepeatSavings] = useState(false);

  const savingsByMonth = user?.savingsByMonth ?? {};
  const keyFor = (y, m) => `${y}-${m}`;

  const loadSavingsInput = (y, m) => {
    const v = savingsByMonth[keyFor(y, m)];
    setSavingsInput(v ? String(v) : "");
    setSavingsError("");
  };

  useEffect(() => {
    if (!open) return;
    if (isDays) {
      // Days mode edits the running period's own target — there's no month to
      // step through. The page only opens this with a period running.
      setSavingsInput(period.current?.savings ? String(period.current.savings) : "");
      setSavingsError("");
      return;
    }
    const today = new Date();
    setSavingsYear(today.getFullYear());
    setSavingsMonth(today.getMonth());
    loadSavingsInput(today.getFullYear(), today.getMonth());
    setRepeatSavings(!!user?.repeatSavings);
    // Only on opening. Re-seeding on a refresh would wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const stepSavingsMonth = (delta) => {
    let y = savingsYear;
    let m = savingsMonth + delta;
    if (m < 0) {
      m = 11;
      y -= 1;
    } else if (m > 11) {
      m = 0;
      y += 1;
    }
    setSavingsYear(y);
    setSavingsMonth(m);
    loadSavingsInput(y, m);
  };

  const handleSaveSavings = async () => {
    const raw = savingsInput.trim();
    const amount = raw === "" ? 0 : Number(raw);
    let error = "";
    if (!Number.isFinite(amount) || amount < 0) error = "Enter $0 or more.";
    else if (amount > 1e9) error = "Keep it under $1,000,000,000.";
    if (error) {
      setSavingsError(error);
      savingsShake.start(SHAKE);
      return;
    }

    setSavingsError("");
    setSavingSavings(true);
    try {
      if (isDays) {
        await updatePeriod(period.current.id, { savingsTarget: amount });
        await period.refresh();
        emitTour("savings:saved");
        onClose();
        toast.success("Savings target updated");
        return;
      }
      await setMonthlySavings({
        key: keyFor(savingsYear, savingsMonth),
        amount,
        repeat: repeatSavings,
      });
      await refresh();
      emitTour("savings:saved");
      onClose();
      toast.success(
        repeatSavings
          ? `Savings set for ${monthName(savingsMonth)} and every month after`
          : `Savings set for ${monthName(savingsMonth)}`
      );
    } catch (err) {
      setSavingsError(err?.response?.data?.message || "Couldn't update savings.");
      savingsShake.start(SHAKE);
    } finally {
      setSavingSavings(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => !savingSavings && onClose()}
      title="Savings Target"
    >
      <div className="space-y-4" data-tour="savings.form">
        {/* Month stepper — days mode edits the running period instead, so
            there's nothing to step through. */}
        <div
          className={`flex items-center justify-between rounded-md bg-surface-2 p-1 ${
            isDays ? "hidden" : ""
          }`}
        >
          <button
            type="button"
            onClick={() => stepSavingsMonth(-1)}
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-2 transition-colors duration-base ease-out hover:bg-surface-3 active:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="num text-[15px] font-semibold">
            {monthName(savingsMonth)} {savingsYear}
          </span>
          <button
            type="button"
            onClick={() => stepSavingsMonth(1)}
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-sm text-ink-2 transition-colors duration-base ease-out hover:bg-surface-3 active:bg-hairline-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <motion.div animate={savingsShake} className="space-y-2">
          <Label
            htmlFor="monthly-savings"
            className={savingsError ? "text-negative" : undefined}
          >
            Amount to set aside in{" "}
            {isDays ? formatPeriodLabel(period.current) : monthName(savingsMonth)}
          </Label>
          <Input
            id="monthly-savings"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            placeholder="0.00"
            value={savingsInput}
            aria-invalid={Boolean(savingsError)}
            aria-describedby={savingsError ? "monthly-savings-error" : undefined}
            className={
              savingsError
                ? "border-negative focus-visible:border-negative focus-visible:ring-negative"
                : undefined
            }
            onChange={(e) => {
              setSavingsInput(e.target.value);
              setSavingsError("");
            }}
          />
          {savingsError ? (
            <FieldError id="monthly-savings-error">{savingsError}</FieldError>
          ) : (
            <p className="text-[12px] leading-relaxed text-ink-3">
              {/* A term month has no income of its own — the lump sum landed
                  months ago — and its target leaves the allowance when the
                  month ends rather than being shared out again. */}
              {isTerm ? (
                <>
                  Reserved from this month&apos;s share of your allowance first —
                  your daily budget is what&apos;s left. When the month ends it
                  counts as saved, so later months don&apos;t get it back.
                </>
              ) : (
                <>
                  Reserved from this {isDays ? "period" : "month"}&apos;s income
                  first — your daily budget is what&apos;s left, spread over the
                  days remaining.
                </>
              )}
            </p>
          )}
        </motion.div>
        {/* Days mode has no run of months to repeat across — each period
            carries its own target. */}
        {!isDays && (
          <SwitchRow
            checked={repeatSavings}
            onChange={setRepeatSavings}
            disabled={savingSavings}
            label="Repeat Every Month"
            description="New months start with your latest target, so you don't have to set it again."
          />
        )}

        <Button onClick={handleSaveSavings} disabled={savingSavings} className="w-full">
          {savingSavings
            ? "Saving…"
            : `Save for ${isDays ? formatPeriodLabel(period.current) : monthName(savingsMonth)}`}
        </Button>
      </div>
    </BottomSheet>
  );
}
