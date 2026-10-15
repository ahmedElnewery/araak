import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    alias: { "server-only": new URL("../helpers/server-only-stub.ts", import.meta.url).pathname },
  },
});
