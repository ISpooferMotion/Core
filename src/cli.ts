#!/usr/bin/env node
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { positionals } = parseArgs({
	args: process.argv.slice(2),
	allowPositionals: true,
});

const command = positionals[0];

if (command === "init") {
	const configPath = join(process.cwd(), "ism.config.json");

	if (existsSync(configPath)) {
		console.error("ism.config.json already exists.");
		process.exit(1);
	}

	const defaultConfig = `{
  "$schema": "https://unpkg.com/@ispoofermotion/core/schema.json",
  "layerZIndex": 100,
  "showDevTools": false
}
`;

	writeFileSync(configPath, defaultConfig);
	console.log("Created ism.config.json");
	console.log("You can now import this file and pass it to createApp().");
} else {
	console.log("Usage: ism-core init");
}
