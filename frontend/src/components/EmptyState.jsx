/**
 * The one shape every "there's nothing here yet" moment takes: a 52px tile, a
 * line naming the gap, a sentence explaining what fills it, and at most one
 * action.
 *
 * Centred and on the canvas rather than boxed in a card — a card would draw a
 * border around an absence, which is the one thing on the screen that doesn't
 * need weight. The action is sized to its label instead of running full width,
 * so an empty screen doesn't look like a form waiting to be submitted.
 */
export default function EmptyState({ icon: Icon, title, body, action }) {
  return (
    <div className="px-6 pt-[74px] text-center">
      <span className="mx-auto grid h-[52px] w-[52px] place-items-center rounded-lg bg-surface-2 text-ink-3">
        <Icon className="h-6 w-6" strokeWidth={1.6} />
      </span>
      <h2 className="mt-[18px] text-[17px] font-semibold tracking-[-0.015em]">
        {title}
      </h2>
      <p className="mx-auto mt-[7px] max-w-[19rem] text-[13.5px] leading-relaxed text-ink-3">
        {body}
      </p>
      {action}
    </div>
  );
}
