import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const current = JSON.parse(await readFile("package.json", "utf8")).version;
const base = process.argv[2] ?? "HEAD^";
const result = spawnSync("git", ["show", `${base}:package.json`], {
	encoding: "utf8",
});

if (result.status !== 0) {
	process.stdout.write("true\n");
	process.exit(0);
}

const previous = JSON.parse(result.stdout).version;
process.stdout.write(`${current !== previous}\n`);
