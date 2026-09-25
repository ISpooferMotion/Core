import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

function resolveCommand(command) {
	if (process.platform !== "win32") {
		return { command, shell: false };
	}

	if (command === "npm" || command === "npx" || command === "bun") {
		return { command: `${command}.cmd`, shell: true };
	}

	const normalized = command.toLowerCase();
	return {
		command,
		shell: normalized.endsWith(".cmd") || normalized.endsWith(".bat"),
	};
}

export function runCommandSync(command, args = [], options = {}) {
	const resolved = resolveCommand(command);
	return spawnSync(resolved.command, args, {
		...options,
		shell: resolved.shell,
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
