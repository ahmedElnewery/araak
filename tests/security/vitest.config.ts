import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    alias: {
      "server-only": new URL("../helpers/server-only-stub.ts", import.meta.url).pathname,
      // portal modules (route handlers, features) import each other through the app's `@/` path alias
      "@/": new URL("../../apps/portal/src/", import.meta.url).pathname,
    },
  },
});
