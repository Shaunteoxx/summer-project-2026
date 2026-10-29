import { Flame, Shield, Check, X, Minus } from "lucide-react";

const DOW = ["S", "M", "T", "W", "T", "F", "S"];
const dowOf = (ymd) => DOW[new Date(`${ymd}T00:00:00Z`).getUTCDay()];

const CELL = {
  win: { Icon: Check, cls: "bg-positive/[0.12] text-positive", label: "within budget" },
  // Green, not amber. Amber says "something still needs your attention", which
  // is wrong once a restore has succeeded — the streak IS intact. The shield
  // glyph carries the distinction instead: a tick means you stayed within
  // budget, a shield means the day was repaired. Colour tells you the outcome,
  // shape tells you how you got there.
  saved: { Icon: Shield, cls: "bg-positive/[0.12] text-positive", label: "restored" },
  break: { Icon: X, cls: "bg-negative/[0.12] text-negative", label: "over budget" },
  // Outside every budget period, so it has no budget to be judged against.
  untracked: {
    Icon: Minus,
    cls: "bg-surface-2 text-ink-3/60",
    label: "not in a budget period",
  },
  none: { Icon: Minus, cls: "bg-surface-2 text-ink-3/60", label: "no data" },
};

export default function DayCell({ day }) {
  const isToday = day.status === "today";
  const within = isToday ? day.within : day.status === "win";
  const meta = isToday
    ? within
      ? { Icon: Flame, cls: "bg-ink text-surface", label: "today, on track" }
      : { Icon: Flame, cls: "bg-negative text-white", label: "today, over budget" }
    : CELL[day.status] ?? CELL.none;
  const { Icon, cls, label } = meta;

  return (
    <div className="flex flex-1 flex-col items-center gap-1">
      <span
        className={`flex h-9 w-full items-center justify-center rounded-[8px] ${cls}`}
        role="img"
        aria-label={`${day.date}: ${label}`}
      >
        <Icon className="h-4 w-4" strokeWidth={2.5} />
      </span>
      <span className="text-[10px] font-medium text-ink-3">
        {dowOf(day.date)}
      </span>
    </div>
  );
}
