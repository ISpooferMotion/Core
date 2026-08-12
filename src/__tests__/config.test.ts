import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_LAYER_MODE,
	DEFAULT_LAYER_Z_INDEX,
	DEFAULT_SHOW_DEV_TOOLS,
	DEFAULT_STATE_RETENTION_FRAMES,
	DEFAULT_STRICT_IDS,
	DEFAULT_STRICT_RUNTIME,
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

	it("strictIds default matches DEFAULT_STRICT_IDS", () => {
		expect(schema.properties.strictIds.default).toBe(DEFAULT_STRICT_IDS);
	});

	it("strictRuntime default matches DEFAULT_STRICT_RUNTIME", () => {
		expect(schema.properties.strictRuntime.default).toBe(
			DEFAULT_STRICT_RUNTIME,
		);
	});

	it("stateRetentionFrames default matches DEFAULT_STATE_RETENTION_FRAMES", () => {
		expect(schema.properties.stateRetentionFrames.default).toBe(
			DEFAULT_STATE_RETENTION_FRAMES,
		);
	});

	it("layerMode default matches DEFAULT_LAYER_MODE", () => {
		expect(schema.properties.layerMode.default).toBe(DEFAULT_LAYER_MODE);
		expect(schema.properties.layerMode.enum).toEqual(["root", "viewport"]);
	});
});

describe("defineConfig", () => {
	it("returns a valid config unchanged", () => {
		const config = {
			layerZIndex: 200,
			layerMode: "viewport" as const,
			showDevTools: true,
			strictIds: true,
			strictRuntime: true,
			stateRetentionFrames: 3,
		};
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

	it("throws for a non-boolean strictIds", () => {
		// @ts-expect-error This invalid value is tested at runtime.
		expect(() => defineConfig({ strictIds: "yes" })).toThrow("strictIds");
	});

	it("throws for a non-boolean strictRuntime", () => {
		// @ts-expect-error This invalid value is tested at runtime.
		expect(() => defineConfig({ strictRuntime: "yes" })).toThrow(
			"strictRuntime",
		);
	});

	it("throws for invalid stateRetentionFrames", () => {
		expect(() => defineConfig({ stateRetentionFrames: -1 })).toThrow(
			"stateRetentionFrames",
		);
		expect(() => defineConfig({ stateRetentionFrames: 1.5 })).toThrow(
			"stateRetentionFrames",
		);
	});

	it("throws for an invalid layerMode", () => {
		// @ts-expect-error This invalid value is tested at runtime.
		expect(() => defineConfig({ layerMode: "document" })).toThrow("layerMode");
	});
});
