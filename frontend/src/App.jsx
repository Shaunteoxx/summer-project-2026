import { Component, lazy, Suspense } from "react";
import { Navigate, Routes, Route, useLocation, Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import AddFab, { SHOW_ON as FAB_ROUTES } from "@/components/AddFab";
import ProtectedRoute from "@/components/ProtectedRoute";

// Eager: tiny screens that gate the rest of the app.
import LoginPage from "@/pages/LoginPage";
import AuthCallback from "@/pages/AuthCallback";

// Lazy: authenticated pages are split into their own chunks so the
// initial load doesn't ship heavy deps (e.g. recharts) until needed.
const HomePage = lazy(() => import("@/pages/HomePage"));
const PlanPage = lazy(() => import("@/pages/PlanPage"));
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"));
const TrackerPage = lazy(() => import("@/pages/TrackerPage"));
const StatsPage = lazy(() => import("@/pages/StatsPage"));
const FriendsPage = lazy(() => import("@/pages/FriendsPage"));
const MorePage = lazy(() => import("@/pages/MorePage"));

class AppErrorBoundary extends Component {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    console.error("Application render failed", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-canvas p-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-title">Something Went Wrong</h1>
          <p className="text-sm text-ink-3">
            Reload the app to try again. Your saved transactions are unaffected.
          </p>
          <button
            type="button"
            className="h-11 rounded-md bg-ink px-5 font-semibold text-surface"
            onClick={() => window.location.reload()}
          >
            Reload App
          </button>
        </div>
      </main>
    );
  }
}

/**
 * Shown while a lazy page chunk loads. A bare indeterminate track rather than a
 * spinner, matching BrandLoader — and only after a beat, so a fast chunk never
 * flashes a loading state on screen.
 */
function PageFallback() {
  return (
    <div
      className="flex min-h-[60vh] items-start justify-center pt-24"
      role="status"
      aria-label="Loading page"
    >
      <div className="h-0.5 w-[120px] overflow-hidden rounded-full bg-surface-3 opacity-0 motion-safe:animate-fade-in-delayed">
        <div className="h-full w-[38%] rounded-full bg-ink motion-safe:animate-track-slide" />
      </div>
    </div>
  );
}

/**
 * Authenticated shell: a phone-width centered column with a top app bar,
 * an animated page outlet, and a fixed bottom tab bar.
 */
function AppLayout() {
  const location = useLocation();
  // PageWrapper's own padding clears the tab bar. On the three routes that also
  // carry the add button, the page has to clear that too: it floats 4.9rem up
  // and stands 54px tall, so its top edge is 132.4px above the viewport bottom
  // — past the 88px the tab bar needed. Without this the last row of a ledger
  // sits under the button with no scroll left to free it. Measured, not guessed.
  //
  // It lives here rather than in PageWrapper because only the shell knows which
  // route is showing, and PageWrapper is rendered by all seven pages.
  const clearsFab = FAB_ROUTES.includes(location.pathname);
  // Tracker and its History view are two faces of one surface (the SpendingTabs
  // toggle). Sharing an AnimatePresence key across them means switching doesn't
  // play the full-page exit-then-enter transition — mode="wait" has nothing to
  // wait for — so the toggle reads like a segmented control rather than a page
  // load. Every other route change still animates normally.
  const routeKey = ["/tracker", "/stats"].includes(location.pathname)
    ? "spending"
    : location.pathname;
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <Navbar />
      <main
        className={`mx-auto w-full max-w-app flex-1 ${clearsFab ? "pb-14" : ""}`}
      >
        <AnimatePresence mode="wait">
          <Suspense fallback={<PageFallback />}>
            <Outlet key={routeKey} />
          </Suspense>
        </AnimatePresence>
      </main>
      <AddFab />
      <BottomNav />
    </div>
  );
}

export default function App() {
  const location = useLocation();

  return (
    <AppErrorBoundary>
      <Routes location={location}>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<HomePage />} />
        <Route path="/plan" element={<PlanPage />} />
        {/* "Calculator" was the old name; keep the URL working. */}
        <Route path="/calculator" element={<Navigate to="/plan" replace />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/more" element={<MorePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppErrorBoundary>
  );
}
