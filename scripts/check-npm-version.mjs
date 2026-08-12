import { spawnSync } from "node:child_process";

const [name, version] = process.argv.slice(2);
if (!name || !version) {
	throw new Error(
		"Usage: node scripts/check-npm-version.mjs <package> <version>",
	);
}

const result = spawnSync(
	"npm",
	["view", `${name}@${version}`, "version", "--json"],
	{
		encoding: "utf8",
	},
);

if (result.status === 0) {
	const published = JSON.parse(result.stdout);
	if (published !== version)
		throw new Error(`Registry returned unexpected version: ${published}`);
	process.exit(0);
}

const errorText = `${result.stdout}\n${result.stderr}`;
if (/\bE404\b|404 Not Found|is not in this registry/i.test(errorText)) {
	process.exit(2);
}

process.stderr.write(errorText);
process.exit(1);
