import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import { Home, Receipt, PieChart, MoreHorizontal } from "lucide-react";

import { EASE } from "@/animations/variants";

// Four destinations, not five. Plan came off the bar: it's an occasional
// what-if tool on the same numbers as Home, so it reads better as a link from
// Home (the pace and streak cards) and a row in More than as a permanent tab.
// Tracker now carries History too (the old Stats page) via a toggle, so there
// was never a Stats tab to add in its place — the bar just gets less crowded.
const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  { to: "/tracker", label: "Tracker", icon: PieChart },
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
 *
 * Motion is on the icon only, for the same reason there's no pill: the icon
 * dips while pressed and gives one small pop when its tab becomes the active
 * one. That's the acknowledgement a tap needs without a moving indicator to
 * compete with the page transition happening at the same moment.
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
              // px spacing (was gap-1/pt-2/pb-1.5) so the bar is a fixed ~54px
              // regardless of browser font — the add button is positioned to
              // clear exactly this height, and a bar that grew with the font
              // would let the button ride up into content.
              className="group flex min-h-[54px] flex-col items-center justify-center gap-[4px] rounded-sm px-0.5 pb-[6px] pt-[8px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              {({ isActive }) => (
                <>
                  {/* The pop lives on a wrapper: framer writes an inline
                      transform, which would override the CSS press scale if
                      both sat on the icon. initial={false} so a cold load
                      doesn't pop whichever tab it lands on. */}
                  <motion.span
                    initial={false}
                    animate={isActive ? { scale: [1, 1.14, 1] } : { scale: 1 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="flex"
                  >
                    <Icon
                      className={`h-[21px] w-[21px] transition-[color,transform] duration-base ease-out group-active:scale-[0.86] ${
                        isActive ? "text-ink" : "text-ink-3 group-hover:text-ink-2"
                      }`}
                      strokeWidth={isActive ? 2.15 : 1.9}
                    />
                  </motion.span>
                  <span
                    className={`text-[10.5px] leading-none transition-colors duration-base ease-out ${
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
