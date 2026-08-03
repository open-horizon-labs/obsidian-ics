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
    rules: {
      // Sentence case is right for our UI text, but the rule can't tell prose
      // from names, acronyms, or the API identifiers we render inside <code>.
      // Configured rather than suppressed inline, which the obsidianmd config
      // forbids anyway (eslint-comments/no-restricted-disable).
      "obsidianmd/ui/sentence-case": ["error", {
        mode: "loose",
        brands: ["Obsidian", "Templater", "Dataview", "Google", "muness"],
        acronyms: ["ICS", "URL", "UID"],
        // Calendar terms users see capitalized in Google Calendar and Outlook.
        ignoreWords: ["Available", "Transparent"],
        // Property paths we render as code samples, e.g.
        // event.extractedFields["Field Names"] - identifiers, not prose.
        ignoreRegex: ["^\\w+\\.\\w+"],
      }],
    },
  },
  // The settings tab is built on APIs Obsidian deprecated in 1.13.0 in favour of
  // the declarative settings API (getSettingDefinitions, setDestructive). Both
  // are @since 1.13.0, and this plugin's minAppVersion is 1.9.12 - adopting them
  // would break every user below that. Revisit when minAppVersion reaches 1.13.0.
  {
    files: ["src/settings/ICSSettingsTab.ts"],
    rules: {
      "@typescript-eslint/no-deprecated": "off",
      "obsidianmd/settings-tab/prefer-setting-definitions": "off",
    },
  },
  // The crypto shim must work in Obsidian's renderer and the Node-based
  // compiled-artifact contract test, so the standard global is intentional.
  {
    files: ["src/cryptoShim.ts"],
    rules: {
      "obsidianmd/no-global-this": "off",
    },
  },
  // Build tooling and maintenance scripts run under Node, never inside Obsidian,
  // so the plugin rules about Node APIs and console use don't apply to them.
  {
    files: ["scripts/**/*.js", "*.js", "*.mjs"],
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
  // This suite require()s a build artifact from a path computed at test time
  // (dist/main.js, and a copy of it in a temp plugin folder) - that's the
  // point of the test, not something to route through a static import.
  // Configured here rather than suppressed inline, which
  // eslint-comments/no-restricted-disable forbids anyway (see the other
  // file-scoped overrides above).
  {
    files: ["tests/issue-198-dist-artifact.test.ts"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
