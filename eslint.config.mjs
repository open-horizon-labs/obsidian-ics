import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";
import obsidianmd from "eslint-plugin-obsidianmd";


/** @type {import('eslint').Linter.Config[]} */
export default [
  // Build output. esbuild emits main.js at the root, and dist/ is generated too -
  // linting either just reports on bundled dependency code.
  {ignores: ["main.js", "dist/**", "**/*.js.map"]},
  {files: ["**/*.{js,mjs,cjs,ts}"]},
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Build tooling and maintenance scripts run under Node, never inside Obsidian,
  // so the plugin rules about Node APIs and console use don't apply to them.
  {
    files: ["scripts/**/*.js", "*.mjs"],
    languageOptions: { globals: globals.node },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
  // Tests run under Node in jest, not inside Obsidian - same reasoning.
  {
    files: ["tests/**/*.ts"],
    languageOptions: { globals: { ...globals.node, ...globals.jest } },
    rules: {
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
    },
  },
];
