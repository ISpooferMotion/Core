/**
 * Runtime configuration for @ispoofermotion/core.
 *
 * @since 3.2.0
 */
export interface IsmConfig {
	/**
	 * Base z index used by named layers such as modals and tooltips.
	 * Defaults to {@link DEFAULT_LAYER_Z_INDEX}.
	 */
	layerZIndex?: number;

	/**
	 * Mount the built in DevTools widget with the app.
	 * Defaults to {@link DEFAULT_SHOW_DEV_TOOLS}.
	 */
	showDevTools?: boolean;
}

/**
 * Default value for {@link IsmConfig.layerZIndex}.
 * The runtime and CLI scaffold both use this constant.
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
 * Validate a configuration object and return it unchanged.
 *
 * @param config Configuration to validate.
 * @returns The same configuration object.
 * @throws {Error} When a value has the wrong type or is not finite.
 *
 * @since 3.2.0
 */
export function defineConfig(config: IsmConfig): IsmConfig {
	resolveConfig(config);
	return config;
}
