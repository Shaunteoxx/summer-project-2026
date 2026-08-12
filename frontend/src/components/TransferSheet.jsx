import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";

import AmountCalculator from "@/components/AmountCalculator";
import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addTransfer } from "@/api/endpoints";
import { useAccounts } from "@/hooks/useAccounts";
import { useToast } from "@/hooks/useToast";
import { useDemoGuard } from "@/hooks/useDemoGuard";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { cn, formatMoney, localToday } from "@/lib/utils";

/**
 * Move money between two of the user's own accounts.
 *
 * A transfer is not income or spending, so it never touches the budget, the
 * streak or the savings rate — it only changes which account this period's
 * money is sitting in. Kept as its own sheet rather than a third mode of the
 * add-entry form, because it shares almost nothing with it: no category, no
 * description, and two account fields instead of one.
 */
export default function TransferSheet({ open, onClose, onTransferred }) {
  const { active: accounts } = useAccounts();
  const toast = useToast();
  const guard = useDemoGuard();
  const touchFirst = useCoarsePointer();

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localToday);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [calcOpen, setCalcOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFrom(accounts[0]?.id ?? "");
    setTo(accounts[1]?.id ?? "");
    setAmount("");
    setDate(localToday());
    setError("");
    setCalcOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const amountNumber = Number(amount);
  const amountDisplay =
    amount !== "" && Number.isFinite(amountNumber) ? amountNumber.toFixed(2) : "";

  /** Choosing the same account on both sides swaps them rather than refusing. */
  const pickFrom = (id) => {
    if (id === to) setTo(from);
    setFrom(id);
    setError("");
  };
  const pickTo = (id) => {
    if (id === from) setFrom(to);
    setTo(id);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!from || !to) return setError("Pick both accounts.");
    if (from === to) return setError("Pick two different accounts.");
    if (!Number.isFinite(amountNumber) || amountNumber <= 0) {
      return setError("Enter an amount greater than $0.");
    }
    if (guard()) return;

    setSaving(true);
    try {
      await addTransfer({ from, to, amount: amountNumber, date });
      const fromName = accounts.find((a) => a.id === from)?.name;
      const toName = accounts.find((a) => a.id === to)?.name;
      onTransferred?.();
      onClose();
      toast.success(`Moved ${formatMoney(amountNumber)} · ${fromName} → ${toName}`);
    } catch (err) {
      setError(err?.response?.data?.message || "Couldn't make that transfer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={calcOpen ? () => setCalcOpen(false) : onClose}
      closeLabel={calcOpen ? "Back to form" : "Close dialog"}
      title={calcOpen ? "Calculator" : "Move money"}
    >
      {calcOpen ? (
        <AmountCalculator
          initialValue={amount}
          tone="success"
          onCancel={() => setCalcOpen(false)}
          onApply={(value) => {
            setAmount(String(value));
            setCalcOpen(false);
          }}
        />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          <AccountRow label="From" value={from} onChange={pickFrom} accounts={accounts} />

          <div className="flex justify-center text-ink-3">
            <ArrowRight className="h-4 w-4 rotate-90" />
          </div>

          <AccountRow label="To" value={to} onChange={pickTo} accounts={accounts} />

          <div className="grid grid-cols-2 items-start gap-3">
            <div className="space-y-2">
              <Label htmlFor="transfer-amount">Amount</Label>
              {touchFirst ? (
                <button
                  type="button"
                  id="transfer-amount"
                  onClick={() => setCalcOpen(true)}
                  aria-label={
                    amountDisplay
                      ? `Amount, ${amountDisplay} dollars. Opens calculator.`
                      : "Amount, not set. Opens calculator."
                  }
                  className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-hairline-strong bg-surface px-3 py-2 text-base transition-colors duration-base ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <span
                    className={cn(
                      "truncate tabular-nums",
                      !amountDisplay && "text-ink-3"
                    )}
                  >
                    {amountDisplay || "0.00"}
                  </span>
                </button>
              ) : (
                <Input
                  id="transfer-amount"
                  type="number"
                  inputMode="decimal"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError("");
                  }}
                />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="transfer-date">Date</Label>
              <Input
                id="transfer-date"
                type="date"
                value={date}
                max={localToday()}
                onChange={(e) => {
                  setDate(e.target.value);
                  setError("");
                }}
              />
            </div>
          </div>

          {error && <FieldError id="transfer-error">{error}</FieldError>}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Moving…" : "Move money"}
          </Button>
        </form>
      )}
    </BottomSheet>
  );
}

function AccountRow({ label, value, onChange, accounts }) {
  return (
    <div className="space-y-2">
      <Label id={`transfer-${label.toLowerCase()}-label`}>{label}</Label>
      <div
        role="group"
        aria-labelledby={`transfer-${label.toLowerCase()}-label`}
        className="flex flex-wrap gap-2"
      >
        {accounts.map((a) => {
          const selected = value === a.id;
          return (
            <button
              type="button"
              key={a.id}
              onClick={() => onChange(a.id)}
              aria-pressed={selected}
              className={`flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                selected
                  ? "border-transparent"
                  : "border-hairline-strong text-ink-2 hover:bg-surface-2"
              }`}
              style={
                selected
                  ? { backgroundColor: `${a.color}22`, borderColor: a.color }
                  : undefined
              }
            >
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: a.color }}
              />
              {a.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
