import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_LAYER_Z_INDEX,
	DEFAULT_SHOW_DEV_TOOLS,
	defineConfig,
} from "../config";

// The schema is maintained separately from the TypeScript config.
// These assertions catch default values drifting between the two files.
// Both sources need to agree before the test can pass.
// This includes the values used by the CLI scaffold.
// Keeping the check here avoids silent editor schema drift.
const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "..", "schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));

describe("schema.json stays in sync with config.ts defaults", () => {
	it("layerZIndex default matches DEFAULT_LAYER_Z_INDEX", () => {
		expect(schema.properties.layerZIndex.default).toBe(DEFAULT_LAYER_Z_INDEX);
		expect(schema.properties.layerZIndex.description).toContain(
			String(DEFAULT_LAYER_Z_INDEX),
		);
	});

	it("showDevTools default matches DEFAULT_SHOW_DEV_TOOLS", () => {
		expect(schema.properties.showDevTools.default).toBe(DEFAULT_SHOW_DEV_TOOLS);
		expect(schema.properties.showDevTools.description).toContain(
			String(DEFAULT_SHOW_DEV_TOOLS),
		);
	});
});

describe("defineConfig", () => {
	it("returns a valid config unchanged", () => {
		const config = { layerZIndex: 200, showDevTools: true };
		expect(defineConfig(config)).toBe(config);
	});

	it("throws for a non-finite layerZIndex", () => {
		expect(() => defineConfig({ layerZIndex: Number.NaN })).toThrow(
			"layerZIndex",
		);
	});

	it("throws for a non-boolean showDevTools", () => {
		// @ts-expect-error This invalid value is tested at runtime.
		expect(() => defineConfig({ showDevTools: "yes" })).toThrow("showDevTools");
	});
});
