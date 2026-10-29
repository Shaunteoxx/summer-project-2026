import { addTransaction, updateTransaction } from "@/api/endpoints";
import { useToast } from "@/hooks/useToast";
import { useAccounts } from "@/hooks/useAccounts";
import { useRecurring } from "@/hooks/useRecurring";
import { haptic } from "@/lib/haptics";
import { emitTour } from "@/tour/signals";
import { formatMoney, ordinal, rowAmount } from "@/lib/utils";
import { repeatPlan, todayAfter } from "@/lib/entryDraft";

/** Numbers the provisional ids of entries the server hasn't answered for. */
let provisionalSeq = 0;

/**
 * Saving an entry from AddTransactionSheet: the add or the edit, optimistic,
 * with the page told twice (see the sheet's doc comment), the confirmation
 * toast, the monthly rule, and putting things back when a save fails.
 *
 * Takes the draft as it stood when Add was tapped, and the sheet's two refs:
 * `mounted` (is the page still there) and `openNow` (is the sheet open again
 * for the next entry), which decide whether a failure can reopen the sheet.
 */
export function useEntrySave({
  type,
  editing,
  form,
  repeat,
  paidBackNumber,
  mounted,
  openNow,
  onClose,
  onAdded,
  onUpdated,
  onSaved,
  onFailed,
}) {
  const toast = useToast();
  const { rememberAccount } = useAccounts();
  const { addRule } = useRecurring();

  /**
   * A save that failed after the sheet had already closed on it.
   *
   * The page always hears, so it can take the row back out (or put the old one
   * back). Where it can, it also reopens this sheet on the draft with the
   * reason. Two cases where it can't: the reader has left the page, or has
   * already opened the sheet for their next entry — reopening would throw
   * away what they're typing now. Then a toast is the only place left to say
   * so, and it says exactly what to redo.
   */
  const failed = (err, { key, original, lost }) => {
    haptic("warning");
    emitTour("entry:failed");
    // Inline, so no retry line (COPY_CONVENTIONS): the sheet it appears in is
    // the retry, with the entry already filled in under it.
    const message =
      err?.response?.data?.message ||
      (original ? "Couldn't save your changes to this entry." : "Couldn't add this entry.");
    const canReopen = mounted.current && !openNow.current;
    if (mounted.current) {
      onFailed({ key, original, retry: canReopen ? { type, form, repeat, message } : null });
    }
    if (!canReopen) toast.error(lost);
  };

  const saveAdd = async ({ description, amount }) => {
    const payload = {
      description,
      amount,
      type,
      category: form.category,
      date: form.date,
      accountId: form.accountId || undefined,
      ...(paidBackNumber > 0
        ? { paidBack: paidBackNumber, paidBackAccountId: form.paidBackAccountId || null }
        : {}),
    };
    const key = `pending-${++provisionalSeq}`;
    const sign = type === "income" ? "+" : "−";
    const shown = rowAmount({ type, amount, paidBack: paidBackNumber });
    const added = `Added ${shown.gain ? "+" : "−"}${formatMoney(shown.value)}`;

    rememberAccount(form.accountId);
    onAdded({
      ...payload,
      _id: key,
      clientKey: key,
      // Stored dates are UTC midnight; the row has to key into the same day.
      date: `${form.date}T00:00:00.000Z`,
      accountId: form.accountId || null,
      pending: true,
    });
    // Before the sheet closes, so a guide waiting on this tap moves on while
    // the button it pointed at is still there.
    emitTour("entry:added", { type });
    onClose();
    haptic("success");

    let created;
    try {
      created = await addTransaction(payload);
    } catch (err) {
      failed(err, {
        key,
        original: null,
        lost: `Couldn't save ${sign}${formatMoney(amount)} · ${form.category}. Please add it again.`,
      });
      return;
    }
    onSaved({ key, row: created });
    emitTour("entry:saved", { type });

    // The confirmation says what the entry did, not just that it saved: this
    // is logged from Transactions, and the figure it moved is on Home, a tab
    // away. Two figures and nothing else, so it reads in one glance before the
    // toast goes — the category was just picked, so it's the part that can go
    // when there's a budget line to make room for.
    const today = await todayAfter(created);
    if (today && !today.within) {
      toast.show({
        message: `${added} · ${formatMoney(Math.abs(today.remaining))} over today`,
        variant: "warning",
      });
    } else if (today) {
      toast.success(`${added} · ${formatMoney(Math.max(today.remaining, 0))} left today`);
    } else {
      toast.success(`${added} · ${form.category}`);
    }
    // After the entry, and never in place of it: the entry is what was asked
    // for, so a rule that fails to save must not lose it.
    if (repeat) await createRepeat({ description, amount });
  };

  /**
   * Turn the entry just added into a monthly rule.
   *
   * Deliberately after the transaction has saved and the sheet has closed: the
   * entry is what the user asked for and it is already safe. If the rule fails
   * they are told, and the entry stays — the alternative, one request that
   * either does both or neither, would throw away a logged expense over a
   * failed convenience.
   */
  const createRepeat = async ({ description, amount }) => {
    const plan = repeatPlan(form.date);
    if (!plan) return;
    try {
      await addRule({
        description,
        amount,
        type,
        category: form.category,
        accountId: form.accountId || null,
        frequency: "monthly",
        dayOfMonth: plan.dayOfMonth,
        startKey: plan.startKey,
      });
      toast.success(`Repeating on the ${ordinal(plan.dayOfMonth)} of each month`);
    } catch (err) {
      toast.error(
        err?.response?.data?.message ||
          "Added the entry, but couldn't set it to repeat."
      );
    }
  };

  /**
   * Send only what moved. Anything the user didn't touch is left out of the
   * request entirely, so the server keeps whatever it already had — including
   * an account that has since been archived, which the picker can't offer and
   * the API would refuse to be sent.
   */
  const saveEdit = async ({ description, amount }) => {
    const patch = {};
    if (description !== editing.description) patch.description = description;
    if (amount !== editing.amount) patch.amount = amount;
    if (form.category !== editing.category) patch.category = form.category;
    if (form.date !== String(editing.date).slice(0, 10)) patch.date = form.date;

    const wasAccount = editing.accountId ? String(editing.accountId) : "";
    // Null, not undefined: clearing the tag has to be said out loud.
    if (form.accountId !== wasAccount) patch.accountId = form.accountId || null;

    // Zero clears it, and the server clears the account along with it.
    if (paidBackNumber !== (editing.paidBack || 0)) patch.paidBack = paidBackNumber;
    const wasPaidBackAccount = editing.paidBackAccountId ? String(editing.paidBackAccountId) : "";
    if (paidBackNumber > 0 && form.paidBackAccountId !== wasPaidBackAccount) {
      patch.paidBackAccountId = form.paidBackAccountId || null;
    }

    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }

    const original = editing;
    if (patch.accountId) rememberAccount(patch.accountId);
    onUpdated({
      ...original,
      ...patch,
      ...(patch.date ? { date: `${patch.date}T00:00:00.000Z` } : {}),
      // Mirrors the server: clearing paid back clears where it landed.
      ...(patch.paidBack === 0 ? { paidBackAccountId: null } : {}),
      pending: true,
    });
    onClose();
    haptic("success");

    let updated;
    try {
      updated = await updateTransaction(original._id, patch);
    } catch (err) {
      failed(err, {
        key: original._id,
        original,
        lost: `Couldn't save your change to ${original.description}. Please make it again.`,
      });
      return;
    }
    onSaved({ key: original._id, row: updated });
    toast.success("Transaction updated");
  };

  return { saveAdd, saveEdit };
}
