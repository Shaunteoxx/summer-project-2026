import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import App from "./App.jsx";
import { AuthProvider } from "./hooks/useAuth.jsx";
import { BudgetPeriodProvider } from "./hooks/useBudgetPeriod.jsx";
import { AccountsProvider } from "./hooks/useAccounts.jsx";
import { RecurringProvider } from "./hooks/useRecurring.jsx";
import { CategoriesProvider } from "./hooks/useCategories.jsx";
import { ThemeProvider } from "./hooks/useTheme.jsx";
import { ToastProvider } from "./hooks/useToast.jsx";
import { TourProvider } from "./tour/TourProvider.jsx";
import { registerServiceWorker } from "./lib/push";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <MotionConfig reducedMotion="user">
      <ThemeProvider>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <BudgetPeriodProvider>
                <CategoriesProvider>
                  <AccountsProvider>
                    <RecurringProvider>
                      <TourProvider>
                        <App />
                      </TourProvider>
                    </RecurringProvider>
                  </AccountsProvider>
                </CategoriesProvider>
              </BudgetPeriodProvider>
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  </React.StrictMode>
);

// Outside React, so StrictMode's double render can't register twice.
registerServiceWorker();

// iOS Safari only applies :active to an element with a touch listener on it or
// above it. React's root listener usually provides one; this makes the pressed
// states hold for the whole document rather than depending on that detail.
document.addEventListener("touchstart", () => {}, { passive: true });
