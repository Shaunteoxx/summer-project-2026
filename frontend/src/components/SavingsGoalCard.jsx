import { useState } from "react";
import { motion } from "framer-motion";
import { Target, Pencil } from "lucide-react";

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
          <CardContent className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                  <Target className="h-[18px] w-[18px] text-primary" />
                </span>
                <div>
                  <h2 className="font-semibold leading-tight">Savings goal</h2>
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              </div>
              <button
                onClick={openSheet}
                aria-label="Edit savings goal"
                className="flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-3 flex items-baseline justify-between gap-3">
              <p className="text-xl font-extrabold tabular-nums">
                {formatMoney(target)}
              </p>
              <p
                className={cn(
                  "text-xs font-semibold",
                  income <= 0
                    ? "text-muted-foreground"
                    : onTrack
                      ? "text-success"
                      : "text-destructive"
                )}
              >
                {income <= 0
                  ? "Add income to track this"
                  : onTrack
                    ? "On track"
                    : `${formatMoney(shortfall)} at risk`}
              </p>
            </div>

            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  onTrack ? "bg-success" : "bg-destructive"
                )}
                style={{ width: `${pct}%` }}
              />
            </div>

            {income > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {onTrack
                  ? "Your unspent income still covers the whole goal."
                  : "Spending has eaten into your goal — staying under the daily budget wins it back."}
              </p>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex items-center justify-between gap-3 p-4">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                <Target className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <p className="font-semibold">No savings goal for {label}</p>
                <p className="text-xs text-muted-foreground">
                  Set one to shape your daily budget.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={openSheet} className="shrink-0">
              Set goal
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
            <p className="text-xs text-muted-foreground">
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
