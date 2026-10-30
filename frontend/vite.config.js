import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  build: {
    // Vite 5's default target, kept on purpose. Vite 7 and 8 raised the
    // default (Vite 8's is Safari 16.4 and Chrome 111), which would quietly
    // drop phones the app already runs on: an iPhone 7 stops at iOS 15. Delete
    // this line to take Vite's newer default deliberately.
    target: ["es2020", "edge88", "firefox78", "chrome87", "safari14"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
    css: false,
    // Before each test. Vitest 2's restoreMocks also put every vi.fn() back
    // to the implementation its file gave it; since Vitest 4 that only covers
    // vi.spyOn spies, and mockReset does the rest. Both are on so a mock set
    // up in one test can't carry into the next.
    restoreMocks: true,
    mockReset: true,
  },
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": {
        target: process.env.API_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
