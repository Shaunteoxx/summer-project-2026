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
                      <App />
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
