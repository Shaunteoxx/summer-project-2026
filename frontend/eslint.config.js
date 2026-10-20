// Linting is a safety net for refactors, not a style guide: it catches unused
// code, missing imports and hook mistakes. Formatting is left alone.
import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist", "dev-dist", "node_modules"] },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    settings: { react: { version: "detect" } },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...js.configs.recommended.rules,
      // Counts a component as used when it only appears in JSX.
      "react/jsx-uses-vars": "error",
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  // Tests run under vitest in Node.
  {
    files: ["src/**/*.test.{js,jsx}", "src/test/**"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  // Build and tooling scripts.
  {
    files: ["scripts/**", "*.config.js"],
    languageOptions: { globals: globals.node },
  },
  // The service worker and the pre-paint theme script run outside the app.
  {
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
];
