import { Routes, Route, useLocation, Outlet } from "react-router-dom";
import { AnimatePresence } from "framer-motion";

import Navbar from "@/components/Navbar";
import ProtectedRoute from "@/components/ProtectedRoute";

import LoginPage from "@/pages/LoginPage";
import AuthCallback from "@/pages/AuthCallback";
import HomePage from "@/pages/HomePage";
import CalculatorPage from "@/pages/CalculatorPage";
import TransactionsPage from "@/pages/TransactionsPage";
import TrackerPage from "@/pages/TrackerPage";
import StatsPage from "@/pages/StatsPage";
import FriendsPage from "@/pages/FriendsPage";

/** Authenticated shell: navbar + animated page outlet. */
function AppLayout() {
  const location = useLocation();
  return (
    <div className="app-bg min-h-screen">
      <Navbar />
      <AnimatePresence mode="wait">
        <Outlet key={location.pathname} />
      </AnimatePresence>
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
      </Route>
    </Routes>
  );
}
