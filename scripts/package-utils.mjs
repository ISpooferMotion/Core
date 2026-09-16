import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

export function formatCommand(command, args = []) {
	return [command, ...args]
		.map((part) => {
			if (typeof part !== "string") return String(part);
			if (process.platform === "win32") {
				if (/[\s"&|<>()^%!]/.test(part)) {
					const escaped = part.replace(/"/g, '\\"').replace(/%/g, "%%");
					return `"${escaped}"`;
				}
				return part;
			}
			if (/[^\w@%+=:,./-]/.test(part)) {
				return `'${part.replace(/'/g, "'\\''")}'`;
			}
			return part;
		})
		.join(" ");
}

export function runCommandSync(command, args = [], options = {}) {
	const commandLine = formatCommand(command, args);
	return spawnSync(commandLine, {
		shell: true,
		...options,
	});
}

export async function createPublishStage(root, stageDir) {
	await rm(stageDir, { recursive: true, force: true });
	await mkdir(stageDir, { recursive: true });

	const sourceManifest = JSON.parse(
		await readFile(resolve(root, "package.json"), "utf8"),
	);
	const publishManifest = structuredClone(sourceManifest);

	delete publishManifest.scripts;
	delete publishManifest.devDependencies;
	delete publishManifest.overrides;
	delete publishManifest["lint-staged"];
	delete publishManifest.packageManager;

	for (const item of sourceManifest.files ?? []) {
		const source = resolve(root, item);
		const target = resolve(stageDir, item);
		const stagedRelativePath = relative(stageDir, target);
		if (stagedRelativePath.startsWith("..") || isAbsolute(stagedRelativePath)) {
			throw new Error(
				`Refusing to stage package path outside the package root: ${item}`,
			);
		}
		await mkdir(dirname(target), { recursive: true });
		await cp(source, target, { recursive: true, force: true });
	}

	await writeFile(
		resolve(stageDir, "package.json"),
		`${JSON.stringify(publishManifest, null, 2)}\n`,
	);
}
