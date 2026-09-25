import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const readText = (path) => readFile(new URL(path, root), "utf8");

const manifest = JSON.parse(await readText("package.json"));
const schema = JSON.parse(await readText("schema.json"));
const versionSource = await readText("src/version.ts");

const versionMatch = versionSource.match(
	/^export const CORE_VERSION = "([^"]+)";\s*$/m,
);
if (!versionMatch) {
	throw new Error("Could not read CORE_VERSION from src/version.ts.");
}

const packageVersion = manifest.version;
const coreVersion = versionMatch[1];
if (packageVersion !== coreVersion) {
	throw new Error(
		`Version metadata mismatch: package.json=${packageVersion}, CORE_VERSION=${coreVersion}.`,
	);
}

const schemaExamples = schema.properties?.$schema?.examples;
if (!Array.isArray(schemaExamples) || schemaExamples.length === 0) {
	throw new Error("schema.json must expose at least one $schema example URL.");
}
const expectedSchemaUrl = `https://unpkg.com/@ispoofermotion/core@${packageVersion}/schema.json`;
if (!schemaExamples.includes(expectedSchemaUrl)) {
	throw new Error(
		`schema.json is not synchronized with package version ${packageVersion}. Expected example: ${expectedSchemaUrl}`,
	);
}

if (manifest.exports?.["./schema.json"] !== "./schema.json") {
	throw new Error(
		"The public schema export must resolve to the root schema.json.",
	);
}

console.log(`Package metadata is synchronized at ${packageVersion}.`);
