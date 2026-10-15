import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["**/*.proof.test.ts"], testTimeout: 120_000, hookTimeout: 120_000, fileParallelism: false },
});
