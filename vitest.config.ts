import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^~(.*)/, replacement: `${process.cwd()}/src$1` }]
  },
  test: {
    globals: true,
    include: ["__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/*.ts"],
      exclude: ["**/index.ts", "**/abstractions/**", "**/feature.ts", "src/DependencyGraph.ts"]
    }
  }
});
