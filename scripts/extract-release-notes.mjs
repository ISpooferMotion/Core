import { readFile, writeFile } from "node:fs/promises";

const version = process.argv[2];
const output = process.argv[3];
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
	throw new Error(
		"Usage: node scripts/extract-release-notes.mjs <version> [output-file]",
	);
}

const changelog = await readFile("CHANGELOG.md", "utf8");
const lines = changelog.split(/\r?\n/);
const heading = `## [${version}]`;
const start = lines.findIndex(
	(line) => line === heading || line.startsWith(`${heading} - `),
);
if (start < 0) throw new Error(`CHANGELOG.md has no exact ${heading} section.`);

let end = lines.length;
for (let index = start + 1; index < lines.length; index += 1) {
	if (/^## \[/.test(lines[index])) {
		end = index;
		break;
	}
}

const notes = lines
	.slice(start + 1, end)
	.join("\n")
	.trim();
if (!notes) throw new Error(`CHANGELOG.md section ${heading} is empty.`);

if (output) await writeFile(output, `${notes}\n`);
else process.stdout.write(`${notes}\n`);
