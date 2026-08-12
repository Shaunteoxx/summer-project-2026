/**
 * Cold-start loader — the auth gate and first paint.
 *
 * Deliberately not a spinner. A rotating ring says "something is happening"
 * without saying what or for how much longer, and the old version stacked two
 * motion sources (a pulsing emerald tile plus a spinning ring) on a gradient
 * wash. This is one indeterminate track that at least travels in a direction,
 * under the wordmark — the only place in the app where the brand is the hero.
 *
 * The mark inverts between themes rather than switching to a colour, so the
 * loader never introduces a hue the rest of the app doesn't use.
 */
export default function BrandLoader() {
  return (
    <div
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-canvas"
      role="status"
      aria-label="Loading Broke No More"
    >
      <div className="grid h-[52px] w-[52px] place-items-center rounded-[17px] bg-ink text-[26px] font-semibold tracking-[-0.05em] text-canvas">
        B
      </div>
      <p className="mt-[18px] text-base font-semibold tracking-tight">Broke No More</p>
      <p className="mt-[5px] text-[12.5px] text-ink-3">Working out your budget…</p>

      <div className="mt-[26px] h-0.5 w-[120px] overflow-hidden rounded-full bg-surface-3">
        <div className="h-full w-[38%] rounded-full bg-ink motion-safe:animate-track-slide" />
      </div>
    </div>
  );
}
