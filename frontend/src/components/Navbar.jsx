import { useNavigate } from "react-router-dom";
import { Wallet, Eye } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";

/** Slim top app bar: brand on the left, theme toggle on the right. */
export default function Navbar() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  return (
    <header className="surface-blur sticky top-0 z-40 border-b border-border/50 pt-safe">
      <div className="mx-auto flex h-14 max-w-app items-center justify-between px-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 rounded-lg font-extrabold tracking-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-[18px] w-[18px]" />
          </span>
          <span className="text-[15px]">Broke No More</span>
        </button>

        <ThemeToggle className="-mr-2" />
      </div>

      {user?.isDemo && (
        <div className="mx-auto flex max-w-app items-center justify-between gap-3 bg-primary/10 px-4 py-1.5 text-xs text-primary">
          <span className="flex items-center gap-1.5 font-medium">
            <Eye className="h-3.5 w-3.5" />
            Read-only demo
          </span>
          <button
            onClick={logout}
            className="font-semibold underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            Sign in
          </button>
        </div>
      )}
    </header>
  );
}
