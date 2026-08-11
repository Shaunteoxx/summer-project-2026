import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Wallet } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAccountTotals } from "@/api/endpoints";
import { useAccounts } from "@/hooks/useAccounts";
import { formatMoney, localToday } from "@/lib/utils";
import { fadeUp } from "@/animations/variants";

/**
 * Where this period's money sits, account by account.
 *
 * Deliberately headed "In your accounts" and never "Balance": there are no
 * opening balances, so a figure here is only what has moved through that
 * account since the period began, not what the bank would tell you.
 *
 * The reserved line is what makes the card add up. Per-account nets sum to
 * income − spent, which is the daily budget's numerator *before* the savings
 * reserve — so without showing the reserve, "Trust + DBS" and "left to spend"
 * would look like they disagreed.
 *
 * Renders nothing at all until the user has made an account.
 */
export default function AccountsCard() {
  const { hasAccounts } = useAccounts();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!hasAccounts) return;
    setLoading(true);
    fetchAccountTotals(localToday())
      .then(setData)
      // A failure here costs this card, not the page it sits on.
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [hasAccounts]);

  useEffect(load, [load]);

  if (!hasAccounts) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.period) return null;

  // Archived accounts drop out once they have nothing left in the period.
  const rows = data.accounts.filter((a) => !a.archived || a.net !== 0);
  const { totals, unassigned } = data;

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card>
        <CardContent className="p-5">
          <h2 className="flex items-center gap-2 font-semibold">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            In your accounts
          </h2>

          <ul className="mt-3 space-y-2">
            {rows.map((a) => (
              <Row key={a.id} label={a.name} color={a.color} value={a.net} />
            ))}
            {unassigned && (
              <Row
                label="Not assigned"
                value={unassigned.net}
                hint="Entries logged without an account"
              />
            )}
          </ul>

          <div className="mt-3 space-y-2 border-t border-border pt-3">
            <Row label="Total" value={totals.net} strong />
            {totals.reserved > 0 && (
              <Row label="Reserved for savings" value={-totals.reserved} />
            )}
            <Row label="Left to spend" value={totals.leftToSpend} strong accent />
          </div>

          <p className="mt-3 text-xs text-muted-foreground">
            Amount for this period.
          </p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function Row({ label, value, color, strong, accent, hint }) {
  return (
    <li className="flex items-baseline justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2">
        {color && (
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ background: color }}
          />
        )}
        <span className={`truncate ${strong ? "font-semibold" : ""}`}>{label}</span>
        {hint && (
          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
            {hint}
          </span>
        )}
      </span>
      <span
        className={`shrink-0 tabular-nums ${strong ? "font-bold" : ""} ${
          accent ? "text-primary" : value < 0 ? "text-destructive" : ""
        }`}
      >
        {value < 0 ? "−" : ""}
        {formatMoney(Math.abs(value))}
      </span>
    </li>
  );
}
