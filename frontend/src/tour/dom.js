/**
 * Finding what a tour step points at.
 *
 * Steps name elements by their `data-tour` attribute, never by class or
 * structure, so restyling a card can't quietly break the tour that explains
 * it. An element that's in the DOM but laid out at zero size (display: none,
 * an empty wrapper around a component that rendered nothing) counts as absent.
 */

export function findTarget(id) {
  for (const el of document.querySelectorAll(`[data-tour="${id}"]`)) {
    const r = el.getBoundingClientRect();
    // Both, not either: a block-level wrapper around a component that rendered
    // nothing is still as wide as its column.
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

/**
 * The elements behind `target` (one id or several) and the box around all of
 * them, in viewport coordinates — or null when none is on screen.
 */
export function measureTargets(target) {
  const ids = Array.isArray(target) ? target : [target];
  const els = ids.map(findTarget).filter(Boolean);
  if (!els.length) return null;
  let top = Infinity;
  let left = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const el of els) {
    const r = el.getBoundingClientRect();
    top = Math.min(top, r.top);
    left = Math.min(left, r.left);
    right = Math.max(right, r.right);
    bottom = Math.max(bottom, r.bottom);
  }
  return {
    els,
    rect: { top, left, right, bottom, width: right - left, height: bottom - top },
  };
}

/** Whether two boxes differ by more than half a pixel anywhere. */
export function moved(a, b) {
  return (
    !a ||
    !b ||
    Math.abs(a.top - b.top) > 0.5 ||
    Math.abs(a.left - b.left) > 0.5 ||
    Math.abs(a.width - b.width) > 0.5 ||
    Math.abs(a.height - b.height) > 0.5
  );
}

/**
 * The notch and home-indicator insets, in px. CSS knows them and JS doesn't,
 * so a hidden probe reads them back once.
 */
export function readSafeArea() {
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;" +
    "padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: parseFloat(style.paddingTop) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
  };
  probe.remove();
  return insets;
}
