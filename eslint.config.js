// ESLint flat config (ESLint 9). Replaces the legacy .eslintrc.cjs.
import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "release",
      "node_modules",
      "coverage",
      "public/ocr",
      "public/fonts",
      "playwright-report",
      "test-results",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.worker },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    // Playwright fixtures call `use()`, which is not a React hook.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    // Electron main/preload scripts and Node build scripts (CommonJS / ESM).
    files: ["electron/**/*.cjs", "scripts/**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node },
    },
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: { sourceType: "module" },
  },
  {
    // Service-worker template (placeholders are filled in at build time).
    files: ["scripts/sw-template.js"],
    languageOptions: {
      sourceType: "script",
      globals: { ...globals.serviceworker, __PRECACHE__: "readonly" },
    },
  },
);
