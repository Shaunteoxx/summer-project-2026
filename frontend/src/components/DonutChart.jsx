/**
 * A donut ring, drawn as one stroke-dashed SVG <circle> per slice.
 *
 * This replaces recharts' PieChart for the two small donuts on the Tracker (the
 * savings ring and the category breakdown). Those donuts render on the page's
 * default view, so as long as they needed recharts the whole ~113KB (gzipped)
 * library sat in the Tracker chunk. A ring is a stroke — a few lines of SVG —
 * so it never justified that weight; the bar charts, which do, now load lazily.
 *
 * Slices are drawn clockwise from twelve o'clock (the rotate(-90) below).
 * `gap` is arc length removed between slices; with `rounded` caps that plus the
 * cap's own overhang reads as a small rounded separation. Pass gap={0}
 * rounded={false} for a continuous ring (the category donut). A single slice is
 * always a full, unbroken ring — no seam, no gap.
 *
 * Static by design: the card it sits in already fades in, and dropping the
 * animation is what lets these components stop reaching for recharts' animation
 * flag (which ignored prefers-reduced-motion and had to be switched off by hand).
 */
export default function DonutChart({
  slices,
  size = 128,
  thickness = 13,
  gap = 0,
  rounded = false,
  className = "",
}) {
  const active = (slices || []).filter((s) => s.value > 0);
  const total = active.reduce((sum, s) => sum + s.value, 0);
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const single = active.length === 1;
  const dashGap = single ? 0 : gap;

  let consumed = 0; // arc length used by earlier slices
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
      role="presentation"
      aria-hidden="true"
    >
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        {total > 0 &&
          active.map((s, i) => {
            const segment = (s.value / total) * circumference;
            // A single slice is the whole ring; otherwise leave the gap, but
            // never let a tiny slice collapse to nothing — a rounded cap turns
            // the 0.01 into a small dot, which is the right read for "a sliver".
            const drawn = single
              ? circumference
              : Math.max(segment - dashGap, 0.01);
            const circle = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color ?? s.fill}
                strokeWidth={thickness}
                strokeLinecap={rounded ? "round" : "butt"}
                strokeDasharray={`${drawn} ${circumference - drawn}`}
                strokeDashoffset={-consumed}
              />
            );
            consumed += segment;
            return circle;
          })}
      </g>
    </svg>
  );
}
