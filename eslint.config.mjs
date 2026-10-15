import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import tseslint from "typescript-eslint";

const serverOnlyPatterns = [
  "@workspace/auth/server",
  "@workspace/auth/server/*",
  "@workspace/config/server",
  "@workspace/config/server/*",
  "server-only",
];


// (a) files with a "use client" directive must not import server-only modules.
const isServerOnly = (source) =>
  serverOnlyPatterns.some((p) => (p.endsWith("/*") ? source.startsWith(p.slice(0, -1)) : source === p));

const localPlugin = {
  rules: {
    "no-server-import-in-client": {
      meta: { type: "problem", schema: [], messages: { bad: "Client components must not import server-only module '{{source}}'." } },
      create(context) {
        const body = context.sourceCode.ast.body;
        const isClient = body.some(
          (n) => n.type === "ExpressionStatement" && n.directive === "use client",
        );
        if (!isClient) return {};
        return {
          ImportDeclaration(node) {
            if (isServerOnly(String(node.source.value))) {
              context.report({ node, messageId: "bad", data: { source: node.source.value } });
            }
          },
        };
      },
    },
  },
};

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/.turbo/**", "**/coverage/**", "specs/**", "docs/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { ...jsxA11y.flatConfigs.recommended, files: ["**/*.{tsx,jsx}"] },
  {
    files: ["apps/**/*.{ts,tsx}"],
    plugins: { "@next/next": nextPlugin },
    rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs["core-web-vitals"].rules },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  // (c) apps must use @workspace/ui, never @radix-ui/* directly (FR-042)
  {
    files: ["apps/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ group: ["@radix-ui/*", "radix-ui"], message: "Import UI primitives from @workspace/ui only (FR-042)." }] },
      ],
    },
  },
  // (b) the shared UI package stays free of data/auth concerns
  {
    files: ["packages/ui/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@supabase/*", "@workspace/auth", "@workspace/auth/*", "@workspace/db", "@workspace/db/*", "@workspace/authorization", "@workspace/authorization/*"],
              message: "packages/ui must not depend on Supabase, auth, db or authorization (Constitution VII).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { local: localPlugin },
    rules: { "local/no-server-import-in-client": "error" },
  },
);
