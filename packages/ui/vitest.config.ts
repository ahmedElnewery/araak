import { defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@workspace/ui": new URL("./src", import.meta.url).pathname } },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
