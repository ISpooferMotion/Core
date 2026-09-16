export type LayerMode = "root" | "viewport";

export interface IsmConfig {
	layerZIndex?: number;

	showDevTools?: boolean;

	strictIds?: boolean;

	strictRuntime?: boolean;

	stateRetentionFrames?: number;

	layerMode?: LayerMode;
}

export const DEFAULT_LAYER_Z_INDEX = 100;

export const DEFAULT_SHOW_DEV_TOOLS = false;

export const DEFAULT_STRICT_IDS = false;

export const DEFAULT_STRICT_RUNTIME = false;

export const DEFAULT_STATE_RETENTION_FRAMES = 1;

export const DEFAULT_LAYER_MODE: LayerMode = "root";

export const ISM_CONFIG_KEYS = [
	"layerZIndex",
	"layerMode",
	"showDevTools",
	"strictIds",
	"strictRuntime",
	"stateRetentionFrames",
] as const satisfies readonly (keyof IsmConfig)[];

export const DEFAULT_ISM_CONFIG: Readonly<Required<IsmConfig>> = Object.freeze({
	layerZIndex: DEFAULT_LAYER_Z_INDEX,
	layerMode: DEFAULT_LAYER_MODE,
	showDevTools: DEFAULT_SHOW_DEV_TOOLS,
	strictIds: DEFAULT_STRICT_IDS,
	strictRuntime: DEFAULT_STRICT_RUNTIME,
	stateRetentionFrames: DEFAULT_STATE_RETENTION_FRAMES,
});

interface ResolvedIsmConfig {
	layerZIndex: number;
	showDevTools: boolean;
	strictIds: boolean;
	strictRuntime: boolean;
	stateRetentionFrames: number;
	layerMode: LayerMode;
}

export function resolveConfig(config: IsmConfig = {}): ResolvedIsmConfig {
	if (
		config.layerZIndex !== undefined &&
		(typeof config.layerZIndex !== "number" ||
			!Number.isFinite(config.layerZIndex))
	) {
		throw new Error(
			`[ism] Configuration: "layerZIndex" must be a finite number, got ${JSON.stringify(config.layerZIndex)}.`,
		);
	}
	if (
		config.showDevTools !== undefined &&
		typeof config.showDevTools !== "boolean"
	) {
		throw new Error(
			`[ism] Configuration: "showDevTools" must be a boolean, got ${JSON.stringify(config.showDevTools)}.`,
		);
	}
	if (config.strictIds !== undefined && typeof config.strictIds !== "boolean") {
		throw new Error(
			`[ism] Configuration: "strictIds" must be a boolean, got ${JSON.stringify(config.strictIds)}.`,
		);
	}
	if (
		config.strictRuntime !== undefined &&
		typeof config.strictRuntime !== "boolean"
	) {
		throw new Error(
			`[ism] Configuration: "strictRuntime" must be a boolean, got ${JSON.stringify(config.strictRuntime)}.`,
		);
	}
	if (
		config.stateRetentionFrames !== undefined &&
		(!Number.isSafeInteger(config.stateRetentionFrames) ||
			config.stateRetentionFrames < 0)
	) {
		throw new Error(
			`[ism] Configuration: "stateRetentionFrames" must be a non-negative safe integer, got ${JSON.stringify(config.stateRetentionFrames)}.`,
		);
	}
	if (
		config.layerMode !== undefined &&
		config.layerMode !== "root" &&
		config.layerMode !== "viewport"
	) {
		throw new Error(
			`[ism] Configuration: "layerMode" must be "root" or "viewport", got ${JSON.stringify(config.layerMode)}.`,
		);
	}
	return {
		layerZIndex: config.layerZIndex ?? DEFAULT_LAYER_Z_INDEX,
		showDevTools: config.showDevTools ?? DEFAULT_SHOW_DEV_TOOLS,
		strictIds: config.strictIds ?? DEFAULT_STRICT_IDS,
		strictRuntime: config.strictRuntime ?? DEFAULT_STRICT_RUNTIME,
		stateRetentionFrames:
			config.stateRetentionFrames ?? DEFAULT_STATE_RETENTION_FRAMES,
		layerMode: config.layerMode ?? DEFAULT_LAYER_MODE,
	};
}

export function defineConfig(config: IsmConfig): IsmConfig {
	resolveConfig(config);
	return config;
}
