/// <reference types="node" />
import { copyFile } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  target: "es2022",
  clean: true,
  // Copy the CSS baseline and schema into dist
  async onSuccess() {
    await copyFile("src/styles.css", "dist/styles.css");
    await copyFile("schema.json", "dist/schema.json");
  },
});
