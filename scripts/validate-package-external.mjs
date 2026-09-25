import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runCommandSync } from "./package-utils.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tarball = resolve(root, process.argv[2] ?? ".artifacts/package.tgz");

function run(command, args, cwd = root) {
	const result = runCommandSync(command, args, {
		cwd,
		stdio: "inherit",
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

run("npx", ["--yes", "publint@0.3.22", tarball]);
run("npx", [
	"--yes",
	"@arethetypeswrong/cli@0.18.3",
	tarball,
	"--profile",
	"node16",
	"--exclude-entrypoints",
	"styles.css",
	"assets/ism-config.png",
	"assets/ism-config-dark.png",
	"assets/ism-config-light.png",
]);

const installDir = mkdtempSync(resolve(tmpdir(), "ism-core-package-check-"));
try {
	run("npm", [
		"install",
		"--prefix",
		installDir,
		"--ignore-scripts",
		"--no-audit",
		"--no-fund",
		"--no-package-lock",
		"--legacy-peer-deps",
		tarball,
	]);

	const shim = resolve(
		installDir,
		"node_modules",
		".bin",
		process.platform === "win32" ? "ism-core.cmd" : "ism-core",
	);
	run(shim, ["--version"], installDir);
	run(shim, ["--help"], installDir);
} finally {
	rmSync(installDir, { recursive: true, force: true });
}
