import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.test.ts"], alias: { "server-only": new URL("../../tests/helpers/server-only-stub.ts", import.meta.url).pathname } },
});
