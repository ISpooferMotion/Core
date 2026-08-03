import { readFile } from "node:fs/promises";

const packageJson = JSON.parse(
	await readFile(new URL("../package.json", import.meta.url), "utf8"),
);
const lock = await readFile(new URL("../bun.lock", import.meta.url), "utf8");
const declared = packageJson.devDependencies?.typescript;
const workspaceMatch = lock.match(/"typescript":\s*"([^"]+)"/);
const resolvedMatch = lock.match(/"typescript":\s*\["typescript@([^"]+)"/);

if (!declared || !workspaceMatch || !resolvedMatch) {
	throw new Error(
		"Could not locate the TypeScript declaration and resolution.",
	);
}
if (declared !== workspaceMatch[1] || declared !== resolvedMatch[1]) {
	throw new Error(
		`TypeScript mismatch: package=${declared}, lock workspace=${workspaceMatch[1]}, lock resolution=${resolvedMatch[1]}`,
	);
}
if (lock.includes('"@typescript/typescript-')) {
	throw new Error(
		"bun.lock still contains TypeScript 7 native package entries.",
	);
}
console.log(`TypeScript lock is consistent at ${declared}.`);
