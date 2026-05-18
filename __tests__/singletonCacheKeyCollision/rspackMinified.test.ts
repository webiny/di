import { describe, test, expect } from "vitest";
import { rspack } from "@rspack/core";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function bundle(outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const compiler = rspack({
      entry: path.resolve(__dirname, "fixture.ts"),
      output: {
        path: outputDir,
        filename: "bundle.js"
      },
      target: "node",
      mode: "production",
      resolve: {
        extensions: [".ts", ".js"],
        extensionAlias: {
          ".js": [".ts", ".js"]
        }
      },
      module: {
        rules: [
          {
            test: /\.ts$/,
            use: {
              loader: "builtin:swc-loader",
              options: {
                jsc: {
                  parser: { syntax: "typescript" },
                  transform: {
                    legacyDecorator: true,
                    decoratorMetadata: true
                  }
                }
              }
            }
          }
        ]
      },
      optimization: {
        minimize: true,
        mangleExports: true
      }
    });

    compiler.run((err, stats) => {
      if (err) return reject(err);
      if (stats?.hasErrors()) {
        return reject(new Error(stats.compilation.errors.map(e => e.message).join("\n")));
      }
      resolve();
    });
  });
}

describe("Singleton cache key collision - rspack minified bundle", () => {
  let outputDir: string;
  let result: {
    pluginCount: number;
    names: string[];
    results: string[];
    distinctInstances: number;
  };

  test("bundle fixture with rspack and execute it", async () => {
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "di-minified-test-"));

    await bundle(outputDir);

    const bundlePath = path.join(outputDir, "bundle.js");
    expect(fs.existsSync(bundlePath)).toBe(true);

    const stdout = execFileSync("node", [bundlePath], { encoding: "utf-8" });
    result = JSON.parse(stdout);
  });

  test("registry should contain 3 plugins", () => {
    expect(result.pluginCount).toBe(3);
  });

  test("each plugin should have a distinct name", () => {
    expect(result.names).toEqual(["auth", "cache", "logging"]);
  });

  test("each plugin should execute with its own result", () => {
    expect(result.results).toEqual(["auth:executed", "cache:executed", "logging:executed"]);
  });

  test("all 3 plugins should be distinct class instances", () => {
    expect(result.distinctInstances).toBe(3);
  });
});
