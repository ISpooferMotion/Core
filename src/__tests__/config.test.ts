import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_LAYER_Z_INDEX,
	DEFAULT_SHOW_DEV_TOOLS,
	defineConfig,
} from "../config";

// schema.json lives at the repo root and is hand-maintained rather than
// generated from config.ts. This test is the drift detector: if someone
// changes DEFAULT_LAYER_Z_INDEX / DEFAULT_SHOW_DEV_TOOLS in config.ts
// without updating schema.json's "default" fields (and its description
// prose) to match, this fails instead of the two silently diverging.
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
		// @ts-expect-error  intentionally invalid at runtime
		expect(() => defineConfig({ showDevTools: "yes" })).toThrow("showDevTools");
	});
});
