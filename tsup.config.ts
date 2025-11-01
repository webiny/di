import { defineConfig } from "tsup";

export default defineConfig({
  target: "esnext",
  entry: ["src/index.ts"],
  sourcemap: true,
  clean: true
});
