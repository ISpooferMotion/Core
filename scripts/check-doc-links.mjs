import { access, readdir, readFile } from "node:fs/promises";
import { dirname, extname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
	"README.md",
	"CHANGELOG.md",
	"CONTRIBUTING.md",
	"STABILITY.md",
	"MIGRATION.md",
	"SECURITY.md",
];

async function collectMarkdown(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		if (entry.name === "api") continue;
		const path = resolve(directory, entry.name);
		if (entry.isDirectory()) files.push(...(await collectMarkdown(path)));
		else if (entry.isFile() && extname(entry.name) === ".md") files.push(path);
	}
	return files;
}

function stripFencedCode(markdown) {
	return markdown.replace(/```[\s\S]*?```/g, "");
}

function localTarget(rawTarget) {
	const target = rawTarget.trim().replace(/^<|>$/g, "");
	if (
		!target ||
		target.startsWith("#") ||
		/^[a-z][a-z0-9+.-]*:/i.test(target) ||
		target.startsWith("//")
	) {
		return null;
	}

	const [pathPart] = target.split("#", 1);
	return decodeURIComponent(pathPart);
}

const markdownFiles = [
	...roots.map((path) => resolve(root, path)),
	...(await collectMarkdown(resolve(root, "docs"))),
];

const failures = [];

for (const file of markdownFiles) {
	const markdown = stripFencedCode(await readFile(file, "utf8"));
	const linkPattern = /!?(?:\[[^\]]*\])\(([^)]+)\)/g;

	for (const match of markdown.matchAll(linkPattern)) {
		const target = localTarget(match[1]);
		if (!target) continue;

		const resolved = resolve(dirname(file), target);
		try {
			await access(resolved);
		} catch {
			failures.push(
				`${relative(root, file)} -> ${match[1]} (missing ${relative(root, resolved)})`,
			);
		}
	}
}

if (failures.length > 0) {
	console.error("Documentation link validation failed:\n");
	for (const failure of failures) console.error(`- ${failure}`);
	process.exit(1);
}

console.log(`Validated local links in ${markdownFiles.length} Markdown files.`);
