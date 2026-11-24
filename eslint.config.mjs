import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@next/next/no-img-element": "off", // merchant images are arbitrary https URLs; we avoid the image optimizer by design
      "no-console": ["warn", { allow: ["error", "warn"] }],
    },
  },
  globalIgnores([".next/**", "node_modules/**", "src/generated/**", "coverage/**", "playwright-report/**", "test-results/**", "next-env.d.ts"]),
]);
