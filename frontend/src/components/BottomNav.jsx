import { Link, matchPath, useLocation } from "react-router-dom";
import { Home, Receipt, PieChart, MoreHorizontal } from "lucide-react";

import AddFab from "@/components/AddFab";
import SegmentPill from "@/components/SegmentPill";

// Four destinations, not five. Plan came off the bar: it's an occasional
// what-if tool on the same numbers as Home, so it reads better as a link from
// Home (the pace and streak cards) and a row in More than as a permanent tab.
// Tracker now carries History too (the old Stats page) via a toggle, so there
// was never a Stats tab to add in its place — the bar just gets less crowded.
const tabs = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/transactions", label: "Transactions", icon: Receipt },
  // History is Tracker's other face, behind its This Period / History toggle,
  // so it keeps this tab lit. Otherwise the lens would step away every time
  // the toggle was flipped.
  { to: "/tracker", label: "Tracker", icon: PieChart, also: ["/stats"] },
  { to: "/more", label: "More", icon: MoreHorizontal },
];

/** Matched the way NavLink matches: exact for Home, the path and below otherwise. */
const isCurrent = ({ to, end = false, also = [] }, pathname) =>
  [to, ...also].some((path) => matchPath({ path, end }, pathname));

/**
 * The dock: the tab bar and the add button, floating over the page as two
 * pieces of glass. The tab bar is a capsule and the add button a disc at its
 * trailing end, the way iOS 26 seats Search beside a tab bar.
 *
 * The selected tab sits on a lens of slightly deeper glass that slides to
 * whichever tab you pick (the same SegmentPill the segmented controls use),
 * and its label is ink against the others' ink-2. Never green: that one
 * choice is what buys green its meaning back everywhere else in the app. An
 * emerald tab would read as "brand" and stop reading as "money". Pages outside
 * the four (Plan, Friends) light no tab, so the lens steps away rather than
 * pointing somewhere wrong.
 *
 * Adding a transaction is deliberately NOT a fifth tab or a centre "+": a tab
 * bar is a set of places, and a button that opens a modal can never hold an
 * active state. So the + is its own piece of glass beside the bar rather than
 * a slot in it (see AddFab).
 *
 * The dock is the same on every page. The + used to stay off Plan and More,
 * but now that it's part of the dock, a bar that changed width between tabs
 * would slide the tab you'd just tapped out from under your finger (More by
 * about 60px).
 *
 * Motion: the lens slides, and the icon dips while pressed. The icon's old pop
 * on arrival is gone; it only existed to acknowledge a tap when nothing moved
 * to show it, and now the lens does.
 */
export default function BottomNav() {
  const { pathname } = useLocation();
  const active = tabs.findIndex((tab) => isCurrent(tab, pathname));

  return (
    <>
      {/* The scroll edge: the page fades into the canvas behind the dock, the
          way iOS softens content under its floating bars. Without it, whatever
          scrolls past shows in the strip between the glass and the screen
          edge — half a date header, the tail of a caption. It stops short of
          --dock-clear, so a page scrolled to its end never loses its last row
          to it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-30 h-[calc(var(--dock-top)+16px)] bg-gradient-to-t from-canvas/90 via-canvas/70 to-canvas/0"
      />
      {/* Tracks the phone-width column, like the page, so the dock lines up
          with the content's edges rather than the viewport's on a desktop
          window. The row takes no taps itself; only the two pieces of glass
          do. Every height here is the one --dock-h, which is what pages clear
          (see index.css). */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[var(--dock-bottom)] z-40 mx-auto flex h-[var(--dock-h)] max-w-app gap-2 px-4">
        <nav aria-label="Primary" className="glass pointer-events-auto flex-1 rounded-full p-1">
          <SegmentPill
            index={active}
            count={tabs.length}
            inset={4}
            gap={0}
            className="rounded-full bg-ink/[0.07] shadow-none dark:bg-ink/[0.1]"
          />
          <ul className="flex h-full">
            {tabs.map((tab, i) => {
              const { to, label, icon: Icon } = tab;
              const selected = i === active;
              return (
                // min-w-0 holds the four slots equal even where a label is
                // wider than its share ("Transactions" on a 360px phone).
                // Without it that slot grows, and the lens, which assumes
                // equal slots, lands off-centre.
                <li key={to} className="min-w-0 flex-1">
                  {/* `relative` so the label paints above the lens. */}
                  <Link
                    to={to}
                    aria-current={selected ? "page" : undefined}
                    className="group relative flex h-full flex-col items-center justify-center gap-[4px] rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <Icon
                      className={`h-[21px] w-[21px] transition-[color,transform] duration-base ease-out group-active:scale-[0.86] ${
                        selected ? "text-ink" : "text-ink-2 group-hover:text-ink"
                      }`}
                      strokeWidth={selected ? 2.15 : 1.9}
                    />
                    {/* 10px, Apple's tab label size: the lens is a capsule,
                        so its ends curve in beside the label, and at 10.5px
                        "Transactions" ran into them on a 375px phone. */}
                    <span
                      className={`whitespace-nowrap text-[10px] leading-none transition-colors duration-base ease-out ${
                        selected ? "font-semibold text-ink" : "font-medium text-ink-2"
                      }`}
                    >
                      {label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <AddFab />
      </div>
    </>
  );
}
