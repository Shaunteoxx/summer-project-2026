import { NavLink, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Wallet, LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/calculator", label: "Calculator" },
  { to: "/transactions", label: "Transactions" },
  { to: "/tracker", label: "Tracker" },
  { to: "/stats", label: "Stats" },
  { to: "/friends", label: "Friends" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 font-extrabold tracking-tight"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wallet className="h-5 w-5" />
          </span>
          <span className="hidden sm:inline">Broke No More</span>
        </button>

        <nav className="flex items-center gap-1">
          {links.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.end}>
              {({ isActive }) => (
                <span
                  className={cn(
                    "relative rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {l.label}
                  {isActive && (
                    <motion.span
                      layoutId="nav-underline"
                      className="absolute inset-x-2 -bottom-0.5 h-0.5 rounded-full bg-primary"
                    />
                  )}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          {user?.profilePicture ? (
            <img
              src={user.profilePicture}
              alt={user.username}
              className="hidden h-8 w-8 rounded-full border border-border sm:block"
            />
          ) : null}
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={logout}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:text-destructive"
            title="Log out"
          >
            <LogOut className="h-4 w-4" />
          </motion.button>
        </div>
      </div>
    </header>
  );
}
