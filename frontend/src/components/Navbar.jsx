import { useNavigate } from "react-router-dom";
import { FlaskConical } from "lucide-react";

import Avatar from "@/components/Avatar";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";

/**
 * Slim top app bar: wordmark left, avatar right.
 *
 * The brandmark is ink rather than green. Green now means money arriving or
 * money kept, and a green tile in the chrome would immediately dilute that back
 * into "brand colour".
 *
 * The theme toggle stays here. I moved it to More → Appearance on the grounds
 * that a setting belongs in settings — but it's a control people flick several
 * times a day, not something they configure once, and burying a two-second
 * action three taps deep to satisfy a taxonomy is the wrong trade. It sits
 * beside the avatar, which routes into the profile.
 */
export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <header className="surface-blur sticky top-0 z-40 border-b border-hairline pt-safe">
      <div className="mx-auto flex h-[52px] max-w-app items-center justify-between px-5">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 rounded-sm text-[15px] font-semibold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="grid h-[22px] w-[22px] place-items-center rounded-[7px] bg-ink text-[12px] font-semibold tracking-[-0.03em] text-surface">
            B
          </span>
          Broke No More
        </button>

        <div className="-mr-2 flex items-center gap-1">
          <ThemeToggle />
          <button
            onClick={() => navigate("/more")}
            aria-label="Your profile"
            className="grid h-11 w-11 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* The avatar stays 28px; the button around it is 44 so the tap
                target matches every other control in the bar. */}
            <Avatar user={user} className="h-7 w-7" />
          </button>
        </div>
      </div>

      {user?.isDemo && (
        // The banner used to read "Read-Only Demo" because the demo was one
        // shared account nobody could be allowed to edit. It's a private,
        // writable sandbox now, so the honest thing to flag isn't that you
        // can't touch it — it's that what you do here doesn't last. Signing out
        // deletes this sandbox, which is exactly what "Sign In" walks toward:
        // trade the throwaway account for a real one.
        <div className="mx-auto flex max-w-app items-center justify-between gap-3 border-t border-hairline bg-surface-2 px-5 py-1.5 text-xs text-ink-2">
          <span className="flex items-center gap-1.5 font-medium">
            <FlaskConical className="h-3.5 w-3.5" />
            Demo · resets when you sign out
          </span>
          <button
            onClick={logout}
            className="font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            Sign In
          </button>
        </div>
      )}
    </header>
  );
}
