import { useEffect, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import { Trash2 } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import FieldError from "@/components/FieldError";
import SegmentPill from "@/components/SegmentPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useToast } from "@/hooks/useToast";
import { emitTour } from "@/tour/signals";
import { useTour } from "@/tour/TourProvider";
import { formatMoney, localToday } from "@/lib/utils";
import {
  MAX_PERIOD_DAYS,
  MAX_TERM_MONTHS,
  MIN_PERIOD_DAYS,
  MIN_TERM_MONTHS,
  addDaysYmd,
  formatDay,
  formatPeriodLabel,
  periodEnd,
  termEnd,
} from "@/lib/period";
import {
  setPeriodMode,
  startPeriod,
  updatePeriod,
  deletePeriod,
  startTerm,
  updateTerm,
  deleteTerm,
} from "@/api/endpoints";
import { SHAKE } from "@/animations/variants";

// What each mode is called in the sheet's own tabs, so the confirm step names
// the thing the reader just tapped rather than an internal key.
const MODE_LABEL = { month: "Month", days: "Days", term: "Allowance" };

/**
 * Budget Period: which of the three modes the budget runs in, and the form for
 * that mode — nothing for Month, the running period for Days, the window for
 * Allowance.
 */
export default function BudgetPeriodSheet({ open, onClose }) {
  const { refresh } = useAuth();
  const period = useBudgetPeriod();
  const toast = useToast();
  const isDays = period.mode === "days";
  const isTerm = period.mode === "term";
  // `history` from the API is every period; the running one is rendered
  // separately above, so keep it out of the "Past periods" list.
  const pastPeriods = (period.history ?? []).filter(
    (p) => p.id !== period.current?.id
  );
  const [periodStart, setPeriodStart] = useState(localToday());
  const [periodLength, setPeriodLength] = useState("15");
  const [periodTarget, setPeriodTarget] = useState("");
  const [periodError, setPeriodError] = useState("");
  const [savingPeriod, setSavingPeriod] = useState(false);
  // Id of the period awaiting an inline "really delete?" confirmation.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  // A mode the reader has picked but not yet committed. Tapping a segment used
  // to fire the PUT on the spot, so anyone tapping "Allowance" to find out what
  // it was re-scored their streak to find out. Null means nothing pending.
  const [pendingMode, setPendingMode] = useState(null);
  // Which segment reads as chosen. A pending pick shows immediately so the tap
  // registers, while `isDays`/`isTerm` above still describe the *committed*
  // mode — which is what keeps the panel under the tabs from swapping out
  // before the reader has said yes.
  const selectedMode = pendingMode ?? period.mode;
  const periodShake = useAnimationControls();
  // Term form: a window, so only a start and a length.
  const [termStart, setTermStart] = useState(localToday());
  const [termMonths, setTermMonths] = useState("6");

  useEffect(() => {
    if (!open) return;
    // Default the next period to start the day after the last one ended, so
    // the common case is one tap.
    const suggested = period.previous ? addDaysYmd(period.previous.end, 1) : localToday();
    setPeriodStart(
      period.current
        ? period.current.start
        : suggested > localToday()
          ? localToday()
          : suggested
    );
    setPeriodLength(String(period.current?.days ?? period.previous?.days ?? 15));
    setPeriodTarget("");
    setTermStart(period.term?.start ?? localToday());
    setTermMonths(String(period.term?.months ?? 6));
    setPeriodError("");
    setConfirmDeleteId(null);
    // Only on opening. Re-seeding on a refresh would wipe what's being typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // The one sheet with a tour of its own: it only ever describes the mode
  // you're already in.
  useTour("sheet.period", open);

  // Tapping a segment proposes a mode; it does not change one. What comes back
  // if you change your mind is only the streak's *scoring* — entries and stored
  // windows survive either way — but the figure moves enough (a best streak can
  // read 51 in Month and 8 in Allowance) that finding out by accident reads as
  // lost data.
  const chooseMode = (mode) => {
    setPeriodError("");
    setPendingMode(mode === period.mode ? null : mode);
  };

  const confirmMode = async () => {
    const mode = pendingMode;
    if (!mode || mode === period.mode) return;
    setPeriodError("");
    setSavingPeriod(true);
    try {
      await setPeriodMode(mode);
      await Promise.all([refresh(), period.refresh()]);
      toast.success(
        {
          month: "Budgeting by calendar month",
          days: "Budgeting by custom days",
          term: "Budgeting one month at a time",
        }[mode]
      );
      setPendingMode(null);
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't change the mode.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleStartPeriod = async () => {
    const length = Number(periodLength);
    let error = "";
    if (!periodStart) error = "Pick a start date.";
    else if (!Number.isInteger(length) || length < MIN_PERIOD_DAYS || length > MAX_PERIOD_DAYS)
      error = `Enter a whole number of days between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS}.`;
    const target = periodTarget.trim() === "" ? 0 : Number(periodTarget);
    if (!error && (!Number.isFinite(target) || target < 0)) error = "Enter $0 or more.";
    if (error) {
      setPeriodError(error);
      periodShake.start(SHAKE);
      return;
    }

    setPeriodError("");
    setSavingPeriod(true);
    try {
      await startPeriod({ start: periodStart, length, savingsTarget: target });
      await Promise.all([refresh(), period.refresh()]);
      emitTour("period:saved");
      onClose();
      toast.success(`Period started — ${length} days`);
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't start the period.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const validateTerm = () => {
    const months = Number(termMonths);
    if (!termStart) return "Pick the day the money arrived.";
    if (termStart > localToday()) return "Start Date can't be in the future.";
    if (!Number.isInteger(months) || months < MIN_TERM_MONTHS || months > MAX_TERM_MONTHS)
      return `Enter a whole number of months between ${MIN_TERM_MONTHS} and ${MAX_TERM_MONTHS}.`;
    return "";
  };

  const saveTerm = async (run, done) => {
    const error = validateTerm();
    if (error) {
      setPeriodError(error);
      periodShake.start(SHAKE);
      return;
    }
    setPeriodError("");
    setSavingPeriod(true);
    try {
      await run();
      await Promise.all([refresh(), period.refresh()]);
      emitTour("period:saved");
      onClose();
      toast.success(done);
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't save your allowance.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleStartTerm = () =>
    saveTerm(
      () => startTerm({ start: termStart, months: Number(termMonths) }),
      `Allowance set up — ${termMonths} months`
    );

  const handleUpdateTerm = () =>
    saveTerm(
      () => updateTerm(period.term.id, { start: termStart, months: Number(termMonths) }),
      "Allowance updated"
    );

  const handleDeleteTerm = async () => {
    setSavingPeriod(true);
    try {
      await deleteTerm(period.term.id);
      await Promise.all([refresh(), period.refresh()]);
      setConfirmDeleteId(null);
      onClose();
      toast.success("Allowance removed");
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't remove your allowance.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleUpdatePeriod = async () => {
    const length = Number(periodLength);
    let error = "";
    if (!periodStart) error = "Pick a start date.";
    else if (periodStart > localToday()) error = "Start Date can't be in the future.";
    else if (!Number.isInteger(length) || length < MIN_PERIOD_DAYS || length > MAX_PERIOD_DAYS)
      error = `Enter a whole number of days between ${MIN_PERIOD_DAYS} and ${MAX_PERIOD_DAYS}.`;
    if (error) {
      setPeriodError(error);
      periodShake.start(SHAKE);
      return;
    }
    setPeriodError("");
    setSavingPeriod(true);
    try {
      await updatePeriod(period.current.id, { start: periodStart, length });
      await period.refresh();
      emitTour("period:saved");
      onClose();
      toast.success("Period updated");
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't update the period.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  const handleDeletePeriod = async (id) => {
    setPeriodError("");
    setSavingPeriod(true);
    try {
      await deletePeriod(id);
      await period.refresh();
      setConfirmDeleteId(null);
      toast.success("Period removed — its transactions were kept");
    } catch (err) {
      setPeriodError(err?.response?.data?.message || "Couldn't remove the period.");
      periodShake.start(SHAKE);
    } finally {
      setSavingPeriod(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={() => !savingPeriod && onClose()}
      title="Budget Period"
    >
      <motion.div animate={periodShake} className="space-y-5">
        {/* Mode toggle */}
        <div
          className="relative grid grid-cols-3 gap-0.5 rounded-md bg-surface-2 p-[3px]"
          role="group"
          aria-label="Budget period mode"
        >
          <SegmentPill
            index={["month", "days", "term"].indexOf(selectedMode)}
            count={3}
          />
          {/* One line each. The hints that used to sit under these labels
              ("Calendar", "Custom Length") said less than the paragraph
              right below, and made this the only two-line segmented control
              in the app. */}
          <ModeTab
            active={selectedMode === "month"}
            disabled={savingPeriod}
            onClick={() => chooseMode("month")}
            label="Month"
            tour="period.month"
          />
          <ModeTab
            active={selectedMode === "days"}
            disabled={savingPeriod}
            onClick={() => chooseMode("days")}
            label="Days"
            tour="period.days"
          />
          {/* "Allowance" rather than "Term": nobody calls it a term, and it
              would sit one row above "Savings Target" reading like a pair. */}
          <ModeTab
            active={selectedMode === "term"}
            disabled={savingPeriod}
            onClick={() => chooseMode("term")}
            label="Allowance"
            tour="period.term"
          />
        </div>

        {/* Switching modes re-scores every day you've logged, because the
            streak resolves each one against whichever mode is current. It's
            been true since days mode shipped, but a six-month allowance makes
            it dramatic — a best streak can read 51 in Month and 8 in
            Allowance — and with nothing said, that looks like lost data.

            It sits above the tabs now: below them it was a footnote you read
            after committing, which is the wrong order for a warning. */}
        {pendingMode ? (
          <div className="space-y-2 rounded-md bg-surface-2 p-3">
            <p className="text-[12.5px] leading-relaxed text-ink-2">
              Switching to {MODE_LABEL[pendingMode]} re-scores your streak
              against the new windows. Your entries never change, and
              switching back restores the old figures.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="ghost"
                onClick={() => setPendingMode(null)}
                disabled={savingPeriod}
              >
                Cancel
              </Button>
              <Button onClick={confirmMode} disabled={savingPeriod}>
                {savingPeriod ? "Switching…" : "Switch"}
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-[12px] leading-relaxed text-ink-3">
            Changing this re-scores your streak against the new windows. Your
            entries never change, and switching back restores the old figures.
          </p>
        )}

        {/* Everything under the mode: the form the setup guide points at. */}
        <div className="space-y-5" data-tour="period.form">
          {isTerm ? (
            <TermPanel
              period={period}
              start={termStart}
              months={termMonths}
              onStart={setTermStart}
              onMonths={setTermMonths}
              disabled={savingPeriod}
              confirming={confirmDeleteId === period.term?.id}
              onConfirm={() => setConfirmDeleteId(period.term?.id)}
              onCancelConfirm={() => setConfirmDeleteId(null)}
              onDelete={handleDeleteTerm}
              onSave={period.term ? handleUpdateTerm : handleStartTerm}
            />
          ) : !isDays ? (
            <p className="text-[13px] leading-relaxed text-ink-3">
              Your budget runs from the 1st to the last day of each calendar
              month, and your daily budget is what's left spread over the days
              remaining. Switch to <strong>Days</strong> if your allowance covers
              something other than a month — a fortnight, or five weeks. Switch to{" "}
              <strong>Allowance</strong> if one lump sum has to last several
              months.
            </p>
          ) : (
            <>
              {period.current ? (
                <div className="space-y-4">
                  {/* A well, not a bordered card: it states what's running, it
                      isn't a control, and a border would give it the same
                      weight as the fields underneath that are. */}
                  <div className="rounded-xl bg-surface-2 p-4">
                    <p className="text-overline text-ink-3">Running now</p>
                    <p className="mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">
                      {formatPeriodLabel(period.current)}
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-ink-3">
                      {period.current.days} days ·{" "}
                      {period.current.daysLeft === 0
                        ? "ends today"
                        : `${period.current.daysLeft} left`}{" "}
                      · {period.current.savesTotal} restore
                      {period.current.savesTotal === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="period-edit-start">Start Date</Label>
                    <Input
                      id="period-edit-start"
                      type="date"
                      value={periodStart}
                      max={localToday()}
                      onChange={(e) => {
                        setPeriodStart(e.target.value);
                        setPeriodError("");
                      }}
                    />
                  </div>

                  <LengthField
                    id="period-length"
                    value={periodLength}
                    disabled={savingPeriod}
                    onChange={(v) => {
                      setPeriodLength(v);
                      setPeriodError("");
                    }}
                  >
                    <p className="text-[12px] leading-relaxed text-ink-3">
                      Runs to{" "}
                      <strong>
                        {periodStart && Number(periodLength) >= MIN_PERIOD_DAYS
                          ? formatDay(periodEnd(periodStart, Number(periodLength)), {
                              withYear: true,
                            })
                          : "—"}
                      </strong>
                      . Your daily budget is recalculated from what&apos;s left.
                    </p>
                  </LengthField>

                  {periodError && <FieldError>{periodError}</FieldError>}

                  <Button
                    onClick={handleUpdatePeriod}
                    disabled={savingPeriod}
                    className="w-full"
                  >
                    {savingPeriod ? "Saving…" : "Save Changes"}
                  </Button>

                  {/* Removing the running period — the escape hatch for one
                      started by mistake. */}
                  {confirmDeleteId === period.current.id ? (
                    <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
                      <p className="text-[12px] leading-relaxed text-ink-3">
                        Remove <strong>{formatPeriodLabel(period.current)}</strong>?
                        Its days stop being budgeted and drop out of your streak.
                        <strong> Your transactions are kept</strong> and still
                        count on Stats.
                      </p>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={savingPeriod}
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Cancel
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="flex-1"
                          disabled={savingPeriod}
                          onClick={() => handleDeletePeriod(period.current.id)}
                        >
                          {savingPeriod ? "Removing…" : "Remove Period"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(period.current.id)}
                      className="w-full rounded-sm py-3 text-center text-[13px] font-medium text-negative transition-colors duration-base ease-out hover:bg-negative/[0.08] active:bg-negative/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
                    >
                      Remove This Period
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {period.status === "lapsed" && period.previous && (
                    <div className="rounded-lg border border-hairline bg-surface-2 p-4">
                      <p className="text-[13px] leading-relaxed text-ink-3">
                        Your last period ran{" "}
                        <strong className="text-foreground">
                          {formatPeriodLabel(period.previous)}
                        </strong>{" "}
                        and has ended. Days since then aren't tracked until you
                        start the next one.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="period-start">Start Date</Label>
                    <Input
                      id="period-start"
                      type="date"
                      value={periodStart}
                      max={localToday()}
                      onChange={(e) => {
                        setPeriodStart(e.target.value);
                        setPeriodError("");
                      }}
                    />
                  </div>

                  <LengthField
                    id="period-new-length"
                    value={periodLength}
                    disabled={savingPeriod}
                    onChange={(v) => {
                      setPeriodLength(v);
                      setPeriodError("");
                    }}
                  >
                    {periodStart && Number(periodLength) >= MIN_PERIOD_DAYS && (
                      <p className="text-[12px] leading-relaxed text-ink-3">
                        Runs until{" "}
                        <strong>
                          {formatDay(periodEnd(periodStart, Number(periodLength)), {
                            withYear: true,
                          })}
                        </strong>
                        .
                      </p>
                    )}
                  </LengthField>

                  <div className="space-y-2">
                    <Label htmlFor="period-target">Savings target (optional)</Label>
                    <Input
                      id="period-target"
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={periodTarget}
                      onChange={(e) => {
                        setPeriodTarget(e.target.value);
                        setPeriodError("");
                      }}
                    />
                  </div>

                  {periodError && <FieldError>{periodError}</FieldError>}

                  <Button
                    onClick={handleStartPeriod}
                    disabled={savingPeriod}
                    className="w-full"
                  >
                    {savingPeriod ? "Starting…" : "Start Period"}
                  </Button>
                </div>
              )}

              {pastPeriods.length > 0 && (
                <div className="space-y-2 border-t border-hairline pt-4">
                  <p className="text-overline text-ink-3">
                    Past periods
                  </p>
                  <ul className="space-y-1.5">
                    {pastPeriods.slice(0, 5).map((p) => (
                      <li key={p.id}>
                        {confirmDeleteId === p.id ? (
                          <div className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-2.5">
                            <p className="text-[12px] leading-relaxed text-ink-3">
                              Remove <strong>{formatPeriodLabel(p)}</strong>? Its
                              days stop being budgeted.{" "}
                              <strong>Transactions are kept.</strong>
                            </p>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 flex-1 text-xs"
                                disabled={savingPeriod}
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-7 flex-1 text-xs"
                                disabled={savingPeriod}
                                onClick={() => handleDeletePeriod(p.id)}
                              >
                                Remove
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 flex-1 truncate">
                              {formatPeriodLabel(p)}
                            </span>
                            <span className="num shrink-0 text-[12px] text-ink-3">
                              {p.days} days
                              {p.savings > 0 ? ` · ${formatMoney(p.savings)}` : ""}
                            </span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(p.id)}
                              aria-label={`Remove ${formatPeriodLabel(p)}`}
                              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-negative/[0.08] active:bg-negative/[0.14] hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-negative"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>
    </BottomSheet>
  );
}

function ModeTab({ active, disabled, onClick, label, tour }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      data-tour={tour}
      className={`relative rounded-[9px] px-3 py-1.5 text-center text-[13px] transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
        active
          ? "font-semibold text-ink"
          : "font-medium text-ink-3 hover:text-ink-2 active:opacity-60"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The Allowance tab: one lump sum, budgeted a month at a time.
 *
 * Only two fields, because a term stores only a window — the money is the
 * income the user logs as normal, so asking for a total here would be asking
 * twice and would double-count it in the budget.
 */
function TermPanel({
  period,
  start,
  months,
  onStart,
  onMonths,
  disabled,
  confirming,
  onConfirm,
  onCancelConfirm,
  onDelete,
  onSave,
}) {
  const monthCount = Number(months);
  const valid =
    start &&
    Number.isInteger(monthCount) &&
    monthCount >= MIN_TERM_MONTHS &&
    monthCount <= MAX_TERM_MONTHS;
  const last = valid ? termEnd(start, monthCount) : null;
  const current = period.current;

  return (
    <div className="space-y-4">
      {current && (
        <div className="rounded-xl bg-surface-2 p-4">
          <p className="text-overline text-ink-3">Running now</p>
          <p className="mt-1.5 text-[15px] font-semibold tracking-[-0.01em]">
            {formatPeriodLabel(current, { mode: "term" })}
          </p>
          <p className="mt-0.5 text-[12.5px] text-ink-3">
            Month {current.cycle} of {current.cycles} ·{" "}
            {current.daysLeft === 0 ? "ends today" : `${current.daysLeft} days left`}
            {current.funding != null && ` · ${formatMoney(current.funding)} this month`}
          </p>
        </div>
      )}

      <p className="text-[13px] leading-relaxed text-ink-3">
        For one lump sum that has to last a while. Log the money as income the
        way you always would, and it gets spread across the months it covers —
        spend more one month and the rest shrink to match, spend less and they
        grow.
      </p>

      <div className="space-y-2">
        <Label htmlFor="term-start">Start Date</Label>
        <Input
          id="term-start"
          type="date"
          max={localToday()}
          value={start}
          disabled={disabled}
          onChange={(e) => onStart(e.target.value)}
        />
        <p className="text-[12px] text-ink-3">The day the money arrived.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="term-months">How Many Months</Label>
        <Input
          id="term-months"
          type="number"
          inputMode="numeric"
          min={MIN_TERM_MONTHS}
          max={MAX_TERM_MONTHS}
          value={months}
          disabled={disabled}
          onChange={(e) => onMonths(e.target.value)}
        />
        <div className="flex flex-wrap gap-1.5">
          {[3, 4, 6, 12].map((n) => (
            <button
              key={n}
              type="button"
              disabled={disabled}
              aria-pressed={monthCount === n}
              onClick={() => onMonths(String(n))}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                monthCount === n
                  ? "border-transparent bg-ink text-surface"
                  : "border-hairline-strong text-ink-2 hover:bg-surface-2 active:bg-surface-3"
              }`}
            >
              {n} months
            </button>
          ))}
        </div>
        {last && (
          <p className="text-[12px] text-ink-3">
            Runs to {formatDay(last, { withYear: true })}. Resets on the 1st.
          </p>
        )}
      </div>

      <Button className="w-full" onClick={onSave} disabled={disabled || !valid}>
        {disabled ? "Saving…" : period.term ? "Save Changes" : "Set Up Allowance"}
      </Button>

      {period.term &&
        (confirming ? (
          <div className="space-y-2">
            <p className="text-[12.5px] leading-relaxed text-ink-3">
              Your entries stay put. Only the budget window goes, so these days
              stop being tracked.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" onClick={onCancelConfirm} disabled={disabled}>
                Keep It
              </Button>
              <Button variant="destructive" onClick={onDelete} disabled={disabled}>
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className="w-full rounded-sm py-1 text-[12.5px] font-medium text-ink-3 transition-colors hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Remove This Allowance
          </button>
        ))}
    </div>
  );
}

/**
 * Length in Days, with the four lengths people actually use one tap away.
 *
 * Shared by both branches of the sheet. It used to exist only on the "start a
 * new period" form, so changing the length of a running one meant clearing a
 * number field and typing — the harder half of the same job.
 */
function LengthField({ id, value, onChange, disabled, children }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Length in Days</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={MIN_PERIOD_DAYS}
        max={MAX_PERIOD_DAYS}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5">
        {[7, 14, 15, 30].map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            aria-pressed={Number(value) === n}
            onClick={() => onChange(String(n))}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              Number(value) === n
                ? "border-transparent bg-ink text-surface"
                : "border-hairline-strong text-ink-2 hover:bg-surface-2 active:bg-surface-3"
            }`}
          >
            {n} days
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
