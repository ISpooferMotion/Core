/// <reference types="node" />
import { defineConfig } from "tsup";

const shared = {
	dts: false,
	sourcemap: true,
	target: "es2022",
} as const;

export default defineConfig([
	{
		...shared,
		entry: { index: "src/index.ts", devtools: "src/devtools-entry.ts" },
		format: ["esm", "cjs"],
		clean: true,
	},
	{
		...shared,
		entry: { cli: "src/cli.ts" },
		format: ["esm"],
		clean: false,
	},
]);
