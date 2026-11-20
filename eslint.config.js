import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
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
    plugins: { "@stylistic": stylistic },
    rules: {
      // Readability: blank lines between logical blocks (auto-fixable).
      "@stylistic/padding-line-between-statements": [
        "error",
        { blankLine: "always", prev: "import", next: "*" },
        { blankLine: "any", prev: "import", next: "import" },
        { blankLine: "always", prev: ["const", "let"], next: "*" },
        { blankLine: "any", prev: ["singleline-const", "singleline-let"], next: ["singleline-const", "singleline-let"] },
        { blankLine: "always", prev: "*", next: ["multiline-block-like", "multiline-expression", "multiline-const", "multiline-let"] },
        { blankLine: "always", prev: ["multiline-block-like", "multiline-expression"], next: "*" },
        { blankLine: "always", prev: "*", next: ["return", "throw"] },
        { blankLine: "always", prev: "*", next: ["function", "class", "export"] },
        { blankLine: "always", prev: ["function", "class"], next: "*" },
        { blankLine: "always", prev: "*", next: "if" },
        { blankLine: "always", prev: "if", next: "*" },
        { blankLine: "any", prev: "if", next: "if" },
      ],
      "@stylistic/lines-between-class-members": ["error", "always"],
      "@stylistic/lines-around-comment": [
        "error",
        {
          beforeBlockComment: true,
          allowBlockStart: true,
          allowObjectStart: true,
          allowArrayStart: true,
          allowClassStart: true,
          ignorePattern: "@ts-|@import",
        },
      ],
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
