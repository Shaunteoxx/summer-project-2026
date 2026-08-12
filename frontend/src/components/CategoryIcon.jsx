import { Tag } from "lucide-react";

/**
 * The 34px tinted tile that carries a category's colour in lists.
 *
 * Colour lives here and nowhere else in a row: the amount stays ink, the
 * description stays ink, the meta line stays ink-3. That keeps a long list
 * rhythmic rather than stripy, and it means colour never has to compete with
 * the number the row exists to show.
 *
 * The tint is a 14% mix of the category's own hue, so the tile and the glyph
 * are always the same colour at two intensities — one value, two roles.
 */
export default function CategoryIcon({ category, className = "" }) {
  const Icon = category?.icon ?? Tag;
  const color = category?.color ?? "hsl(var(--cat-fallback))";

  return (
    <span
      className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-sm ${className}`}
      style={{
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
      }}
      aria-hidden="true"
    >
      <Icon className="h-4 w-4" strokeWidth={2} />
    </span>
  );
}
