/// <reference types="node" />
import { copyFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const shared = {
	dts: false,
	sourcemap: true,
	target: "es2022",
} as const;

export default defineConfig([
	{
		...shared,
		entry: { index: "src/index.ts" },
		format: ["esm", "cjs"],
		clean: true,
	},
	{
		...shared,
		entry: { cli: "src/cli.ts" },
		format: ["esm"],
		clean: false,
		async onSuccess() {
			await copyFile("src/styles.css", "dist/styles.css");
			await copyFile("schema.json", "dist/schema.json");
		},
	},
]);
