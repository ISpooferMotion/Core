/**
 * Configuration options for @ispoofermotion/core
 *
 * @since 3.2.0
 */
export interface IsmConfig {
	/**
	 * Base z-index applied to non-default layers (modals, tooltips, etc.).
	 * Defaults to 100.
	 */
	layerZIndex?: number;

	/**
	 * Automatically mount the dockable DevTools UI over your app.
	 * Defaults to false.
	 */
	showDevTools?: boolean;
}

/**
 * Type helper for defining a configuration.
 *
 * @param config The configuration object
 * @returns The configuration object
 *
 * @since 3.2.0
 */
export function defineConfig(config: IsmConfig): IsmConfig {
	return config;
}
