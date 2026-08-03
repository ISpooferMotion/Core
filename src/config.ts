/**
 * Configuration options for @ispoofermotion/core
 *
 * @since 3.2.0
 */
export interface IsmConfig {
	/**
	 * Base z-index applied to non-default layers (modals, tooltips, etc.).
	 * Defaults to {@link DEFAULT_LAYER_Z_INDEX}.
	 */
	layerZIndex?: number;

	/**
	 * Automatically mount the dockable DevTools UI over your app.
	 * Defaults to {@link DEFAULT_SHOW_DEV_TOOLS}.
	 */
	showDevTools?: boolean;
}

/**
 * Default value for {@link IsmConfig.layerZIndex}.
 * Single source of truth  consumed by both `createApp` (runtime fallback)
 * and the `ism-core init` CLI scaffold, so the two never drift apart.
 *
 * @since 3.3.0
 */
export const DEFAULT_LAYER_Z_INDEX = 100;

/**
 * Default value for {@link IsmConfig.showDevTools}.
 *
 * @since 3.3.0
 */
export const DEFAULT_SHOW_DEV_TOOLS = false;

interface ResolvedIsmConfig {
	layerZIndex: number;
	showDevTools: boolean;
}

/** Resolve and validate runtime configuration. @internal */
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
	return {
		layerZIndex: config.layerZIndex ?? DEFAULT_LAYER_Z_INDEX,
		showDevTools: config.showDevTools ?? DEFAULT_SHOW_DEV_TOOLS,
	};
}

/**
 * Type helper for defining a configuration.
 *
 * Performs light runtime validation so invalid values fail at the call site
 * rather than reaching rendering code.
 *
 * @param config The configuration object.
 * @returns The configuration object, unchanged.
 * @throws {Error} If `layerZIndex` is not finite or `showDevTools` is not boolean.
 *
 * @since 3.2.0
 */
export function defineConfig(config: IsmConfig): IsmConfig {
	resolveConfig(config);
	return config;
}
