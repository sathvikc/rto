import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["vendor/**", "node_modules/**", "types/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser },
    },
    rules: {
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-var": "error",
      "prefer-const": "error",
      "object-shorthand": "error",
      "no-implicit-coercion": ["error", { allow: ["!!"] }],
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["sw.js"],
    languageOptions: { globals: { ...globals.serviceworker } },
  },
  {
    files: ["tests/**", "scripts/**", "eslint.config.js"],
    languageOptions: { globals: { ...globals.node } },
    rules: { "no-console": "off" },
  },
];
