import type { AriaRole, ReactNode } from "react";

/**
 * Synchronous storage used for persistent widget state.
 *
 * State is read while a widget is registered, so async storage cannot be used
 * directly. Load async data before mounting and expose it through a synchronous
 * adapter such as an in memory `Map`.
 *
 * @since 2.0.0
 */
export interface StorageAdapter {
	/** Return the value stored for `key`, or a missing value. */
	get(key: string): unknown;
	/** Store `value` under `key`. */
	set(key: string, value: unknown): void;
	/** Remove `key` when the adapter supports deletion. */
	delete?(key: string): void;
}

/**
 * Common DOM props created for every widget instance.
 *
 * Spread this object onto the widget root to get stable data attributes,
 * standard class names, and configured accessibility props.
 *
 * @example
 * ```ts
 * render: ({ id, widgetProps }) =>
 *   createElement("button", { key: id, ...widgetProps }, "Click me")
 * ```
 */
export interface WidgetProps {
	/** Widget type name used by DevTools and CSS selectors. */
	"data-ism-widget": string;
	/** Stable composite ID for this widget instance. */
	"data-ism-id": string;
	/**
	 * Includes `ism-widget` and a class based on the lowercase widget name.
	 */
	className: string;
	/** ARIA role from {@link WidgetConfig.a11y}. */
	role?: AriaRole;
	/** ARIA label from {@link WidgetConfig.a11y}. */
	"aria-label"?: string;
	/** ID of the hidden description element created by the runtime. */
	"aria-describedby"?: string;
}

/** Accessibility settings shared by every instance of a widget type. */
export interface WidgetA11y<A extends unknown[] = unknown[]> {
	/** ARIA role applied to the widget root. */
	role?: AriaRole;
	/**
	 * Static label or a function that builds a label from widget arguments.
	 *
	 * @example
	 * ```ts
	 * label: "Close dialog"
	 *
	 * label: ([label]) => String(label)
	 * ```
	 */
	label?: string | ((args: A) => string);
	/** Text placed in a hidden element and linked with `aria-describedby`. */
	description?: string;
}

/**
 * Internal props passed through the type erased render boundary.
 *
 * @internal
 */
export interface FrameRenderProps {
	/** Stable widget instance ID. */
	id: string;
	/** State snapshot used for this render. */
	state: unknown;
	/** ID of the runtime that owns the widget. */
	runtimeId: string;
	/** Update widget state with a value or updater function. */
	setState: (updater: unknown) => void;
	/** Arguments passed to the widget call. */
	args: unknown[];
	/** Rendered children for a scoped widget, otherwise `null`. */
	children: ReactNode | null;
	/** Common DOM and accessibility props for the widget root. */
	widgetProps: WidgetProps;
}

/**
 * Typed props passed to a widget render function.
 *
 * @typeParam S Widget state.
 * @typeParam A Widget argument tuple.
 */
export interface WidgetRenderProps<S, A extends unknown[] = unknown[]> {
	/** Stable widget instance ID. */
	id: string;
	/** State snapshot used for this render. */
	state: S;
	/** ID of the runtime that owns the widget. */
	runtimeId?: string;
	/** Update widget state and request another frame. */
	setState: (updater: S | ((prev: S) => S)) => void;
	/** Arguments passed to the widget call. */
	args: A;
	/** Rendered children for a scoped widget, otherwise `null`. */
	children: ReactNode | null;
	/**
	 * Common DOM and accessibility props for the widget root.
	 *
	 * @example
	 * ```ts
	 * render: ({ id, widgetProps }) =>
	 *   createElement("button", { key: id, ...widgetProps }, "Click")
	 * ```
	 */
	widgetProps: WidgetProps;
}

/**
 * Configuration used by {@link defineWidget}.
 *
 * @typeParam S Widget state.
 * @typeParam A Widget argument tuple.
 * @typeParam R Value returned by the widget call.
 *
 * @since 1.0.0
 */
export interface WidgetConfig<S, A extends unknown[] = unknown[], R = void> {
	/**
	 * Unique widget type name.
	 *
	 * It cannot be empty or contain `/`, `#`, or whitespace because those
	 * characters are used when widget IDs are built.
	 */
	name: string;

	/** Initial state copied for each new widget instance. */
	defaultState: S;

	/** Save this widget state through the app storage adapter. */
	persistent?: boolean;

	/** Open a child scope that must later be closed with {@link end}. */
	scoped?: boolean;

	/**
	 * Return the label used to build the widget ID.
	 *
	 * By default, the first argument is used when it is a string. Return
	 * `undefined` for widgets that do not have a label.
	 */
	getLabel?: (...args: A) => string | undefined;

	/**
	 * Render the widget as React output.
	 *
	 * This runs during React rendering, so keep it pure. Spread `widgetProps`
	 * onto the root element to include the standard selectors and ARIA props.
	 */
	render: (props: WidgetRenderProps<S, A>) => ReactNode;

	/**
	 * Return the value produced when this widget is called during a draw pass.
	 * Keep this function free of side effects.
	 */
	getReturnValue: (state: S, ...args: A) => R;

	/**
	 * Clear temporary state after `getReturnValue` reads it.
	 *
	 * This is useful for one shot values such as button clicks.
	 *
	 * @example
	 * ```ts
	 * consumeState: (state) => ({ ...state, clicked: false })
	 * ```
	 */
	consumeState?: (state: S) => S;

	/** Accessibility settings copied into `widgetProps`. */
	a11y?: WidgetA11y<A>;
}

/**
 * Internal widget record created during a draw pass.
 *
 * @internal
 */
export interface FrameEntry {
	/** Stable widget instance ID. */
	id: string;
	/** Widget type name from {@link WidgetConfig.name}. */
	widgetName: string;
	/** Arguments passed to the widget call. */
	args: unknown[];
	/** Whether this entry owns a child scope. */
	scoped: boolean;
	/** Entries recorded inside this widget scope. */
	children: FrameEntry[];
	/** Default state used when the instance is first seen. */
	defaultState: unknown;
	/** State snapshot used by the current React render. */
	renderState: unknown;
	/** Whether this state is saved through the storage adapter. */
	persistent: boolean;
	/** DOM and accessibility props computed during the draw pass. */
	widgetProps: WidgetProps;
	/** Type erased render function created by {@link defineWidget}. */
	renderFn: (props: FrameRenderProps) => ReactNode;
	/** Optional description rendered in a hidden element. */
	a11yDescription?: string;
}
