import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3,
  Users,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
} from "lucide-react";

import PageWrapper from "@/components/PageWrapper";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { staggerContainer, fadeUp, fadeScaleItem } from "@/animations/variants";

const shortcuts = [
  {
    to: "/stats",
    label: "Stats",
    desc: "Spending breakdown & trends",
    icon: BarChart3,
  },
  {
    to: "/friends",
    label: "Friends",
    desc: "Compare savings on the leaderboard",
    icon: Users,
  },
];

export default function MorePage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  return (
    <PageWrapper>
      {/* Profile header */}
      <motion.div variants={fadeUp} initial="initial" animate="animate">
        <div className="flex items-center gap-4">
          {user?.profilePicture ? (
            <img
              src={user.profilePicture}
              alt={user.username}
              className="h-14 w-14 rounded-full border border-border object-cover"
            />
          ) : (
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent text-lg font-bold text-accent-foreground">
              {user?.username?.[0]?.toUpperCase() ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold tracking-tight">
              {user?.username ?? "Your account"}
            </h1>
            {user?.email && (
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            )}
          </div>
        </div>
      </motion.div>

      {/* Shortcuts */}
      <motion.div
        variants={staggerContainer(0.08, 0.1)}
        initial="initial"
        animate="animate"
        className="mt-7 space-y-3"
      >
        {shortcuts.map(({ to, label, desc, icon: Icon }) => (
          <motion.button
            key={to}
            variants={fadeScaleItem}
            onClick={() => navigate(to)}
            className="flex w-full items-center gap-4 rounded-xl border border-border/70 bg-card p-4 text-left shadow-sm transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{label}</span>
              <span className="block text-sm text-muted-foreground">{desc}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
          </motion.button>
        ))}
      </motion.div>

      {/* Preferences */}
      <motion.div
        variants={fadeUp}
        initial="initial"
        animate="animate"
        className="mt-7"
      >
        <h2 className="mb-3 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Preferences
        </h2>
        <div className="overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">Appearance</span>
              <span className="block text-sm text-muted-foreground">
                {isDark ? "Dark mode" : "Light mode"}
              </span>
            </span>
            {/* Track + thumb switch */}
            <span
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                isDark ? "bg-primary" : "bg-muted"
              }`}
              aria-hidden="true"
            >
              <motion.span
                layout
                transition={{ type: "spring", stiffness: 500, damping: 32 }}
                className={`absolute top-1 h-5 w-5 rounded-full bg-background shadow ${
                  isDark ? "right-1" : "left-1"
                }`}
              />
            </span>
          </button>
        </div>
      </motion.div>

      {/* Logout */}
      <motion.button
        variants={fadeUp}
        initial="initial"
        animate="animate"
        onClick={logout}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 p-4 font-semibold text-destructive transition-colors hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <LogOut className="h-5 w-5" />
        Log out
      </motion.button>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Broke No More
      </p>
    </PageWrapper>
  );
}
