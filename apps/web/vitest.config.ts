import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  oxc: false,
  test: {
    environment: "node",
    exclude: [...configDefaults.exclude, "test/browser/**"],
  },
});
