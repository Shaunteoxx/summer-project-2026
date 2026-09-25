import { Flame } from "lucide-react";

import { cn } from "@/lib/utils";

const C = 24; // centre of the 48-unit canvas

/** Points of a regular polygon, as an SVG points string. */
function polygon(sides, radius, rotateDeg = -90, innerRadius = null) {
  const count = innerRadius ? sides * 2 : sides;
  return Array.from({ length: count }, (_, i) => {
    const r = innerRadius && i % 2 ? innerRadius : radius;
    const a = ((rotateDeg + (360 / count) * i) * Math.PI) / 180;
    return `${(C + r * Math.cos(a)).toFixed(2)},${(C + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

const vertex = (radius, deg) => {
  const a = (deg * Math.PI) / 180;
  return [C + radius * Math.cos(a), C + radius * Math.sin(a)];
};

// The outline every badge shares: a tint of its colour, ruled in the colour.
const BODY = {
  fill: "currentColor",
  fillOpacity: 0.13,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinejoin: "round",
};
// Inner rules sit back from the outline so the flame stays the focus.
const RULE = { fill: "none", stroke: "currentColor", strokeOpacity: 0.45, strokeWidth: 1 };

function Coin({ detail }) {
  return (
    <>
      <circle cx={C} cy={C} r={21.5} {...BODY} />
      {detail >= 2 && <circle cx={C} cy={C} r={17} {...RULE} />}
      {/* Gold's reeded edge, like the rim of a real coin. */}
      {detail >= 3 &&
        Array.from({ length: 24 }, (_, i) => {
          const [x1, y1] = vertex(18.6, i * 15);
          const [x2, y2] = vertex(20.4, i * 15);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...RULE} strokeOpacity={0.6} />;
        })}
    </>
  );
}

function Gem({ detail }) {
  return (
    <>
      <polygon points={polygon(6, 22)} {...BODY} />
      {detail >= 2 && <polygon points={polygon(6, 15.5)} {...RULE} strokeLinejoin="round" />}
      {/* Amethyst's facets: each inner corner cut back to the outer one. */}
      {detail >= 3 &&
        Array.from({ length: 6 }, (_, i) => {
          const [x1, y1] = vertex(15.5, -90 + i * 60);
          const [x2, y2] = vertex(22, -90 + i * 60);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} {...RULE} />;
        })}
    </>
  );
}

function Star() {
  return (
    <>
      <polygon points={polygon(8, 23, -90, 18.5)} {...BODY} />
      <circle cx={C} cy={C} r={14.5} {...RULE} />
    </>
  );
}

const SHAPES = { coin: Coin, gem: Gem, star: Star };

/**
 * One streak badge (see lib/streakBadges). Flat, like the rest of the system:
 * a tinted body in the badge's colour, inner rules that add up as it climbs,
 * and the streak's flame at the centre — filled once you're into the gems.
 * From Diamond 2 on, a pip carries the level.
 *
 * `locked` draws it in ink-3 for badges not reached yet. Decorative on its
 * own; whatever wraps it names it.
 */
export default function StreakBadge({ badge, size = 42, locked = false, className }) {
  const Shape = SHAPES[badge.shape] ?? Coin;
  const color = locked ? "hsl(var(--ink-3))" : `hsl(var(--badge-${badge.key}))`;
  const filledFlame = !locked && badge.shape !== "coin";

  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      aria-hidden="true"
      className={cn("shrink-0 overflow-visible", locked && "opacity-60", className)}
      style={{ color }}
    >
      <Shape detail={badge.detail} />
      <Flame
        x={14}
        y={13.5}
        width={20}
        height={20}
        strokeWidth={2.1}
        fill={filledFlame ? "currentColor" : "none"}
        fillOpacity={filledFlame ? 0.28 : undefined}
      />
      {badge.level > 1 && (
        <g>
          <circle cx={39.5} cy={39.5} r={8} fill="currentColor" />
          <text
            x={39.5}
            y={39.5}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={badge.level >= 10 ? 7.5 : 9.5}
            fontWeight={600}
            fill="hsl(var(--surface))"
            className="num"
          >
            {badge.level}
          </text>
        </g>
      )}
    </svg>
  );
}
