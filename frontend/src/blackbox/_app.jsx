// Mounts the real app — every real provider, the real router and pages — the
// way main.jsx does, with only the network and the clock replaced.
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { vi } from "vitest";
import App from "@/App.jsx";
import { AuthProvider } from "@/hooks/useAuth.jsx";
import { BudgetPeriodProvider } from "@/hooks/useBudgetPeriod.jsx";
import { AccountsProvider } from "@/hooks/useAccounts.jsx";
import { RecurringProvider } from "@/hooks/useRecurring.jsx";
import { CategoriesProvider } from "@/hooks/useCategories.jsx";
import { ThemeProvider } from "@/hooks/useTheme.jsx";
import { ToastProvider } from "@/hooks/useToast.jsx";
import { TourProvider } from "@/tour/TourProvider.jsx";
import { holder } from "./_holder.js";

const b64 = (o) => btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// Pins the device clock to midday (local) on `today`, faking Date only so
// timers — and Testing Library's waiting — keep working.
export function setDeviceDate(today) {
  holder.today = today;
  const [y, m, d] = today.split("-").map(Number);
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(y, m - 1, d, 12, 0, 0) });
}

export function signIn() {
  const now = Math.floor(Date.now() / 1000);
  localStorage.setItem("bnm_token", `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ id: "u1", iat: now, exp: now + 7 * 86400 })}.sig`);
}

export function renderAt(route, server) {
  holder.server = server;
  signIn();
  if (!window.matchMedia) {
    // Reduced motion on, so count-ups land on their final figure at once.
    window.matchMedia = (query) => ({ matches: /reduce/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false });
  }
  if (!window.scrollTo || window.scrollTo.name !== "noop") window.scrollTo = function noop() {};
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = function noop() {};
  if (!window.IntersectionObserver) window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  return render(
    <MotionConfig reducedMotion="always">
      <ThemeProvider>
        <ToastProvider>
          <MemoryRouter initialEntries={[route]}>
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
          </MemoryRouter>
        </ToastProvider>
      </ThemeProvider>
    </MotionConfig>
  );
}

// The page's visible text, one line per block, for reading like a user would.
export const pageText = () => (document.body.innerText ?? document.body.textContent ?? "").replace(/\s+/g, " ").trim();
