import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { forgetTours, markTours, updateProfile } from "@/api/endpoints";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetPeriod } from "@/hooks/useBudgetPeriod";
import { useCoarsePointer } from "@/hooks/useCoarsePointer";
import { findTarget, measureTargets } from "@/tour/dom";
import { onTour } from "@/tour/signals";
import { MARKS, TOURS, doneIdFor } from "@/tour/tours";
import TourRunner from "@/tour/TourRunner";

const NOOP = () => {};

/**
 * What a page sees with no provider above it: tours that never start. Pages
 * call useTour unconditionally, and their tests render them bare — this is
 * what keeps those tests, and anything else rendered outside the app shell,
 * exactly as they were.
 */
const ABSENT = {
  available: false,
  off: false,
  running: null,
  isDone: () => false,
  has: () => false,
  mark: NOOP,
  request: NOOP,
  release: NOOP,
  start: NOOP,
  replay: NOOP,
  setOff: NOOP,
  registerQuest: () => NOOP,
};

// Exported for tests that stand in for the provider around a single page.
export const TourContext = createContext(ABSENT);

export function useTourContext() {
  return useContext(TourContext);
}

/**
 * Ask for tour `id` while `ready` is true — once the page has the content the
 * tour points at. Whether it actually starts (seen already, tips off, another
 * tour already played on this visit) is the provider's call, not the page's.
 */
export function useTour(id, ready = true) {
  const { available, request, release } = useContext(TourContext);
  useEffect(() => {
    if (!available || !ready) return undefined;
    request(id);
    return () => release(id);
  }, [available, request, release, id, ready]);
}

/**
 * Runs the app's tours: decides which may start, remembers which have run,
 * and hands the running one to TourRunner to draw.
 *
 * The rules that keep this from being a lecture live here, not in the tours:
 *
 *   - one tour at a time;
 *   - at most one page tour or tip per visit to a page, so arriving somewhere
 *     never plays two back to back — the next waits for the next visit;
 *   - nothing starts over an open sheet, except that sheet's own tip;
 *   - when a tour ends, nothing that was waiting starts straight after it;
 *     it has to be asked for again (the page visited, the sheet reopened);
 *   - each runs once per account, and not at all with tips turned off —
 *     unless it's replayed from More, which is asking for it by name.
 */
export function TourProvider({ children, startDelay = 650 }) {
  const { user } = useAuth();
  const period = useBudgetPeriod();
  const coarse = useCoarsePointer();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  /* ── What's been seen ──────────────────────────────────────────────── */

  // The saved list, with this session's unconfirmed changes laid over it: a
  // profile refresh landing while a mark is in flight mustn't bring a tour
  // back.
  const pendingAdd = useRef(new Set());
  const pendingRemove = useRef(new Set());
  const [saved, setSaved] = useState(() => new Set());
  const savedRef = useRef(saved);
  savedRef.current = saved;

  useEffect(() => {
    const next = new Set(user?.tours ?? []);
    pendingAdd.current.forEach((id) => next.add(id));
    pendingRemove.current.forEach((id) => next.delete(id));
    setSaved(next);
  }, [user]);

  const [offOverride, setOffOverride] = useState(null);
  const off = offOverride ?? Boolean(user?.toursOff);
  const offRef = useRef(off);
  offRef.current = off;

  const mark = useCallback((ids) => {
    const fresh = ids.filter((id) => id && !savedRef.current.has(id));
    if (!fresh.length) return;
    fresh.forEach((id) => {
      pendingAdd.current.add(id);
      pendingRemove.current.delete(id);
    });
    setSaved((prev) => new Set([...prev, ...fresh]));
    markTours(fresh)
      .then(() => fresh.forEach((id) => pendingAdd.current.delete(id)))
      // Kept pending on failure, so it stays seen for the rest of the session.
      .catch(NOOP);
  }, []);

  const forget = useCallback((ids) => {
    const present = ids.filter(Boolean);
    if (!present.length) return;
    present.forEach((id) => {
      pendingRemove.current.add(id);
      pendingAdd.current.delete(id);
    });
    setSaved((prev) => {
      const next = new Set(prev);
      present.forEach((id) => next.delete(id));
      return next;
    });
    forgetTours(present)
      .then(() => present.forEach((id) => pendingRemove.current.delete(id)))
      .catch(NOOP);
  }, []);

  const has = useCallback((id) => saved.has(id), [saved]);
  const isDone = useCallback((id) => saved.has(doneIdFor(id)), [saved]);
  const isDoneNow = (id) => savedRef.current.has(doneIdFor(id));

  const setOff = useCallback((value) => {
    setOffOverride(value);
    updateProfile({ toursOff: value }).catch(() => setOffOverride(!value));
  }, []);

  // Setting a savings target during setup — or anywhere, once setup has begun
  // — ticks that step even at $0, which the budget figures alone can't tell
  // apart from never having set one.
  useEffect(
    () =>
      onTour("savings:saved", () => {
        const s = savedRef.current;
        if (s.has(MARKS.begun) && !s.has(MARKS.done)) mark([MARKS.savings]);
      }),
    [mark]
  );

  /* ── The running tour ──────────────────────────────────────────────── */

  const [run, setRun] = useState(null);
  const runRef = useRef(null);
  const seq = useRef(0);

  // A page visit, for the one-page-tour-per-visit rule.
  const visit = useRef({ path: pathname, used: false });
  if (visit.current.path !== pathname) visit.current = { path: pathname, used: false };

  const requests = useRef(new Map());
  const [requestTick, bump] = useReducer((n) => n + 1, 0);
  const forced = useRef(null);

  const questApi = useRef(null);
  const registerQuest = useCallback((api) => {
    questApi.current = api;
    return () => {
      if (questApi.current === api) questApi.current = null;
    };
  }, []);

  const replace = (next) => {
    runRef.current = next;
    setRun(next);
  };

  const endRun = useCallback(
    ({ completed = false } = {}) => {
      const current = runRef.current;
      if (!current) return;
      replace(null);
      const tour = TOURS[current.id];
      if (current.shown > 0 || completed) {
        mark([doneIdFor(current.id), ...(tour.alsoMarks ?? [])]);
      }
      // No chaining: anything that was waiting is asked for again, later.
      requests.current.forEach((req) => {
        req.stale = true;
      });
      if (tour.kind !== "sheet") visit.current.used = true;
    },
    [mark]
  );

  // Built fresh each render and read through a ref, so the runner's per-frame
  // checks always see the current page, mode and quest.
  const ctxRef = useRef(null);

  const begin = useCallback((id, { label } = {}) => {
    const tour = TOURS[id];
    if (!tour) return false;
    const ctx = ctxRef.current;
    let steps = tour.steps.filter((step) => !step.when || step.when(ctx));
    // A page tour only counts what's on screen now, so its "2 of 4" is true.
    // Setup moves point at things that arrive later — the sheet they open,
    // the page they return to — so they're taken as written.
    if (tour.kind !== "quest") {
      steps = steps.filter((step) => {
        const target = typeof step.target === "function" ? step.target(ctx) : step.target;
        return target == null || measureTargets(target);
      });
      if (!steps.length) {
        const req = requests.current.get(id);
        if (req) req.stale = true;
        return false;
      }
    }
    if (forced.current === id) forced.current = null;
    if (tour.kind === "page" || tour.kind === "tip") visit.current.used = true;
    seq.current += 1;
    replace({
      id,
      key: seq.current,
      kind: tour.kind,
      steps,
      index: 0,
      history: [],
      shown: 0,
      label: label ?? tour.label,
      since: performance.now(),
    });
    return true;
  }, []);

  /** Start `id` now, whatever the rules say. For explicit asks only. */
  const start = useCallback(
    (id, opts = {}) => {
      if (runRef.current) endRun({ completed: true });
      begin(id, opts);
    },
    [begin, endRun]
  );

  const advance = useCallback(
    ({ skipped = false } = {}) => {
      const current = runRef.current;
      if (!current) return;
      if (current.index + 1 >= current.steps.length) {
        endRun({ completed: true });
        return;
      }
      replace({
        ...current,
        index: current.index + 1,
        history: skipped ? current.history : [...current.history, current.index],
        since: performance.now(),
      });
    },
    [endRun]
  );

  const back = useCallback(() => {
    const current = runRef.current;
    if (!current || !current.history.length) return;
    const history = current.history.slice(0, -1);
    replace({
      ...current,
      index: current.history.at(-1),
      history,
      since: performance.now(),
    });
  }, []);

  const shownOne = useCallback(() => {
    if (runRef.current) runRef.current.shown += 1;
  }, []);

  const isCurrent = useCallback((key) => runRef.current?.key === key, []);

  /* ── Asking and scheduling ─────────────────────────────────────────── */

  const request = useCallback((id) => {
    if (!requests.current.has(id)) requests.current.set(id, { stale: false });
    bump();
  }, []);

  const release = useCallback(
    (id) => {
      requests.current.delete(id);
      bump();
      // The page or sheet it explains has gone; so does the tour. Setup moves
      // cross pages by design and are never tied to one.
      if (runRef.current?.id === id && TOURS[id]?.kind !== "quest") endRun();
    },
    [endRun]
  );

  /** Forget `ids` and start the first again on `route`, even with tips off. */
  const replay = useCallback(
    (ids, route) => {
      forget(ids.map(doneIdFor));
      const req = requests.current.get(ids[0]);
      if (req) req.stale = false;
      forced.current = ids[0];
      if (route && route !== visit.current.path) navigate(route);
      else bump();
    },
    [forget, navigate]
  );

  const eligible = (id) => {
    const tour = TOURS[id];
    const req = requests.current.get(id);
    if (!tour || !req || tour.kind === "quest") return false;
    if (forced.current === id) return true;
    if (req.stale || offRef.current || isDoneNow(id)) return false;
    if (tour.requires && !isDoneNow(tour.requires)) return false;
    if ((tour.kind === "page" || tour.kind === "tip") && visit.current.used) return false;
    return true;
  };

  const retry = useRef(null);
  useEffect(() => () => clearTimeout(retry.current), []);

  useEffect(() => {
    if (!user || run) return undefined;
    if (![...requests.current.keys()].some(eligible)) return undefined;
    // A beat after the page settles, so a tour never lands on content that is
    // still arriving — and never before the page has been seen at all.
    const timer = setTimeout(
      () => {
        if (runRef.current) return;
        const best = [...requests.current.keys()]
          .filter(eligible)
          .sort((a, b) => (TOURS[b].priority ?? 0) - (TOURS[a].priority ?? 0))[0];
        if (!best) return;
        // Nothing over an open sheet but that sheet's own tip.
        const sheetOpen = document.querySelector('[aria-modal="true"]:not([data-tour-card])');
        if (TOURS[best].kind !== "sheet" && sheetOpen) {
          retry.current = setTimeout(bump, 500);
          return;
        }
        begin(best);
      },
      forced.current ? 150 : startDelay
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestTick, run, saved, off, pathname, user, startDelay]);

  /* ── Context ───────────────────────────────────────────────────────── */

  const ctx = {
    noun: period.noun,
    mode: period.mode,
    pathname,
    coarse,
    username: user?.username,
    get quest() {
      return questApi.current;
    },
    navigate,
    start,
    exists: (id) => Boolean(findTarget(id)),
    filled: (id) =>
      document.querySelector(`[data-tour="${id}"]`)?.getAttribute("data-filled") === "true",
  };
  ctxRef.current = ctx;

  const value = useMemo(
    () => ({
      available: Boolean(user),
      off,
      running: run?.id ?? null,
      isDone,
      has,
      mark,
      request,
      release,
      start,
      replay,
      setOff,
      registerQuest,
    }),
    [user, off, run?.id, isDone, has, mark, request, release, start, replay, setOff, registerQuest]
  );

  return (
    <TourContext.Provider value={value}>
      {children}
      {run && (
        <TourRunner
          key={run.key}
          run={run}
          ctxRef={ctxRef}
          onAdvance={advance}
          onBack={back}
          onEnd={endRun}
          onShown={shownOne}
          isCurrent={isCurrent}
        />
      )}
    </TourContext.Provider>
  );
}
