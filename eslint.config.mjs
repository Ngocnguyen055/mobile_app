import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
export default [
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
      "no-constant-condition": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "max-lines": ["warn", { max: 500, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    files: ["src/mobile/{components,screens,hooks}/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [{
          group: ["**/services/api.ts", "**/services/api/client.ts"],
          importNames: ["api", "json"],
          message: "Use a feature API service; keep HTTP paths and request bodies in services/api/.",
        }],
      }],
    },
  },
];
