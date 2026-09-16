import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
	DEFAULT_ISM_CONFIG,
	DEFAULT_LAYER_MODE,
	DEFAULT_LAYER_Z_INDEX,
	DEFAULT_SHOW_DEV_TOOLS,
	DEFAULT_STATE_RETENTION_FRAMES,
	DEFAULT_STRICT_IDS,
	DEFAULT_STRICT_RUNTIME,
	defineConfig,
	ISM_CONFIG_KEYS,
} from "../config";
import { CORE_VERSION } from "../version";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(here, "..", "..");
const schemaPath = join(projectRoot, "schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const packageJson = JSON.parse(
	readFileSync(join(projectRoot, "package.json"), "utf8"),
) as { version: string; exports: Record<string, unknown> };

describe("package metadata stays in sync", () => {
	it("matches the embedded runtime version and schema example", () => {
		expect(CORE_VERSION).toBe(packageJson.version);
		expect(schema.properties.$schema.examples).toContain(
			`https://unpkg.com/@ispoofermotion/core@${packageJson.version}/schema.json`,
		);
	});

	it("exports the schema and every branded config icon asset", () => {
		const exportedFiles = {
			"./schema.json": "schema.json",
			"./assets/ism-config.png": "assets/ism-config.png",
			"./assets/ism-config-dark.png": "assets/ism-config-dark.png",
			"./assets/ism-config-light.png": "assets/ism-config-light.png",
		} as const;

		for (const [exportPath, relativePath] of Object.entries(exportedFiles)) {
			expect(packageJson.exports[exportPath]).toBe(`./${relativePath}`);
			expect(existsSync(join(projectRoot, relativePath))).toBe(true);
		}
	});
});

describe("schema.json stays in sync with config.ts defaults", () => {
	it("schema properties cover every canonical config key", () => {
		const schemaKeys = Object.keys(schema.properties).filter(
			(key) => key !== "$schema",
		);
		expect(schemaKeys.sort()).toEqual([...ISM_CONFIG_KEYS].sort());
		expect(Object.keys(DEFAULT_ISM_CONFIG).sort()).toEqual(
			[...ISM_CONFIG_KEYS].sort(),
		);
	});
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

	it("stateRetentionFrames matches the runtime safe-integer contract", () => {
		expect(schema.properties.stateRetentionFrames.default).toBe(
			DEFAULT_STATE_RETENTION_FRAMES,
		);
		expect(schema.properties.stateRetentionFrames.minimum).toBe(0);
		expect(schema.properties.stateRetentionFrames.maximum).toBe(
			Number.MAX_SAFE_INTEGER,
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
		expect(() => defineConfig({ showDevTools: "yes" as never })).toThrow(
			"showDevTools",
		);
	});

	it("throws for a non-boolean strictIds", () => {
		expect(() => defineConfig({ strictIds: "yes" as never })).toThrow(
			"strictIds",
		);
	});

	it("throws for a non-boolean strictRuntime", () => {
		expect(() => defineConfig({ strictRuntime: "yes" as never })).toThrow(
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
		expect(() => defineConfig({ layerMode: "document" as never })).toThrow(
			"layerMode",
		);
	});
});
