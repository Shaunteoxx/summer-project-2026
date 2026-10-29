import { formatDay, formatPeriodLabel } from "@/lib/period";

/**
 * Where the streak stops, when the shields can't say it.
 *
 * Restores only repair days in the current period, but the streak runs across
 * periods. When it stops at a day in one that has ended, the shields can still
 * show restores left and the button is simply gone — which, unexplained, reads
 * as restores being broken. The one exception is the grace day, when the ended
 * period's last day can still be restored with that period's own restores.
 */
export default function BreakNote({ breakDay, restore, noun, mode }) {
  if (!breakDay) return null;
  const day = formatDay(breakDay.date);
  const label = formatPeriodLabel(breakDay.period, { mode });
  let text = null;
  if (restore?.fromPeriod) {
    text = `${day} was the last day of ${label}. You can restore it today only, with that ${noun}'s restores.`;
  } else if (restore) {
    return null;
  } else if (breakDay.inActivePeriod) {
    text = `Your streak stops at ${day}. This ${noun}'s restores are used up.`;
  } else {
    text = `Your streak stops at ${day}, in ${label}. Restores only repair days in the current ${noun}, so it can't be restored.`;
  }
  return <p className="mt-2 text-[11.5px] leading-relaxed text-ink-3">{text}</p>;
}
