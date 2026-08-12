import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { gzipSync } from "node:zlib";

const root = process.cwd();
const budgets = JSON.parse(
	await readFile(resolve(root, "performance-budgets.json"), "utf8"),
);

const fileCache = new Map();
const measurementCache = new Map();

async function read(path) {
	const absolutePath = resolve(root, path);
	let bytes = fileCache.get(absolutePath);
	if (!bytes) {
		bytes = await readFile(absolutePath);
		fileCache.set(absolutePath, bytes);
	}
	return bytes;
}

function findStaticImports(source) {
	const imports = new Set();
	// Only recognize actual ESM declarations. Searching every occurrence of
	// `import` also matches documentation strings in bundled CLI output.
	const pattern =
		/(?:^|\n)\s*(?:import|export)\s+(?:(?:[^"'`]*?)\s+from\s+)?["'](\.[^"']+)["'];?/g;
	for (const match of source.matchAll(pattern)) {
		const specifier = match[1];
		if (specifier) imports.add(specifier);
	}
	return imports;
}

async function collectStaticGraph(entry) {
	const entryPath = resolve(root, entry);
	const visited = new Set();
	const chunks = [];
	const stack = [entryPath];

	while (stack.length > 0) {
		const absolutePath = stack.pop();
		if (!absolutePath || visited.has(absolutePath)) continue;
		visited.add(absolutePath);

		const bytes = await readFile(absolutePath);
		chunks.push(bytes);
		const source = bytes.toString("utf8");
		for (const specifier of findStaticImports(source)) {
			const dependency = resolve(dirname(absolutePath), specifier);
			if (!visited.has(dependency)) stack.push(dependency);
		}
	}

	// Separators keep concatenated source tokens from affecting compression in an
	// unrealistic way while still measuring shared static chunks exactly once.
	return Buffer.concat(chunks.flatMap((chunk) => [chunk, Buffer.from("\n")]));
}

async function measureBudget(name) {
	let measurement = measurementCache.get(name);
	if (measurement) return measurement;
	const budget = budgets.bundleSizes?.[name];
	if (!budget) throw new Error(`Unknown bundle budget: ${name}`);
	const bytes =
		budget.graph === "static"
			? await collectStaticGraph(budget.entry)
			: await read(budget.entry);
	measurement = {
		raw: bytes.byteLength,
		gzip: gzipSync(bytes, { level: 9 }).byteLength,
	};
	measurementCache.set(name, measurement);
	return measurement;
}

let failed = false;
for (const [name, budget] of Object.entries(budgets.bundleSizes ?? {})) {
	const size = (await measureBudget(name))[budget.metric];
	const ok = size <= budget.maxBytes;
	console.log(
		`${ok ? "PASS" : "FAIL"} ${name} (${budget.entry}, ${budget.graph}) ${budget.metric}: ${size} / ${budget.maxBytes} bytes`,
	);
	if (!ok) failed = true;
}

for (const ratio of budgets.bundleRatios ?? []) {
	const numerator = (await measureBudget(ratio.numerator))[ratio.metric];
	const denominator = (await measureBudget(ratio.denominator))[ratio.metric];
	const value =
		denominator === 0 ? Number.POSITIVE_INFINITY : numerator / denominator;
	const ok = value <= ratio.maxRatio;
	console.log(
		`${ok ? "PASS" : "FAIL"} ${ratio.numerator} / ${ratio.denominator} ${ratio.metric}: ${value.toFixed(3)} / ${ratio.maxRatio}`,
	);
	if (!ok) failed = true;
}

if (failed) {
	console.error(
		"Bundle-size budget exceeded. Update the implementation or intentionally revise performance-budgets.json.",
	);
	process.exit(1);
}
