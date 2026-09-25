import { rm } from "node:fs/promises";
import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const external = ["react", "react/*", "react-dom", "react-dom/*"];

const builds = [
	{
		entryPoints: {
			index: "src/index.ts",
			devtools: "src/devtools-entry.ts",
		},
		bundle: true,
		format: "esm",
		platform: "neutral",
		target: "es2022",
		splitting: true,
		sourcemap: true,
		outdir: "dist",
		external,
		logLevel: "info",
	},
	{
		entryPoints: {
			index: "src/index.ts",
			devtools: "src/devtools-entry.ts",
		},
		bundle: true,
		format: "cjs",
		platform: "neutral",
		target: "es2022",
		sourcemap: true,
		outdir: "dist",
		outExtension: { ".js": ".cjs" },
		external,
		logLevel: "info",
	},
	{
		entryPoints: { cli: "src/cli.ts" },
		bundle: true,
		format: "esm",
		platform: "node",
		target: "node22",
		sourcemap: true,
		outdir: "dist",
		logLevel: "info",
	},
];

await rm("dist", { recursive: true, force: true });

if (!watch) {
	for (const options of builds) await build(options);
} else {
	const contexts = await Promise.all(builds.map((options) => context(options)));
	await Promise.all(contexts.map((buildContext) => buildContext.watch()));
	console.log("Watching ISM Core bundles for changes...");
	await new Promise(() => {});
}
