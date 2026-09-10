import { useNavigate, useLocation } from "react-router-dom";

// The two views of one thing — your spending. "This period" is the running
// window in detail (the Tracker); "History" is every finished month compared
// (what used to be a separate Stats page buried in More). They live on
// separate routes still, but this control makes them read as one surface with
// a timeframe switch, which is how people actually think about it: "how am I
// doing now" vs "how have I done".
const SEGMENTS = [
  { to: "/tracker", label: "This Period" },
  { to: "/stats", label: "History" },
];

/**
 * Segmented control that switches between the current-period tracker and the
 * history view. Styled like the budget-mode tabs in More so selection reads the
 * same way across the app: the active segment lifts onto a surface, the rest
 * stay quiet.
 */
export default function SpendingTabs() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div
      role="tablist"
      aria-label="Spending view"
      className="flex gap-1 rounded-lg bg-surface-2 p-1"
    >
      {SEGMENTS.map(({ to, label }) => {
        const active = pathname === to;
        return (
          <button
            key={to}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => {
              if (!active) navigate(to);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-center text-[13px] transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
              active
                ? "bg-surface font-semibold text-ink shadow-card dark:bg-surface-3"
                : "font-medium text-ink-3 hover:text-ink-2"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
