/**
 * Best-effort haptic feedback.
 *
 * Android browsers expose navigator.vibrate. iOS Safari has no vibration API
 * at all; since iOS 18 the one thing a page can do that fires the Taptic Engine
 * is toggle an <input type="checkbox" switch>, so on iOS a throwaway hidden
 * switch is clicked through its label — one click per pulse. Older iOS, and
 * desktops, simply feel nothing.
 *
 * Every pulse repeats something already on screen, so failing silently is the
 * right failure: nothing here may throw into the action it's confirming. It
 * also stays quiet until the page has had a real tap, because Chrome refuses
 * (and logs a warning for) vibration without one — a streak that went up
 * overnight is celebrated on load, before any tap has happened.
 *
 * It can be turned off under More → Preferences. The choice is kept on the
 * device, like the theme: it's about this phone, not the account.
 */

const STORAGE_KEY = "bnm_haptics";

/** On unless this device has been told otherwise. */
export function hapticsEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setHapticsEnabled(on) {
  try {
    if (on) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, "off");
  } catch {
    // Storage unavailable: the choice lasts until the page closes, which is
    // the best a private window allows.
  }
}

// Android durations in ms; iOS gets the pulse count, spaced IOS_GAP_MS apart.
const PATTERNS = {
  // A key, a switch, a swipe crossing the point where letting go deletes.
  tick: { vibrate: 6, pulses: 1 },
  // A save landed, a milestone reached.
  success: { vibrate: [10, 70, 16], pulses: 2 },
  // A save refused by validation.
  warning: { vibrate: [16, 60, 16, 60, 16], pulses: 3 },
};
const IOS_GAP_MS = 110;

const isIOS = () =>
  /iP(hone|od|ad)/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac, but no Mac has a touchscreen.
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function iosPulse() {
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.display = "none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.body.appendChild(label);
  label.click();
  label.remove();
}

export function haptic(kind = "tick") {
  try {
    if (typeof navigator === "undefined" || !hapticsEnabled()) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
    const pattern = PATTERNS[kind] ?? PATTERNS.tick;

    if (typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern.vibrate);
    } else if (isIOS()) {
      for (let i = 0; i < pattern.pulses; i += 1) {
        if (i === 0) iosPulse();
        else setTimeout(iosPulse, i * IOS_GAP_MS);
      }
    }
  } catch {
    // Feedback is decoration; the action it confirms has already happened.
  }
}
