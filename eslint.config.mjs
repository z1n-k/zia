// Zia's scripts are linted as built (zia.uc.js): the parts in src/js share one scope, so
// only the whole shows what's unused. Firefox's and Zen's globals aren't listed, so
// no-undef is off; everything else is ESLint's recommended set.
import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    files: ["zia.uc.js"],
    languageOptions: { ecmaVersion: "latest", sourceType: "script" },
    rules: {
      "no-undef": "off",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
];
