import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeftRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { fetchAccountTotals } from "@/api/endpoints";
import { useAccounts } from "@/hooks/useAccounts";
import { formatMoney, localToday } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/period";
import { fadeUp } from "@/animations/variants";

/**
 * Account Activity — what moved through each account this period.
 *
 * This shows two figures per account rather than one net. The net version
 * ("DBS +$1,175.20") answered no question anyone actually has: it isn't a
 * balance, isn't spending, and isn't actionable. Because that number needed
 * explaining, the card had to carry three extra rows reconciling it back to a
 * figure already on screen, plus a footnote walking back what the heading
 * implied. Splitting the net into the two numbers it was made from fixes it at
 * source — "$1,240 in, $64.80 out" needs no interpretation, and nothing here
 * resembles a balance, so the disclaimer disappears on its own.
 *
 * It lives on Transactions rather than Home because it's reference data, not
 * status: it summarises the period the list below is showing, and the Out
 * column is literally the sum of those rows.
 *
 * Renders nothing until the user has made an account.
 */
export default function AccountsCard({ onTransfer = null }) {
  const { hasAccounts } = useAccounts();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    if (!hasAccounts) return;
    setLoading(true);
    fetchAccountTotals(localToday())
      // A failure here costs this card, not the page it sits on.
      .catch(() => null)
      .then(setData)
      .finally(() => setLoading(false));
  }, [hasAccounts]);

  useEffect(load, [load]);

  if (!hasAccounts) return null;

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-3 p-[18px]">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.period) return null;

  // In and Out are derived, not stored: the API reports income, spent and the
  // two transfer directions separately. Transfers belong in the columns —
  // money genuinely moved through the account — and they cancel across
  // accounts, so the totals still reconcile to leftToSpend.
  const toRow = (a) => ({
    ...a,
    in: round(a.income + (a.transfersIn ?? 0)),
    out: round(a.spent + (a.transfersOut ?? 0)),
  });

  // Archived accounts drop out once they have nothing left in the period.
  const rows = data.accounts.map(toRow).filter((a) => !a.archived || a.in || a.out);
  const unassigned = data.unassigned ? toRow(data.unassigned) : null;
  const { totals } = data;
  const overspent = totals.leftToSpend < 0;

  // Summed from the rows on screen rather than taken from the API, so the Total
  // line always equals what's directly above it.
  // Term mode: this month's share of a lump sum that has to last several.
  //
  // Deliberately NOT a row in the list. In the month the money actually arrives
  // it is already in an account, so a row would show it twice — $6,000 in from
  // DBS plus $1,000 "from your allowance", totalling $7,000 that never existed.
  // The columns stay what they say they are, money that moved, and the sentence
  // under the Total does the reconciling — which is what it already does for
  // the savings reserve.
  const funding = data.period.funding ?? null;

  const shown = [...rows, ...(unassigned ? [unassigned] : [])];
  const totalIn = round(shown.reduce((n, a) => n + a.in, 0));
  const totalOut = round(shown.reduce((n, a) => n + a.out, 0));

  return (
    <motion.div variants={fadeUp} initial="initial" animate="animate">
      <Card>
        <CardContent className="p-[18px]">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-title">Account Activity</h2>
              {/* The card is a set of sums over one window and never says
                  which, and it sits far enough down the page that the heading
                  naming the month has scrolled away. */}
              <p className="mt-0.5 text-[12px] text-ink-3">
                {formatPeriodLabel(data.period)}
              </p>
            </div>
            {/* Transfers move money between the accounts listed right below,
                so this is where the action belongs — it used to be a
                full-width button competing with adding a transaction, which
                is a far more common thing to want. */}
            {onTransfer && (
              <button
                type="button"
                onClick={onTransfer}
                className="flex shrink-0 items-center gap-1.5 rounded-sm text-[12.5px] font-medium text-ink-2 transition-colors duration-base ease-out hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Transfer
              </button>
            )}
          </div>

          <div className="mt-3 flex border-b border-hairline pb-2">
            <span className="flex-1" />
            <span className="w-[84px] text-right text-[10px] font-medium uppercase tracking-[0.07em] text-ink-3">
              In
            </span>
            <span className="w-[80px] text-right text-[10px] font-medium uppercase tracking-[0.07em] text-ink-3">
              Out
            </span>
          </div>

          <ul>
            {rows.map((a) => (
              <Row key={a.id} label={a.name} color={a.color} inAmt={a.in} outAmt={a.out} />
            ))}
            {unassigned && (
              <Row label="Not Assigned" inAmt={unassigned.in} outAmt={unassigned.out} />
            )}
          </ul>

          <div className="mt-1 flex border-t border-hairline pt-2.5">
            <span className="flex-1 text-sm font-semibold">Total</span>
            <span className="num w-[84px] text-right text-sm font-semibold text-positive">
              {formatMoney(totalIn)}
            </span>
            <span className="num w-[80px] text-right text-sm font-semibold">
              {formatMoney(totalOut)}
            </span>
          </div>

          {/* Term mode only, and its job is to reconcile the columns rather
              than to restate the budget. In a cycle after the first nothing
              came in through an account, so "Total In $0.00" sits above a month
              that nonetheless has money to spend — that is the one thing this
              card cannot explain on its own. Outside term mode there is nothing
              to reconcile (Total In is the income, Total Out the spending) and
              Home already carries all three figures — the Allowance/In strip
              cell, Reserved, and leftToSpend as its hero — so the sentence was
              three duplicated numbers and it is gone.

              It also now states the whole subtraction. It used to narrate
              funding − reserved and then print leftToSpend, which is
              funding − reserved − spent: "$1,000.00 … minus $200.00 … that's
              $352.00". The missing term was the spending in the Out column
              directly above it.

              Spending comes from totals.spent, not the Out total: Out includes
              transfers between the user's own accounts, which cancel across
              rows and never touched the budget. The two agree whenever there
              were no transfers, which is most of the time.

              The first clause has two versions because the term's first cycle
              is not like the rest: the lump sum lands *in* it, so it really is
              in the In column above and "it arrived earlier" would be a lie
              about a figure the reader can see. From the second cycle on
              nothing comes in, which is the case that needed explaining. */}
          {funding != null && (
            <p className="mt-3 border-t border-hairline pt-3 text-[11.5px] leading-relaxed text-ink-3">
              <b className="font-medium text-ink-2">{formatMoney(funding)}</b>{" "}
              {totals.income > 0 ? (
                <>of what came in is this month&apos;s share of your allowance.</>
              ) : (
                <>
                  of your allowance is this month&apos;s — it arrived earlier, so
                  it isn&apos;t in the In column.
                </>
              )}{" "}
              Less {formatMoney(totals.reserved)} reserved and{" "}
              {formatMoney(totals.spent)} spent,{" "}
              {overspent ? (
                <>
                  you&apos;re{" "}
                  <b className="font-semibold text-negative">
                    {formatMoney(Math.abs(totals.leftToSpend))}
                  </b>{" "}
                  past this month&apos;s budget.
                </>
              ) : (
                <>
                  that&apos;s{" "}
                  <b className="font-medium text-ink-2">
                    {formatMoney(totals.leftToSpend)}
                  </b>{" "}
                  left to spend.
                </>
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/** Money maths in JS needs rounding at every step or cents drift. */
const round = (n) => Math.round(n * 100) / 100;

function Row({ label, color, inAmt, outAmt }) {
  return (
    <li className="flex py-2">
      <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
        {color && (
          <span
            className="h-[9px] w-[9px] shrink-0 rounded-[3px]"
            style={{ background: color }}
          />
        )}
        <span className="truncate">{label}</span>
      </span>
      {/* An em-dash rather than $0.00 where nothing came in: the column stays
          scannable instead of filling with zeroes that mean "not applicable". */}
      <span
        className={`num w-[84px] shrink-0 text-right text-sm ${
          inAmt ? "font-medium text-positive" : "text-ink-3"
        }`}
      >
        {inAmt ? formatMoney(inAmt) : "—"}
      </span>
      <span
        className={`num w-[80px] shrink-0 text-right text-sm ${
          outAmt ? "font-medium" : "text-ink-3"
        }`}
      >
        {outAmt ? formatMoney(outAmt) : "—"}
      </span>
    </li>
  );
}
