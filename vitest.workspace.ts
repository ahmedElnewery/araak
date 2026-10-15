import { defineWorkspace } from "vitest/config";

export default defineWorkspace(["packages/*/vitest.config.ts", "tests/security/vitest.config.ts"]);
