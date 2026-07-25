/// <reference types="node" />
import { copyFile } from "node:fs/promises";
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: false,
  sourcemap: true,
  target: "es2022",
  clean: true,
  // Copy the CSS baseline into dist so it's accessible as @ispoofermotion/core/styles.css
  async onSuccess() {
    await copyFile("src/styles.css", "dist/styles.css");
  },
});
