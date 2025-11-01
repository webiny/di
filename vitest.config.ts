import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [{ find: /^~(.*)/, replacement: `${process.cwd()}/src$1` }]
  }
});
