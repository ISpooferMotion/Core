import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";

await mkdir("dist", { recursive: true });
await Promise.all([
	copyFile("src/styles.css", "dist/styles.css"),
	copyFile("schema.json", "dist/schema.json"),
]);

const declarationFiles = await findDeclarationFiles("dist");
await Promise.all(declarationFiles.map(normalizeDeclarations));

async function findDeclarationFiles(directory) {
	const files = [];
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findDeclarationFiles(path)));
		} else if (entry.name.endsWith(".d.ts")) {
			files.push(path);
		}
	}
	return files;
}

async function normalizeDeclarations(path) {
	const source = await readFile(path, "utf8");
	const esm = rewriteRelativeSpecifiers(source, ".js");
	const commonJs = rewriteRelativeSpecifiers(esm, ".cjs")
		.replace(/\/\/# sourceMappingURL=.*\.d\.ts\.map\s*$/m, "")
		.trimEnd();

	await Promise.all([
		writeFile(path, esm),
		writeFile(path.replace(/\.d\.ts$/, ".d.cts"), `${commonJs}\n`),
	]);
}

function rewriteRelativeSpecifiers(source, extension) {
	return source
		.replace(
			/(\bfrom\s+)(["'])(\.\.?\/[^"']+)\2/g,
			(_match, prefix, quote, specifier) =>
				`${prefix}${quote}${withExtension(specifier, extension)}${quote}`,
		)
		.replace(
			/(\b(?:import|require)\s*\(\s*)(["'])(\.\.?\/[^"']+)\2/g,
			(_match, prefix, quote, specifier) =>
				`${prefix}${quote}${withExtension(specifier, extension)}${quote}`,
		);
}

function withExtension(specifier, extension) {
	if (specifier.endsWith(".js") || specifier.endsWith(".cjs")) {
		return `${specifier.replace(/\.(?:c?js)$/, "")}${extension}`;
	}
	if (/\.[a-z0-9]+$/i.test(specifier)) return specifier;
	return `${specifier}${extension}`;
}
