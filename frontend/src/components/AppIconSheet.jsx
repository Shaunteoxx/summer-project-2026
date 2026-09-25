import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Share, SquarePlus } from "lucide-react";

import BottomSheet from "@/components/BottomSheet";
import { APP_ICONS, appIcon, setAppIcon } from "@/lib/appIcon";
import { cn } from "@/lib/utils";

/**
 * Pick the icon iPhone and iPad put on the Home Screen.
 *
 * The pick only counts in Safari, before the app is added (lib/appIcon.js has
 * why). Inside the installed app nothing here could change the icon, so the
 * sheet shows the choices and the way to switch instead of controls that do
 * nothing.
 */
export default function AppIconSheet({ open, onClose, installed }) {
  const [current, setCurrent] = useState(appIcon);

  return (
    <BottomSheet open={open} onClose={onClose} title="App Icon">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {APP_ICONS.map((icon) =>
            installed ? (
              <div
                key={icon.id}
                className="flex flex-col items-center gap-2 rounded-md bg-surface-2 px-3 pb-3 pt-4"
              >
                <IconImage icon={icon} />
                <span className="text-[13px] font-medium text-ink-2">{icon.name}</span>
              </div>
            ) : (
              <IconTile
                key={icon.id}
                icon={icon}
                selected={icon.id === current.id}
                onClick={() => setCurrent(setAppIcon(icon.id))}
              />
            )
          )}
        </div>

        {installed ? (
          <>
            <p className="text-[14px] leading-relaxed text-ink-2">
              Your Home Screen icon was set when you added the app, and can&apos;t be
              switched from inside it. To change it:
            </p>
            <ol className="space-y-2.5 text-[14px] text-ink-2">
              <Step n={1}>Remove Broke No More from your Home Screen</Step>
              <Step n={2}>Open it in Safari and sign in</Step>
              <Step n={3}>Pick one in More, then add it again</Step>
            </ol>
          </>
        ) : (
          <>
            <p className="text-[14px] leading-relaxed text-ink-2">
              Broke No More gets the icon you pick when you add it to your Home Screen:
            </p>
            <ol className="space-y-2.5 text-[14px] text-ink-2">
              <Step n={1}>
                Tap <Share className="h-4 w-4" aria-label="Share" /> in Safari
              </Step>
              <Step n={2}>
                Choose <SquarePlus className="h-4 w-4" aria-hidden="true" /> Add to Home Screen
              </Step>
            </ol>
            <p className="text-[13px] leading-relaxed text-ink-3">
              Already on your Home Screen? Remove it, then add it again to switch.
            </p>
          </>
        )}
      </div>
    </BottomSheet>
  );
}

function IconTile({ icon, selected, onClick }) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.96 }}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-center gap-2 rounded-md border px-3 pb-3 pt-4 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        selected
          ? "border-ink bg-ink/[0.06]"
          : "border-hairline-strong hover:bg-surface-2 active:bg-surface-3"
      )}
    >
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-surface">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <IconImage icon={icon} />
      <span className="text-[13px] font-medium text-ink">{icon.name}</span>
    </motion.button>
  );
}

// Rounded the way the Home Screen rounds it, so the preview is what you'll get.
function IconImage({ icon }) {
  return (
    <img
      src={icon.src}
      alt=""
      width={64}
      height={64}
      className="h-16 w-16 rounded-[22.5%] shadow-card"
    />
  );
}

function Step({ n, children }) {
  return (
    <li className="flex items-center gap-3">
      <span className="num flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[12px] font-semibold text-ink">
        {n}
      </span>
      <span className="flex items-center gap-1.5">{children}</span>
    </li>
  );
}
