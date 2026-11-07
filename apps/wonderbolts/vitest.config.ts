import { defineConfig } from "vitest/config";

/**
 *   unit  server/utils and shared/, plain functions with fetch faked; seconds.
 *   e2e   builds the app and runs it against dev/mock-agent.ts (@nuxt/test-utils);
 *         the server routes, the friend/family split and the rendered pages.
 */
export default defineConfig({
  test: {
    projects: [
      { test: { name: "unit", include: ["test/unit/**/*.test.ts"], environment: "node" } },
      { test: { name: "e2e", include: ["test/e2e/**/*.test.ts"], environment: "node", testTimeout: 60000, hookTimeout: 300000 } },
    ],
  },
});
