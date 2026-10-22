import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@long-boil/rules": fileURLToPath(new URL("./packages/rules/src/index.ts", import.meta.url)) },
  },
  test: { include: ["packages/*/test/**/*.test.ts"], fileParallelism: false },
});
