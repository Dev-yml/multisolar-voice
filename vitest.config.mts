import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "apps/voice/test/**/*.test.ts", "apps/console/test/**/*.test.ts"],
    environment: "node",
    alias: { "server-only": fileURLToPath(new URL("./apps/console/test/empty.ts", import.meta.url)) },
  },
});
