import { copyFile, mkdir } from "node:fs/promises";

await mkdir("dist", { recursive: true });
await Promise.all([
	copyFile("src/styles.css", "dist/styles.css"),
	copyFile("schema.json", "dist/schema.json"),
]);
