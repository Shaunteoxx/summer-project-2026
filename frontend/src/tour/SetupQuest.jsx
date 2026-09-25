import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, ChevronRight, X } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { setupSteps } from "@/lib/setup";
import { useTourContext } from "@/tour/TourProvider";
import { MARKS } from "@/tour/tours";

const COUNT = ["", "One", "Two", "Three", "Four", "Five"];

/**
 * The first-run setup, worked out from the account rather than stored.
 *
 * Each step is done when the thing it asks for exists — a window running,
 * income in it, a savings target, a spend — so a step done the long way
 * round, from More or the + button, ticks just the same. Only two things
 * can't be read off the data and are saved as marks instead: a savings target
 * set to $0 (indistinguishable from none), and skipping savings altogether.
 *
 * Where it shows: always while nothing is logged, as the checklist it
 * replaced; and after that, until every step is done or it's dismissed — but
 * only for an account that started setup here. An account that already had
 * entries when this shipped never began it, and isn't handed a checklist for
 * an app it has been using.
 */
export function useSetupQuest({ mode, hasWindow, needsPeriod, stats, hasExpense, nothingLogged, loading }) {
  const tour = useTourContext();
  const navigate = useNavigate();

  const doneFor = (go) => {
    switch (go) {
      case "period":
        return !needsPeriod;
      case "income":
        // A term cycle is funded from the lump sum, so its income can be 0.
        return (stats?.periodFunding ?? stats?.periodIncome ?? 0) > 0;
      case "savings":
        return (
          (stats?.periodSavings ?? 0) > 0 ||
          tour.has(MARKS.savings) ||
          tour.has(MARKS.savingsSkipped)
        );
      case "expense":
        return hasExpense;
      default:
        return false;
    }
  };

  const moves = setupSteps(mode).map((step) => ({ ...step, done: !loading && doneFor(step.go) }));
  const next = moves.find((m) => !m.done) ?? null;
  const doneCount = moves.filter((m) => m.done).length;
  const begun = tour.has(MARKS.begun);
  const finished = tour.has(MARKS.done);
  const visible = !loading && (nothingLogged || (begun && !finished));

  // Guided when tours are on: the step opens with the guide beside it.
  // Otherwise each one simply opens the thing it describes, as it always did.
  const guided = tour.available && !tour.off;
  const moveLabel = (go) => `Move ${moves.findIndex((m) => m.go === go) + 1} of ${moves.length}`;

  const start = (go) => {
    if (go === "expense") {
      // The guide starts on Home, at the + button — that button is the lesson.
      if (guided) tour.start("setup.expense", { label: moveLabel(go) });
      else navigate("/transactions", { state: { openAdd: "expense" } });
      return;
    }
    if (go === "income") {
      if (guided) tour.start("setup.income", { label: moveLabel(go) });
      navigate("/transactions", { state: { openAdd: "income" } });
      return;
    }
    // The savings sheet needs a window to attach a target to: in days mode
    // with nothing running, MorePage's own opener refuses and toasts "Start a
    // budget period first". Sending the reader there to be told no is a dead
    // end, so the step that can't run yet routes to the thing that unblocks it.
    const which = go === "savings" && mode === "days" && !hasWindow ? "period" : go;
    if (guided) tour.start(`setup.${which}`, { label: moveLabel(which) });
    navigate("/more", { state: { open: which } });
  };

  const quest = {
    moves,
    next,
    doneCount,
    allDone: !next,
    begun,
    finished,
    visible,
    start,
    skipSavings: () => tour.mark([MARKS.savingsSkipped]),
    dismiss: () => tour.mark([MARKS.done]),
  };

  // The guide's end-of-move cards ask Home what's next, so Home keeps the
  // provider's copy current.
  const { registerQuest } = tour;
  useEffect(() => registerQuest(quest));

  return quest;
}

/**
 * The setup checklist on Home. Each step is a button that does the step; the
 * one to do now is lit.
 */
export function SetupCard({ quest, nothingLogged, alternatives, onChangeMode }) {
  const total = quest.moves.length;
  return (
    <Card data-tour="quest.card">
      <CardContent className="p-[18px]">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[14px] font-semibold tracking-[-0.01em]">
            Set Up in {COUNT[total] ?? total} Steps
          </p>
          {/* Nothing to dismiss while nothing is logged: then this *is* the
              empty page's list of what to do. */}
          {!nothingLogged && (
            <div className="-my-1.5 -mr-2 flex items-center gap-1">
              <span className="num text-[12px] font-medium text-ink-3">
                {quest.doneCount} of {total}
              </span>
              <button
                type="button"
                onClick={quest.dismiss}
                aria-label="Hide setup"
                className="flex h-8 w-8 items-center justify-center rounded-sm text-ink-3 transition-colors duration-base ease-out hover:bg-surface-2 hover:text-ink-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {quest.doneCount > 0 && (
          <div
            className="mt-2.5 h-1 overflow-hidden rounded-full bg-surface-3"
            role="img"
            aria-label={`${quest.doneCount} of ${total} steps done`}
          >
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-enter ease-out"
              style={{ width: `${(quest.doneCount / total) * 100}%` }}
            />
          </div>
        )}

        {quest.moves.map((move, i) => {
          // The step to do now: the first one not done yet. The rest stay
          // quiet until they are the one to do.
          const current = move === quest.next;
          const rowText = cn(
            "text-[13px] leading-relaxed",
            current ? "text-ink-2" : "text-ink-3"
          );
          const number = cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold",
            current ? "bg-ink text-surface" : "bg-surface-2 text-ink-3"
          );
          if (move.done) {
            return (
              <div key={move.go} className="mt-1 flex items-start gap-3 px-0 py-2">
                <span className={cn(number, "text-ink-2")}>
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
                <span className="text-[13px] leading-relaxed text-ink-3 line-through decoration-hairline-strong">
                  {move.text}
                  <span className="sr-only"> — done</span>
                </span>
              </div>
            );
          }
          return (
            <div key={move.go} className="mt-1 flex items-start gap-1">
              <button
                type="button"
                onClick={() => quest.start(move.go)}
                className="-mx-1 flex min-w-0 flex-1 items-start gap-3 rounded-sm px-1 py-2 text-left transition-colors duration-base ease-out hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className={number}>{i + 1}</span>
                <span className={rowText}>{move.text}</span>
              </button>
              {/* Savings is the one step that's fine to leave out. */}
              {move.go === "savings" && (
                <button
                  type="button"
                  onClick={quest.skipSavings}
                  className="shrink-0 rounded-sm px-2 py-2 text-[12.5px] font-medium text-ink-3 transition-colors duration-base ease-out hover:text-ink-2 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Skip
                </button>
              )}
            </div>
          );
        })}

        {/* Under a rule rather than as another row: it isn't a step, and
            numbering it would imply work the reader doesn't have to do. A
            button, not a line of prose with a page name in it, because every
            other instruction here names a row you have to go and find — this
            one can just take you there. */}
        {alternatives && nothingLogged && (
          <button
            type="button"
            onClick={onChangeMode}
            className="mt-3.5 flex w-full items-center gap-1.5 rounded-sm border-t border-hairline pt-3 text-left text-[12.5px] leading-relaxed text-ink-3 transition-colors duration-base ease-out hover:text-ink-2 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span>
              {alternatives}{" "}
              <span className="font-medium text-ink-2">Change how you budget</span>
            </span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 self-end text-ink-3" />
          </button>
        )}
      </CardContent>
    </Card>
  );
}
