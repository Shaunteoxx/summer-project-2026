import { useId } from "react";

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
 * Transitions are plain CSS, so the global prefers-reduced-motion rule in
 * index.css already covers them.
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
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-4 rounded-xl border p-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 ${
        checked
          ? "border-primary/30 bg-primary/5"
          : "border-border hover:bg-accent/50"
      }`}
    >
      <span className="min-w-0 flex-1">
        <span id={`${id}-label`} className="block font-semibold">
          {label}
        </span>
        {description && (
          <span
            id={`${id}-hint`}
            className="mt-0.5 block text-xs text-muted-foreground"
          >
            {description}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
          checked ? "bg-primary" : "bg-muted-foreground/30"
        }`}
      >
        <span
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}
