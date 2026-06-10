import { lazy, Suspense } from "react";
import { Routes, Route, useLocation, Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Navbar from "@/components/Navbar";
import BottomNav from "@/components/BottomNav";
import ProtectedRoute from "@/components/ProtectedRoute";

// Eager: tiny screens that gate the rest of the app.
import LoginPage from "@/pages/LoginPage";
import AuthCallback from "@/pages/AuthCallback";

// Lazy: authenticated pages are split into their own chunks so the
// initial load doesn't ship heavy deps (e.g. recharts) until needed.
const HomePage = lazy(() => import("@/pages/HomePage"));
const CalculatorPage = lazy(() => import("@/pages/CalculatorPage"));
const TransactionsPage = lazy(() => import("@/pages/TransactionsPage"));
const TrackerPage = lazy(() => import("@/pages/TrackerPage"));
const StatsPage = lazy(() => import("@/pages/StatsPage"));
const FriendsPage = lazy(() => import("@/pages/FriendsPage"));
const MorePage = lazy(() => import("@/pages/MorePage"));

/** Centered spinner shown while a lazy page chunk is loading. */
function PageFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="h-9 w-9 animate-spin rounded-full border-4 border-primary/30 border-t-primary" />
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
    <div className="app-bg flex min-h-[100dvh] flex-col">
      <Navbar />
      <main className="mx-auto w-full max-w-app flex-1">
        <AnimatePresence mode="wait">
          <Suspense fallback={<PageFallback />}>
            <Outlet key={location.pathname} />
          </Suspense>
        </AnimatePresence>
      </main>
      <BottomNav />
    </div>
  );
}

export default function App() {
  const location = useLocation();

  return (
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
        <Route path="/calculator" element={<CalculatorPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/tracker" element={<TrackerPage />} />
        <Route path="/stats" element={<StatsPage />} />
        <Route path="/friends" element={<FriendsPage />} />
        <Route path="/more" element={<MorePage />} />
      </Route>
    </Routes>
  );
}
