import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createPublishStage } from "./package-utils.mjs";

const root = process.cwd();
const artifactDir = resolve(process.argv[2] ?? ".artifacts");
const stageDir = resolve(artifactDir, "stage");
await rm(artifactDir, { recursive: true, force: true });
await mkdir(artifactDir, { recursive: true });
await createPublishStage(root, stageDir);

const result = spawnSync(
	"npm",
	[
		"pack",
		stageDir,
		"--ignore-scripts",
		"--json",
		"--pack-destination",
		artifactDir,
	],
	{ encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
);

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

const payload = JSON.parse(result.stdout);
if (!Array.isArray(payload) || payload.length !== 1 || !payload[0]?.filename) {
	throw new Error("npm pack returned an unexpected result.");
}

const generatedPath = resolve(artifactDir, payload[0].filename);
const tarballPath = resolve(artifactDir, "package.tgz");
await rename(generatedPath, tarballPath);

const bytes = await readFile(tarballPath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
await writeFile(
	resolve(artifactDir, "package.sha256"),
	`${sha256}  package.tgz\n`,
);
await writeFile(
	resolve(artifactDir, "npm-pack.json"),
	`${JSON.stringify(payload[0], null, 2)}\n`,
);
await rm(stageDir, { recursive: true, force: true });

console.log(tarballPath);
