import { useState } from "react";
import { motion } from "framer-motion";
import { Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import BottomSheet from "@/components/BottomSheet";
import { setMonthlySavings, updatePeriod } from "@/api/endpoints";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { cn, formatMoney } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { fadeUp } from "@/animations/variants";

/**
 * This period's savings goal on the tracker. "On track" means the income you
 * haven't spent yet still covers the whole goal; once spending eats into it,
 * the shortfall is shown. Editing here writes the same target that drives the
 * daily budget and the streak — savingsByMonth in month mode, the period's own
 * savingsTarget in days mode.
 */
export default function SavingsGoalCard({
  target = 0,
  income = 0,
  spent = 0,
  period,
  onUpdated,
}) {
  const toast = useToast();
  const guard = useDemoGuard();
  const { refresh } = useAuth();
  const { mode, refresh: refreshPeriod } = useBudgetPeriod();
  const label = formatPeriodLabel(period, { mode });
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [saving, setSaving] = useState(false);

  const covered = Math.min(Math.max(income - spent, 0), target);
  const shortfall = target - covered;
  const onTrack = income > 0 && shortfall <= 1e-9;
  const pct = target > 0 ? (covered / target) * 100 : 0;

  const openSheet = () => {
    if (guard()) return;
    setInput(target ? String(target) : "");
    setOpen(true);
  };

  const handleSave = async () => {
    const amount = Number(input) || 0;
    if (amount < 0) return;
    setSaving(true);
    try {
      if (mode === "days") {
        await updatePeriod(period.id, { savingsTarget: amount });
        await refreshPeriod();
      } else {
        const start = new Date(`${period.start}T00:00:00.000Z`);
        await setMonthlySavings({
          key: `${start.getUTCFullYear()}-${start.getUTCMonth()}`,
          amount,
        });
        await refresh();
      }
      setOpen(false);
      toast.success(
        amount > 0
          ? `Savings goal set for ${label}`
          : `Savings goal cleared for ${label}`
      );
      onUpdated?.();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Couldn't update savings.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      {target > 0 ? (
        <Card>
          <CardContent>
            {/* Everything but the bar lives in the header row: title with its
                caption underneath, verdict and Edit on the right. The verdict
                used to sit on its own row under the bar, which cost the card a
                whole line to say two words. */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold tracking-[-0.015em]">
                  Savings Target
                </h2>
                <p className="mt-0.5 truncate text-[12px] text-ink-3">
                  {income <= 0
                    ? "Add income to track this"
                    : onTrack
                      ? "Reserved before you spend"
                      : "Spending has eaten into it"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {income > 0 && (
                  <span
                    className={cn(
                      "rounded-xs px-1.5 py-[3px] text-[11px] font-medium",
                      onTrack
                        ? "bg-positive/[0.12] text-positive"
                        : "bg-negative/[0.12] text-negative"
                    )}
                  >
                    {onTrack ? "On track" : `${formatMoney(shortfall)} at risk`}
                  </span>
                )}
                <button
                  onClick={openSheet}
                  aria-label="Edit savings target"
                  className="-my-1 rounded-sm px-1.5 py-1 text-[12.5px] font-medium text-ink-2 transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Edit
                </button>
              </div>
            </div>

            {/* Covered of target, so the pair reads as progress rather than
                asking you to compare the figure against the bar. */}
            <div className="mt-3 flex items-baseline gap-1.5">
              <span className="num text-[26px] font-medium">{formatMoney(covered)}</span>
              <span className="text-[13px] text-ink-3">of {formatMoney(target)}</span>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-3">
              <div
                className={cn(
                  "h-full rounded-full transition-[width] duration-enter ease-out",
                  onTrack ? "bg-positive" : "bg-negative"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-2">
                <Target className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-medium tracking-[-0.01em]">No target for {label}</p>
                <p className="mt-0.5 text-meta text-ink-3">
                  Set one to shape your daily budget.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={openSheet} className="shrink-0">
              Set target
            </Button>
          </CardContent>
        </Card>
      )}

      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Savings goal"
      >
        <div className="space-y-4 pb-2">
          <div className="space-y-2">
            <Label htmlFor="tracker-savings">
              Amount to set aside in {label}
            </Label>
            <Input
              id="tracker-savings"
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 500"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <p className="text-[12px] leading-relaxed text-ink-3">
              This is reserved before your daily budget is worked out. Set 0 to
              clear the goal.
            </p>
          </div>
          <Button className="w-full" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : `Save for ${label}`}
          </Button>
        </div>
      </BottomSheet>
    </motion.div>
  );
}
