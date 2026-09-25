import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const lockText = await readFile(
	new URL("../bun.lock", import.meta.url),
	"utf8",
);
const lock = JSON.parse(stripTrailingCommas(lockText));
const workspace = lock.workspaces?.[""];

if (!workspace || !lock.packages) {
	throw new Error("bun.lock is missing the root workspace or package graph.");
}

for (const group of ["devDependencies", "peerDependencies"]) {
	const declared = packageJson[group] ?? {};
	const locked = workspace[group] ?? {};
	const declaredNames = Object.keys(declared).sort();
	const lockedNames = Object.keys(locked).sort();
	if (JSON.stringify(declaredNames) !== JSON.stringify(lockedNames)) {
		throw new Error(
			`${group} names differ between package.json and bun.lock. package=${declaredNames.join(",")}; lock=${lockedNames.join(",")}`,
		);
	}
	for (const name of declaredNames) {
		if (declared[name] !== locked[name]) {
			throw new Error(
				`${group} range mismatch for ${name}: package=${declared[name]}, lock=${locked[name]}`,
			);
		}
	}
}

for (const name of Object.keys(packageJson.devDependencies ?? {})) {
	if (!(name in lock.packages)) {
		throw new Error(`bun.lock has no resolved package entry for ${name}.`);
	}
}

const typescriptVersion = packageJson.devDependencies?.typescript;
const typescriptResolution = lock.packages.typescript?.[0];
if (
	typeof typescriptVersion !== "string" ||
	typescriptResolution !== `typescript@${typescriptVersion}`
) {
	throw new Error(
		`TypeScript mismatch: package=${typescriptVersion}, resolution=${typescriptResolution}`,
	);
}

const packageNames = Object.keys(lock.packages);
if (packageNames.some((name) => name.startsWith("@typescript/typescript-"))) {
	throw new Error(
		"bun.lock contains TypeScript 7 native package entries while the project is pinned to the TypeScript 5 toolchain.",
	);
}
if (packageNames.some((name) => name === "tsup" || name.startsWith("tsup/"))) {
	throw new Error("bun.lock still contains the retired tsup build tool.");
}

const reachablePackages = collectReachablePackages(lock.packages, [
	...Object.keys(packageJson.dependencies ?? {}),
	...Object.keys(packageJson.devDependencies ?? {}),
	...Object.keys(packageJson.optionalDependencies ?? {}),
]);
const unreachablePackages = packageNames.filter(
	(name) => !reachablePackages.has(name),
);
if (unreachablePackages.length > 0) {
	throw new Error(
		`bun.lock contains unreachable package entries: ${unreachablePackages.join(", ")}`,
	);
}

console.log(
	`bun.lock matches package.json and contains ${reachablePackages.size} reachable package entries; TypeScript is pinned at ${typescriptVersion}.`,
);

function collectReachablePackages(packages, roots) {
	const reachable = new Set();

	const visit = (packageKey) => {
		if (reachable.has(packageKey)) return;
		const entry = packages[packageKey];
		if (!entry) {
			throw new Error(`bun.lock cannot resolve package entry ${packageKey}.`);
		}
		reachable.add(packageKey);

		const metadata = entry[2] ?? {};
		for (const group of ["dependencies", "optionalDependencies"]) {
			for (const dependencyName of Object.keys(metadata[group] ?? {})) {
				const nestedKey = `${packageKey}/${dependencyName}`;
				const dependencyKey =
					nestedKey in packages ? nestedKey : dependencyName;
				if (!(dependencyKey in packages)) {
					throw new Error(
						`bun.lock cannot resolve ${dependencyName} required by ${packageKey}.`,
					);
				}
				visit(dependencyKey);
			}
		}
	};

	for (const root of new Set(roots)) visit(root);
	return reachable;
}

function stripTrailingCommas(source) {
	let output = "";
	let inString = false;
	let escaped = false;

	for (let index = 0; index < source.length; index++) {
		const character = source[index];
		if (inString) {
			output += character;
			if (escaped) escaped = false;
			else if (character === "\\") escaped = true;
			else if (character === '"') inString = false;
			continue;
		}

		if (character === '"') {
			inString = true;
			output += character;
			continue;
		}

		if (character === ",") {
			let lookahead = index + 1;
			while (/\s/.test(source[lookahead] ?? "")) lookahead++;
			if (source[lookahead] === "}" || source[lookahead] === "]") continue;
		}

		output += character;
	}

	return output;
}
