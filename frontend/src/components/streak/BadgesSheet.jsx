import { Check } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import StreakBadge from "@/components/StreakBadge";
import { BADGES, badgeAt, nextBadge, tierFor } from "@/lib/streakBadges";

/**
 * The whole badge ladder: the one you hold, the ones you've reached before
 * (off your best streak — the streak resets, what you once got to doesn't),
 * and the ones still ahead, with the days to the next.
 */
export default function BadgesSheet({ open, onClose, currentStreak, longestStreak }) {
  const tier = tierFor(currentStreak);
  const bestTier = tierFor(longestStreak);
  const top = BADGES.length;
  const next = nextBadge(currentStreak);

  return (
    <BottomSheet open={open} onClose={onClose} title="Streak Badges">
      <div className="space-y-3 pb-2">
        <p className="text-[13px] leading-relaxed text-ink-3">
          Every 5 days on budget earns the next badge. Go over and the streak
          starts again from Bronze, unless a restore saves the day.
        </p>
        <ul className="divide-y divide-hairline">
          {BADGES.map((b, i) => {
            const t = i + 1;
            // The top row stands for every level past it too.
            const held = t === top ? tier >= top : tier === t;
            const shown = held && t === top ? badgeAt(tier) : badgeAt(t);
            const earned = !held && bestTier >= t;
            const upNext = !held && t === Math.min(tier + 1, top) && tier < top;
            return (
              <li key={b.key} className="flex items-center gap-3 py-2.5">
                <StreakBadge badge={shown} size={36} locked={!held && !earned} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-medium tracking-[-0.01em]">{shown.label}</p>
                  <p className="text-meta text-ink-3">
                    {t === top
                      ? `${badgeAt(t).days} days, then a level every 5`
                      : `${badgeAt(t).days} days`}
                  </p>
                </div>
                {held ? (
                  <span
                    className="text-[12.5px] font-medium"
                    style={{ color: `hsl(var(--badge-${b.key}))` }}
                  >
                    Current
                  </span>
                ) : earned ? (
                  <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
                    <Check className="h-3.5 w-3.5" /> Earned
                  </span>
                ) : upNext ? (
                  <span className="num text-[12.5px] text-ink-3">
                    {next.daysToGo} {next.daysToGo === 1 ? "day" : "days"} to go
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      </div>
    </BottomSheet>
  );
}
