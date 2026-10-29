/**
 * The ledger's list: which entries the filters let through, and how they fall
 * into days. TransactionsPage holds the state; this holds none.
 */
import { localToday, rowAmount } from "@/lib/utils";
import { addDaysYmd, formatDay } from "@/lib/period";

/**
 * A row's React key and DOM handle. An entry added here keeps the provisional
 * key it was drawn with even after the server gives it a real id, so the row
 * doesn't remount — and replay or lose its highlight — the moment it's saved.
 */
export const rowKey = (t) => t.clientKey ?? t._id;

/**
 * The entries to list, newest first, as `{ kind, date, row }`, and the
 * transactions among them (the page's tips ask about those alone), grouped
 * into `days`.
 */
export function ledgerView({ transactions, transfers, filter, accountFilter, query, getAccount }) {
  // Transfers share the ledger with transactions so a move between your own
  // accounts leaves a record, but they are not income or spending — they only
  // appear under "All", never under the Expenses or Income filters.
  const q = query.trim().toLowerCase();
  const visibleTransactions = transactions.filter((t) => {
    if (filter !== "all" && t.type !== filter) return false;
    if (accountFilter && String(t.accountId ?? "") !== accountFilter) return false;
    if (
      q &&
      !t.description.toLowerCase().includes(q) &&
      !t.category.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
  const visibleTransfers = transfers.filter((m) => {
    if (filter !== "all") return false;
    // Either side of the move counts as belonging to that account.
    if (
      accountFilter &&
      String(m.from) !== accountFilter &&
      String(m.to) !== accountFilter
    )
      return false;
    if (q) {
      const names = `${getAccount(String(m.from))?.name ?? ""} ${
        getAccount(String(m.to))?.name ?? ""
      } transfer`.toLowerCase();
      if (!names.includes(q)) return false;
    }
    return true;
  });

  // Newest first, the same order the API returns each list in.
  const visible = [
    ...visibleTransactions.map((t) => ({ kind: "txn", date: t.date, row: t })),
    ...visibleTransfers.map((m) => ({ kind: "transfer", date: m.date, row: m })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)));

  /**
   * Entries grouped into days, newest day first.
   *
   * Dates are stored at UTC midnight, so the ISO prefix is the day key — the
   * same key the streak and the tracker calendar use, which is what keeps a day
   * here and a day there meaning the same thing.
   *
   * The day's figure is its net: income minus expenses. Transfers are left out
   * of it deliberately — moving $400 between your own accounts isn't a $400 day,
   * and a header that said so would contradict the row right beneath it. A day
   * with nothing but transfers shows an em-dash instead of a misleading $0.00.
   */
  const days = (() => {
    const map = new Map();
    for (const entry of visible) {
      const key = String(entry.date).slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    const todayKey = localToday();
    const yesterdayKey = addDaysYmd(todayKey, -1);
    return [...map.entries()].map(([key, entries]) => {
      const counted = entries.filter((e) => e.kind === "txn");
      const net = counted.reduce(
        (sum, e) => {
          const { gain, value } = rowAmount(e.row);
          return sum + (gain ? value : -value);
        },
        0
      );
      const date = formatDay(key);
      return {
        key,
        entries,
        net,
        counted: counted.length > 0,
        label:
          key === todayKey
            ? `Today · ${date}`
            : key === yesterdayKey
              ? `Yesterday · ${date}`
              : date,
      };
    });
  })();

  return { visibleTransactions, visible, days };
}
