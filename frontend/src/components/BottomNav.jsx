import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Receipt, PieChart, Calculator, MoreHorizontal } from "lucide-react";

const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/tracker", label: "Tracker", icon: PieChart },
  { to: "/calculator", label: "Calculator", icon: Calculator },
  { to: "/more", label: "More", icon: MoreHorizontal },
];

/**
 * Fixed bottom tab bar — the primary navigation on mobile.
 * "More" houses Stats, Friends and account actions.
 */
export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="surface-blur fixed inset-x-0 bottom-0 z-40 border-t border-border/60 pb-safe"
    >
      <ul className="mx-auto flex max-w-app items-stretch justify-around px-1">
        {tabs.map(({ to, label, icon: Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className="group flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg px-1 pt-2 pb-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {({ isActive }) => (
                <>
                  <span className="relative flex h-8 w-full items-center justify-center">
                    {isActive && (
                      <motion.span
                        layoutId="tab-pill"
                        className="absolute h-8 w-14 rounded-full bg-primary/15"
                        transition={{ type: "spring", stiffness: 500, damping: 35 }}
                      />
                    )}
                    <Icon
                      className={`relative h-[22px] w-[22px] transition-colors ${
                        isActive
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                      strokeWidth={isActive ? 2.4 : 2}
                    />
                  </span>
                  <span
                    className={`text-[11px] font-medium leading-none transition-colors ${
                      isActive ? "text-primary" : "text-muted-foreground"
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
