import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/offline/**/*.test.js", "tests/offline/**/*.spec.js"],
    environment: "node",
  },
});
