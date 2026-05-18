import { defineConfig } from "@rslib/core";

export default defineConfig({
  source: {
    tsconfigPath: "./tsconfig.build.json"
  },
  lib: [{ format: "esm", syntax: "esnext", dts: true, bundle: true }]
});
