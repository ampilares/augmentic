import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // Single in-memory PGlite instance; tests share fixtures sequentially.
    fileParallelism: false,
  },
});
