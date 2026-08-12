import { NavLink } from "react-router-dom";
import { Home, Receipt, PieChart, Calculator, MoreHorizontal } from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/tracker", label: "Tracker", icon: PieChart },
  { to: "/plan", label: "Plan", icon: Calculator },
  { to: "/more", label: "More", icon: MoreHorizontal },
];

/**
 * Fixed bottom tab bar — the primary navigation.
 *
 * The active tab is ink, not green. That one choice is what buys green its
 * meaning back everywhere else in the app: if the nav pill is emerald, green
 * reads as "brand" and stops reading as "money". There's no pill background
 * either — colour and weight carry the state, which is quieter and matches how
 * the rest of the system signals selection.
 *
 * Adding a transaction is deliberately NOT a sixth tab or a centre "+": a tab
 * bar is a set of places, and a button that opens a modal can never hold an
 * active state. That job belongs to AddFab.
 */
export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="surface-blur fixed inset-x-0 bottom-0 z-40 border-t border-hairline pb-safe"
    >
      <ul className="mx-auto flex max-w-app items-stretch px-1">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className="group flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-sm px-0.5 pb-1.5 pt-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={`h-[21px] w-[21px] transition-colors duration-base ease-out ${
                      isActive ? "text-ink" : "text-ink-3 group-hover:text-ink-2"
                    }`}
                    strokeWidth={isActive ? 2.15 : 1.9}
                  />
                  <span
                    className={`text-[9.5px] leading-none transition-colors duration-base ease-out ${
                      isActive ? "font-semibold text-ink" : "font-medium text-ink-3"
                    }`}
                  >
                    {label}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
