import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommandSync } from "./package-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = resolve(root, "fixtures/consumers");
const tarball = resolve(root, process.argv[2] ?? ".artifacts/package.tgz");
const rootNodeModules = resolve(root, "node_modules");
const requiredRootPackages = [
	"react",
	"react-dom",
	"@types/react",
	"@types/react-dom",
	"typescript/bin/tsc",
	"vite/bin/vite.js",
];

if (!existsSync(tarball)) {
	throw new Error(`Release tarball not found: ${tarball}`);
}
for (const packagePath of requiredRootPackages) {
	if (!existsSync(resolve(rootNodeModules, ...packagePath.split("/")))) {
		throw new Error(
			`Missing frozen consumer dependency ${packagePath}. Run bun install --frozen-lockfile first.`,
		);
	}
}

const tempRoot = await mkdtemp(resolve(tmpdir(), "ism-consumers-offline-"));

function run(command, args, cwd) {
	const result = runCommandSync(command, args, {
		cwd,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

async function linkRootPackage(consumer, packageName) {
	const source = resolve(rootNodeModules, ...packageName.split("/"));
	const target = resolve(consumer, "node_modules", ...packageName.split("/"));
	await mkdir(dirname(target), { recursive: true });
	await symlink(
		source,
		target,
		process.platform === "win32" ? "junction" : "dir",
	);
}

async function createConsumer(name, type = "module") {
	const consumer = resolve(tempRoot, name);
	await mkdir(consumer, { recursive: true });
	await writeFile(
		resolve(consumer, "package.json"),
		`${JSON.stringify({ private: true, type }, null, 2)}\n`,
	);
	run(
		"npm",
		[
			"install",
			"--offline",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--no-package-lock",
			"--legacy-peer-deps",
			tarball,
		],
		consumer,
	);
	return consumer;
}

async function verifyNodeCjs() {
	const consumer = await createConsumer("node-cjs", "commonjs");
	await cp(
		resolve(fixtureRoot, "node-cjs/index.cjs"),
		resolve(consumer, "index.cjs"),
	);
	await linkRootPackage(consumer, "react");
	await linkRootPackage(consumer, "react-dom");
	console.log("\n==> node-cjs (offline, frozen root dependencies)");
	run(process.execPath, ["index.cjs"], consumer);
}

async function verifyNodeEsmTypescript() {
	const consumer = await createConsumer("node-esm-ts");
	await cp(resolve(fixtureRoot, "node-esm-ts/src"), resolve(consumer, "src"), {
		recursive: true,
	});
	await cp(
		resolve(fixtureRoot, "node-esm-ts/tsconfig.json"),
		resolve(consumer, "tsconfig.json"),
	);
	for (const packageName of [
		"react",
		"react-dom",
		"@types/react",
		"@types/react-dom",
	]) {
		await linkRootPackage(consumer, packageName);
	}
	console.log("\n==> node-esm-ts (offline, frozen root dependencies)");
	run(
		process.execPath,
		[resolve(rootNodeModules, "typescript/bin/tsc"), "-p", "tsconfig.json"],
		consumer,
	);
	run(process.execPath, ["dist/index.js"], consumer);
}

async function verifyViteReact19() {
	const consumer = await createConsumer("vite-react19");
	await cp(
		resolve(fixtureRoot, "vite-react19/index.html"),
		resolve(consumer, "index.html"),
	);
	await cp(resolve(fixtureRoot, "vite-react19/src"), resolve(consumer, "src"), {
		recursive: true,
	});
	await linkRootPackage(consumer, "react");
	await linkRootPackage(consumer, "react-dom");
	console.log("\n==> vite-react19 (offline, frozen root dependencies)");
	run(
		process.execPath,
		[resolve(rootNodeModules, "vite/bin/vite.js"), "build"],
		consumer,
	);
}

try {
	await verifyNodeCjs();
	await verifyNodeEsmTypescript();
	await verifyViteReact19();
	console.log("\nDeterministic offline consumer validation passed.");
} finally {
	await rm(tempRoot, { recursive: true, force: true });
}
