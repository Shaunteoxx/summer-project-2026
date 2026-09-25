/**
 * What the app tells the tour, and nothing more.
 *
 * The setup quest follows things the reader actually does: an entry saved, a
 * savings target set, a budget period started. Those happen deep inside sheets
 * that have no business knowing a tour exists, so they announce the fact here
 * and the tour listens. With nothing listening a call costs a Map lookup,
 * which is why the sheets can make it unconditionally, in tests included.
 *
 *   entry:added    an add sheet handed its entry to the ledger ({ type })
 *   entry:saved    the server has that entry ({ type })
 *   entry:failed   it didn't; the sheet reopens on the draft
 *   savings:saved  a savings target was saved, $0 included
 *   period:saved   a days period or an allowance term was started or changed
 */
const listeners = new Map();

// When each signal last fired. A step waiting on one can start a frame after
// it went off — a local server answers a save before the step that waits for it
// has rendered — and it would otherwise wait forever for news it just missed.
const lastFired = new Map();

export function emitTour(name, detail) {
  lastFired.set(name, performance.now());
  // A copy: a listener that ends the tour unsubscribes others mid-loop.
  for (const fn of [...(listeners.get(name) ?? [])]) fn(detail);
}

/** Subscribe to one signal. Returns the unsubscribe. */
export function onTour(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name)?.delete(fn);
}

/** Whether `name` has fired at or after `since` (a performance.now() time). */
export function firedSince(name, since) {
  return (lastFired.get(name) ?? -Infinity) >= since;
}
