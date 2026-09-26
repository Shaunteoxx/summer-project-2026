import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";

import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";
import { DUR, EASE } from "@/animations/variants";
import { measureTargets, moved, readSafeArea } from "@/tour/dom";
import { firedSince, onTour } from "@/tour/signals";

/** Room around the element inside the spotlight. */
const PAD = 6;
/** Between the spotlight and the card. */
const GAP = 12;
/** The card's clearance from the screen edges. */
const EDGE = 12;
/** How long an element has to hold still before the card appears beside it —
 *  long enough for a scroll or a sheet's spring to finish, short enough that
 *  nobody waits. Capped, for an element that never quite stops moving. */
const SETTLE_MS = 120;
const SETTLE_CAP_MS = 900;
/** An element that vanishes for longer than this has really gone. */
const GONE_GRACE_MS = 700;
/** How long a step waits for its element to appear. Setup moves wait longest:
 *  they cross pages, open sheets and wait on the API. */
const WAIT_MS = { page: 900, tip: 900, sheet: 1500, quest: 12000 };
const DIM = "hsl(0 0% 0% / 0.52)";

const resolve = (value, ctx) => (typeof value === "function" ? value(ctx) : value);
const asButton = (value) => (typeof value === "string" ? { label: value } : value || null);

function padded(rect, pad) {
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    right: rect.right + pad,
    bottom: rect.bottom + pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

/**
 * Scroll the element into the part of the screen the app bar and the dock
 * leave clear — unless it's already there, so a tour of a page that fits the
 * screen never moves it.
 */
function reveal({ els, rect }, { reduce, safe }) {
  const top = 64 + safe.top;
  const bottom = window.innerHeight - safe.dock;
  if (rect.top >= top && rect.bottom <= bottom) return;
  const tall = rect.height > (bottom - top) * 0.8;
  els[0].scrollIntoView?.({
    block: tall ? "start" : "center",
    behavior: reduce ? "auto" : "smooth",
  });
}

/**
 * Draws the running tour: a dimmed screen with a spotlight cut around the
 * element, and a card beside it saying what it is.
 *
 * Each step is followed frame by frame rather than measured once, because the
 * things tours point at move — pages scroll, sheets spring up, a keypad takes
 * over a form. The card waits for its element to hold still, so it never
 * chases one across the screen.
 *
 * An ordinary step holds the page (the card's buttons move things on). An
 * `interactive` step cuts a real hole: the element takes taps and the rest of
 * the screen doesn't, which is how the setup guide has you log a real entry.
 */
export default function TourRunner({ run, ctxRef, onAdvance, onBack, onEnd, onShown, isCurrent }) {
  const step = run.steps[run.index];
  const ctx = ctxRef.current;
  const reduce = useReducedMotion();
  const safe = useMemo(readSafeArea, []);
  const titleId = useId();
  const bodyId = useId();
  const cardRef = useRef(null);

  const blocking = step.blocking !== false;
  const interactive = Boolean(step.interactive);
  const modal = blocking && !interactive;
  const isLast = run.index === run.steps.length - 1;

  const [hole, setHole] = useState(null);
  const [dim, setDim] = useState(false);
  // Which step the card is up for, not just whether it's up. Pressing Next
  // renders the new step's words straight away; as a plain boolean the card
  // stayed up for that render and flashed the next title at the old spot
  // before hiding to scroll to the new one.
  const stepKey = `${run.key}:${run.index}`;
  const [cardFor, setCardFor] = useState(null);
  const card = cardFor === stepKey;
  const [cardHeight, setCardHeight] = useState(0);
  const [viewport, setViewport] = useState(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
  }));

  // What's on screen, readable from the frame loop without re-subscribing.
  const shown = useRef({ hole: null, dim: false, cardFor: null });
  const put = useCallback((next) => {
    const now = shown.current;
    if ("hole" in next && (next.hole === null ? now.hole !== null : moved(now.hole, next.hole))) {
      now.hole = next.hole;
      setHole(next.hole);
    }
    if ("dim" in next && next.dim !== now.dim) {
      now.dim = next.dim;
      setDim(next.dim);
    }
    if ("cardFor" in next && next.cardFor !== now.cardFor) {
      now.cardFor = next.cardFor;
      setCardFor(next.cardFor);
    }
  }, []);

  useEffect(() => {
    const onResize = () =>
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Hand focus back to wherever it was when the tour began, if that's still
  // on the page.
  useEffect(() => {
    const previous = document.activeElement;
    return () => {
      if (previous?.isConnected && typeof previous.focus === "function") {
        previous.focus({ preventScroll: true });
      }
    };
  }, []);

  /* ── Following the step ────────────────────────────────────────────── */

  useEffect(() => {
    const startedAt = performance.now();
    let alive = true;
    let frame = 0;
    let foundAt = null;
    let goneSince = null;
    let last = null;
    let stableSince = 0;
    let counted = false;
    const key = `${run.key}:${run.index}`;
    put({ cardFor: null });

    const stop = (then) => {
      if (!alive) return;
      alive = false;
      cancelAnimationFrame(frame);
      then();
    };

    const unsubscribe = [];
    if (step.advanceOn) unsubscribe.push(onTour(step.advanceOn, () => stop(() => onAdvance())));
    if (step.failOn) unsubscribe.push(onTour(step.failOn, () => stop(() => onEnd())));

    const appear = () => {
      put({ cardFor: key });
      if (counted) return;
      counted = true;
      onShown();
      if (step.haptic) haptic(step.haptic);
    };

    const tick = () => {
      if (!alive) return;
      const c = ctxRef.current;
      const now = performance.now();

      // A signal that fired between the last step ending and this one
      // starting — a fast save — still counts.
      if (step.advanceOn && firedSince(step.advanceOn, run.since)) return stop(() => onAdvance());
      if (step.advanceWhen?.(c)) return stop(() => onAdvance());

      if (step.route && c.pathname !== step.route) {
        put({ dim: false, cardFor: null });
        if (now - startedAt > (step.routeWait ?? 30000)) return stop(() => onEnd());
        frame = requestAnimationFrame(tick);
        return;
      }

      const target = resolve(step.target, c);
      if (target == null) {
        put({ hole: null, dim: blocking });
        appear();
        frame = requestAnimationFrame(tick);
        return;
      }

      const found = measureTargets(target);
      if (!found) {
        if (foundAt !== null) {
          goneSince ??= now;
          if (now - goneSince > GONE_GRACE_MS) {
            return stop(() => (step.onGone === "back" ? onBack() : onEnd()));
          }
          put({ dim: false, cardFor: null });
        } else if (now - startedAt > (step.wait ?? WAIT_MS[run.kind] ?? 900)) {
          // A page tour steps past what isn't there; a setup move that can't
          // find the sheet it opened has been abandoned.
          return stop(() => (run.kind === "quest" ? onEnd() : onAdvance({ skipped: true })));
        } else if (now - startedAt > 200) {
          put({ dim: false });
        }
        frame = requestAnimationFrame(tick);
        return;
      }

      goneSince = null;
      if (foundAt === null) {
        foundAt = now;
        stableSince = now;
        if (!step.noScroll) reveal(found, { reduce, safe });
      }
      const box = padded(found.rect, step.pad ?? PAD);
      if (moved(last, box)) {
        last = box;
        stableSince = now;
      }
      put({ hole: box, dim: blocking });
      if (now - stableSince > SETTLE_MS || now - foundAt > SETTLE_CAP_MS) appear();
      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      unsubscribe.forEach((off) => off());
    };
    // The step is fixed for the life of this effect: it re-runs per step.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.key, run.index]);

  /* ── Buttons ───────────────────────────────────────────────────────── */

  const primary = asButton(
    step.primary === undefined
      ? isLast && run.kind !== "quest"
        ? "Done"
        : "Next"
      : resolve(step.primary, ctx)
  );
  const secondary = asButton(resolve(step.secondary, ctx));
  const canSkip = step.skip !== false && !(isLast && run.kind !== "quest");
  const canBack = run.kind !== "quest" && run.history.length > 0;

  const dismiss = useCallback(() => onEnd({ completed: true }), [onEnd]);

  const choose = (button, then) => {
    const key = run.key;
    button.run?.(ctxRef.current);
    // The button may have started something else (the next setup move); if
    // it did, this tour is already over.
    if (isCurrent(key)) then();
  };

  /* ── Keys, focus, and the page behind ──────────────────────────────── */

  useEffect(() => {
    if (!card) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") {
        // Captured, so a sheet under the tour doesn't close as well.
        e.preventDefault();
        e.stopPropagation();
        dismiss();
        return;
      }
      if (e.key !== "Tab" || !modal || !cardRef.current) return;
      const buttons = [...cardRef.current.querySelectorAll("button:not([disabled])")];
      if (!buttons.length) return;
      e.preventDefault();
      e.stopPropagation();
      const at = buttons.indexOf(document.activeElement);
      const next = e.shiftKey
        ? at <= 0
          ? buttons.length - 1
          : at - 1
        : (at + 1) % buttons.length;
      buttons[next].focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [card, modal, dismiss]);

  // Toasts step aside while a card is up (see index.css): they sit over the
  // add button, which is exactly what a setup step asks you to tap.
  useEffect(() => {
    if (!card) return undefined;
    document.body.setAttribute("data-touring", "");
    return () => document.body.removeAttribute("data-touring");
  }, [card]);

  useEffect(() => {
    if (!card || !modal) return undefined;
    const frame = requestAnimationFrame(() => {
      const target =
        cardRef.current?.querySelector("[data-primary]") ??
        cardRef.current?.querySelector("button");
      target?.focus({ preventScroll: true });
    });
    // The page is out of reach while the card is up: no tabbing behind it,
    // and a screen reader reads the card rather than the page.
    const root = document.getElementById("root");
    root?.setAttribute("inert", "");
    return () => {
      cancelAnimationFrame(frame);
      root?.removeAttribute("inert");
    };
  }, [card, modal, run.index]);

  const title = resolve(step.title, ctx);
  const body = resolve(step.body, ctx);

  useLayoutEffect(() => {
    if (card && cardRef.current) setCardHeight(cardRef.current.offsetHeight);
  }, [card, run.index, title, body]);

  /* ── Where the card goes ───────────────────────────────────────────── */

  const height = cardHeight || 160;
  const minTop = safe.top + EDGE;
  const maxTop = viewport.height - safe.bottom - EDGE - height;
  let top;
  if (!hole) {
    top =
      step.placement === "top"
        ? minTop + 56
        : Math.max(minTop, (viewport.height - height) / 2);
  } else {
    const below = hole.bottom + GAP;
    const above = hole.top - GAP - height;
    if (below <= maxTop) top = below;
    else if (above >= minTop) top = above;
    // Neither side has room: the roomier one, against the screen edge.
    else top = viewport.height - hole.bottom >= hole.top ? maxTop : minTop;
  }

  const progress =
    run.label ??
    (run.kind === "quest" ? "Setup" : run.steps.length > 1 ? `${run.index + 1} of ${run.steps.length}` : "Tip");
  const radius = step.radius ?? 14;
  const block = { position: "absolute", pointerEvents: "auto", touchAction: "none" };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] overflow-hidden"
      style={{ pointerEvents: "none" }}
      data-tour-overlay=""
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: dim ? 1 : 0 }}
        transition={{ duration: reduce ? 0 : DUR.base, ease: EASE }}
        className="absolute"
        style={
          hole
            ? {
                top: hole.top,
                left: hole.left,
                width: hole.width,
                height: hole.height,
                borderRadius: radius,
                boxShadow: `0 0 0 200vmax ${DIM}`,
              }
            : { inset: 0, background: DIM }
        }
      />

      {card && interactive && hole && (
        <span
          aria-hidden="true"
          // Ink, which flips with the theme: a white ring vanished against
          // the white sheet it outlines in light mode.
          className="absolute animate-tour-pulse border-2 border-ink/70"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: radius,
          }}
        />
      )}

      {/* What holds the page. An ordinary step covers all of it; an
          interactive one leaves the element's own box open. */}
      {card && blocking &&
        (interactive && hole ? (
          <>
            <div style={{ ...block, top: 0, left: 0, right: 0, height: Math.max(0, hole.top) }} />
            <div style={{ ...block, top: hole.bottom, left: 0, right: 0, bottom: 0 }} />
            <div style={{ ...block, top: hole.top, left: 0, width: Math.max(0, hole.left), height: hole.height }} />
            <div style={{ ...block, top: hole.top, left: hole.right, right: 0, height: hole.height }} />
          </>
        ) : (
          <div style={{ ...block, inset: 0 }} />
        ))}

      {card && (
        <motion.div
          key={`${run.key}:${run.index}`}
          ref={cardRef}
          data-tour-card=""
          role={modal ? "dialog" : "region"}
          aria-modal={modal ? "true" : undefined}
          aria-labelledby={titleId}
          aria-describedby={bodyId}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0 : DUR.enter, ease: EASE }}
          className="absolute rounded-lg border border-hairline bg-surface p-4 text-ink shadow-float"
          style={{
            top,
            left: "50%",
            x: "-50%",
            width: `min(calc(100vw - ${EDGE * 2}px), calc(30rem - ${EDGE * 2}px))`,
            pointerEvents: "auto",
          }}
        >
          <div className="flex min-h-[20px] items-center justify-between gap-3">
            <p className="text-overline text-ink-3">{progress}</p>
            {canSkip && (
              <button
                type="button"
                onClick={dismiss}
                className="-my-1.5 -mr-1.5 rounded-sm px-1.5 py-1.5 text-[12.5px] font-medium text-ink-3 transition-colors duration-base ease-out hover:text-ink-2 active:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {run.kind === "quest" ? "Stop Guide" : "Skip"}
              </button>
            )}
          </div>
          <h2
            id={titleId}
            className="mt-1.5 text-[16px] font-semibold leading-snug tracking-[-0.015em]"
          >
            {title}
          </h2>
          <p id={bodyId} className="mt-1 text-[13.5px] leading-relaxed text-ink-2">
            {body}
          </p>
          {(primary || secondary || canBack) && (
            <div className="mt-3.5 flex items-center justify-end gap-2">
              {canBack && (
                <Button variant="ghost" size="sm" className="mr-auto" onClick={onBack}>
                  Back
                </Button>
              )}
              {secondary && (
                <Button variant="outline" size="sm" onClick={() => choose(secondary, dismiss)}>
                  {secondary.label}
                </Button>
              )}
              {primary && (
                <Button size="sm" data-primary="" onClick={() => choose(primary, () => onAdvance())}>
                  {primary.label}
                </Button>
              )}
            </div>
          )}
        </motion.div>
      )}

      {/* Interactive steps leave focus on the page, so they're read out here. */}
      <p className="sr-only" aria-live="polite">
        {card && !modal ? `${title}. ${body}` : ""}
      </p>
    </div>,
    document.body
  );
}
