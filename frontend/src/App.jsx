import { Component, lazy, Suspense } from "react";
import { Navigate, Routes, Route, useLocation, Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import AddFab from "@/components/AddFab";
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
  return (
    <div className="flex min-h-[100dvh] flex-col bg-canvas">
      <Navbar />
      <main className="mx-auto w-full max-w-app flex-1">
        <AnimatePresence mode="wait">
          <Suspense fallback={<PageFallback />}>
            <Outlet key={location.pathname} />
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
