import { defineConfig } from "vitest/config";
import path from "node:path";
import { readFileSync, existsSync } from "node:fs";

// Integration tests always run against the dedicated test database.
const testEnv = existsSync(".env.test")
  ? Object.fromEntries(readFileSync(".env.test", "utf8").split("\n").filter((l) => l.includes("=")).map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
    }))
  : {};

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src"), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    env: { ...testEnv, NODE_ENV: "test" },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**", "src/server/**"],
      exclude: ["src/generated/**", "src/server/next/**"],
      thresholds: { lines: 85, functions: 85, branches: 75, statements: 85 },
    },
  },
});
