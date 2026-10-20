// Linting is a safety net for refactors, not a style guide: it catches unused
// code and missing imports. Formatting is left alone.
import js from "@eslint/js";
import globals from "globals";

export default [
  // The fixture is a frozen copy of old code that the equivalence test runs
  // against, so it is left exactly as it shipped.
  { ignores: ["node_modules", "test/fixtures"] },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "error",
        { ignoreRestSiblings: true, argsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
];
