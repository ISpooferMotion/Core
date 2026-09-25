import { createHash } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	realpathSync,
	rmSync,
	statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommandSync } from "./package-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarball = resolve(root, process.argv[2] ?? ".artifacts/package.tgz");
const sourceManifest = JSON.parse(
	readFileSync(resolve(root, "package.json"), "utf8"),
);

function fail(message) {
	throw new Error(`[package:validate] ${message}`);
}

function run(command, args, cwd = root) {
	const result = runCommandSync(command, args, {
		cwd,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) {
		fail(`${command} exited with status ${result.status ?? "unknown"}`);
	}
}

function collectPackageTargets(value, output = []) {
	if (typeof value === "string") {
		if (value.startsWith("./")) output.push(value);
		return output;
	}
	if (Array.isArray(value)) {
		for (const item of value) collectPackageTargets(item, output);
		return output;
	}
	if (value && typeof value === "object") {
		for (const item of Object.values(value)) {
			collectPackageTargets(item, output);
		}
	}
	return output;
}

function verifyPackageTarget(packageRoot, target) {
	const absolute = resolve(packageRoot, target);
	const relativeTarget = relative(packageRoot, absolute);
	if (relativeTarget.startsWith("..") || isAbsolute(relativeTarget)) {
		fail(`manifest target escapes the installed package: ${target}`);
	}
	if (!existsSync(absolute) || !statSync(absolute).isFile()) {
		fail(`manifest target does not exist as a file: ${target}`);
	}
	const resolvedRoot = realpathSync(packageRoot);
	const resolvedTarget = realpathSync(absolute);
	const resolvedRelative = relative(resolvedRoot, resolvedTarget);
	if (resolvedRelative.startsWith("..") || isAbsolute(resolvedRelative)) {
		fail(`manifest target resolves outside the installed package: ${target}`);
	}
}

function verifyChecksum() {
	const checksumPath = resolve(dirname(tarball), "package.sha256");
	if (!existsSync(checksumPath)) {
		if (tarball === resolve(root, ".artifacts/package.tgz")) {
			fail("missing .artifacts/package.sha256 for the release tarball");
		}
		return;
	}
	const checksum = readFileSync(checksumPath, "utf8").trim();
	const match = checksum.match(/^([a-f0-9]{64})\s+[ *]?package\.tgz$/i);
	if (!match) fail("package.sha256 has an invalid format");
	const actual = createHash("sha256")
		.update(readFileSync(tarball))
		.digest("hex");
	if (actual !== match[1].toLowerCase()) {
		fail(`package checksum mismatch: expected ${match[1]}, received ${actual}`);
	}
}

if (!existsSync(tarball) || !statSync(tarball).isFile()) {
	fail(`tarball not found: ${tarball}`);
}
verifyChecksum();

const installDir = mkdtempSync(resolve(tmpdir(), "ism-core-package-check-"));
try {
	run(
		"npm",
		[
			"install",
			"--prefix",
			installDir,
			"--offline",
			"--ignore-scripts",
			"--no-audit",
			"--no-fund",
			"--no-package-lock",
			"--legacy-peer-deps",
			tarball,
		],
		installDir,
	);

	const packageRoot = resolve(
		installDir,
		"node_modules",
		"@ispoofermotion",
		"core",
	);
	const installedManifest = JSON.parse(
		readFileSync(resolve(packageRoot, "package.json"), "utf8"),
	);
	if (installedManifest.name !== sourceManifest.name) {
		fail(
			`installed package name mismatch: expected ${sourceManifest.name}, received ${installedManifest.name}`,
		);
	}
	if (installedManifest.version !== sourceManifest.version) {
		fail(
			`installed package version mismatch: expected ${sourceManifest.version}, received ${installedManifest.version}`,
		);
	}

	for (const field of [
		"scripts",
		"devDependencies",
		"overrides",
		"lint-staged",
		"packageManager",
	]) {
		if (field in installedManifest) {
			fail(`publish-only manifest unexpectedly contains ${field}`);
		}
	}

	const targets = new Set([
		...collectPackageTargets(installedManifest.main),
		...collectPackageTargets(installedManifest.module),
		...collectPackageTargets(installedManifest.types),
		...collectPackageTargets(installedManifest.bin),
		...collectPackageTargets(installedManifest.exports),
	]);
	if (targets.size === 0) fail("installed manifest exposes no package targets");
	for (const target of targets) verifyPackageTarget(packageRoot, target);

	const duplicateSchema = resolve(packageRoot, "dist", "schema.json");
	if (existsSync(duplicateSchema)) {
		fail(
			"installed package contains duplicate dist/schema.json; schema.json must have one canonical public location",
		);
	}
	const devToolsDeclaration = readFileSync(
		resolve(packageRoot, "dist", "DevTools.d.ts"),
		"utf8",
	);
	if (/from ["']\.\/runtime(?:\.js)?["']/.test(devToolsDeclaration)) {
		fail("public DevTools declarations leak the internal Runtime type");
	}

	const shim = resolve(
		installDir,
		"node_modules",
		".bin",
		process.platform === "win32" ? "ism-core.cmd" : "ism-core",
	);
	run(shim, ["--version"], installDir);
	run(shim, ["--help"], installDir);
	console.log(
		`Validated ${installedManifest.name}@${installedManifest.version} from the local tarball without registry access.`,
	);
} finally {
	rmSync(installDir, { recursive: true, force: true });
}
