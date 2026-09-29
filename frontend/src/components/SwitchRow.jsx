import { useId, useState } from "react";

import { haptic } from "@/lib/haptics";

/**
 * A labelled on/off setting: title, supporting text, and a switch, with the
 * whole row as the hit target — the description is usually the widest part, so
 * making only the track tappable wastes the easiest place to aim on a phone.
 *
 * `role="switch"` rather than a checkbox because this takes effect on save
 * alongside the rest of the form, and screen readers announce on/off for it.
 * The name and description are wired up by id instead of being folded into the
 * button's text, so the announcement stays "Repeat every month, on" rather than
 * reading the whole paragraph back.
 *
 * The row is also a `group`, so holding it anywhere turns the knob to glass
 * (see SwitchTrack): the press lands on the switch it's about to flip.
 *
 * Transitions are plain CSS, so the global prefers-reduced-motion rule in
 * index.css already covers them. Plain CSS matters here beyond that: this
 * sits in the add sheet, where a framer layout animation once kept a closed
 * sheet mounted over the page.
 */
export default function SwitchRow({ checked, onChange, label, description, disabled }) {
  const id = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-describedby={description ? `${id}-hint` : undefined}
      disabled={disabled}
      onClick={() => {
        haptic();
        onChange(!checked);
      }}
      className={`group flex w-full items-center gap-4 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? "border-hairline-strong bg-surface-2"
          : "border-hairline-strong hover:bg-surface-2 active:bg-surface-3"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block font-semibold">
          {label}
        </span>
        {description && (
          <span
            id={`${id}-hint`}
            className="mt-0.5 block text-[12px] leading-relaxed text-ink-3"
          >
            {description}
          </span>
        )}
      </span>
      <SwitchTrack checked={checked} />
    </button>
  );
}

/**
 * The switch itself, for a row that is already the control (it carries the
 * role and the click, and the `group` class the held look keys off).
 * Decorative, so hidden from screen readers — the row announces on/off.
 *
 * Drawn the iOS 26 way: a wider track and a pill of a knob, solid white at
 * rest. Hold the row and the knob swells into a lens of clear glass; let go
 * and it crosses as glass and lands solid (.switch-knob in index.css, the
 * switch-lens keyframes in tailwind.config.js).
 */
export function SwitchTrack({ checked }) {
  // Whether the switch has flipped since it first drew, kept the way React
  // recommends for responding to a prop change during render. The trip
  // animation waits on it: otherwise a switch that arrives already on would
  // swell into glass on first paint, for nothing.
  const [shown, setShown] = useState(checked);
  const [flipped, setFlipped] = useState(false);
  if (shown !== checked) {
    setShown(checked);
    setFlipped(true);
  }

  return (
    // Off is a see-through ink, as iOS's grey fill is, not a solid surface:
    // a held row turns surface-3, and a surface-3 track vanished into it
    // just as the knob swelled into glass, leaving a bubble floating on
    // nothing. Translucent, it's always a step darker than what's behind.
    <span
      aria-hidden="true"
      className={`flex h-7 w-[52px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-enter ease-out ${
        checked ? "bg-positive" : "bg-ink/[0.14] dark:bg-ink/[0.16]"
      }`}
    >
      {/* Two layers, because a running animation owns `transform`: the outer
          one slides (with a touch of overshoot, the gel in Apple's), and the
          inner one is the knob that turns to glass. */}
      <span
        className={`flex transition-transform duration-[340ms] ease-[cubic-bezier(0.3,1.35,0.5,1)] ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      >
        <span
          className={`switch-knob h-6 w-[30px] rounded-full ${
            flipped ? (checked ? "animate-switch-on" : "animate-switch-off") : ""
          }`}
        />
      </span>
    </span>
  );
}
