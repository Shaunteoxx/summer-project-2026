import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// jsdom implements neither of these, and recharts' ResponsiveContainer needs
// both to mount. Charts render at zero size in tests, which is fine — the
// assertions here are about surrounding behaviour, not chart geometry.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});
