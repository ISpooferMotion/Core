import type { AriaRole, CSSProperties, ReactNode } from "react";

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
	/** Return whether `key` exists, even when its stored value is `undefined`. */
	has(key: string): boolean;
	/** Return the value stored for an existing `key`. */
	get(key: string): unknown;
	/** Store `value` under `key`. */
	set(key: string, value: unknown): void;
	/** Remove `key`. */
	delete(key: string): void;
	/** Enumerate keys so a complete application namespace can be cleared. */
	keys(): Iterable<string>;
}

/** Storage operation reported through `AppOptions.onStorageError`. */
export type StorageOperation =
	| "has"
	| "get"
	| "set"
	| "delete"
	| "keys"
	| "serialize"
	| "deserialize"
	| "migrate"
	| "validate";

/** Details for a recoverable persistence failure. */
export interface StorageFailure {
	/** Operation that failed. */
	operation: StorageOperation;
	/** Fully namespaced storage key, when the failure applies to one key. */
	key?: string;
	/** Original adapter or persistence-hook failure. */
	error: unknown;
}

/** Per-widget persistence schema and conversion hooks. */
export interface PersistentStateOptions<S> {
	/** Current stored-state schema version. Defaults to `1`. */
	storageVersion?: number;
	/** Reject malformed or stale values after deserialization/migration. */
	validateStoredState?: (value: unknown) => value is S;
	/** Convert a value written by an older schema version. */
	migrateStoredState?: (
		value: unknown,
		fromVersion: number,
		toVersion: number,
	) => S;
	/** Convert application state into a storage-safe payload. */
	serialize?: (state: S) => unknown;
	/** Convert the stored payload before migration/validation. */
	deserialize?: (value: unknown) => unknown;
}

/**
 * Resolved, type-erased persistence hooks used internally by the runtime.
 * @internal
 */
export interface ResolvedPersistenceOptions {
	storageVersion: number;
	validateStoredState?: (value: unknown) => boolean;
	migrateStoredState?: (
		value: unknown,
		fromVersion: number,
		toVersion: number,
	) => unknown;
	serialize?: (state: unknown) => unknown;
	deserialize?: (value: unknown) => unknown;
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
 *   createElement("button", { key: id, type: "button", ...widgetProps }, "Click me")
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
	/** Structural inline styles required by the runtime, when applicable. */
	style?: CSSProperties;
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
export interface WidgetConfig<S, A extends unknown[] = unknown[], R = void>
	extends PersistentStateOptions<S> {
	/**
	 * Unique widget type name.
	 *
	 * Names must match `^[A-Za-z][A-Za-z0-9_-]*$` so generated CSS classes,
	 * diagnostics, and identity metadata remain safe and predictable.
	 */
	name: string;

	/** Initial state copied for each new widget instance. */
	defaultState: S;

	/** Save this widget state through the app storage adapter. */
	persistent?: boolean;

	/**
	 * Persistence schema/conversion fields are inherited from
	 * {@link PersistentStateOptions}. They are used only when `persistent` is true.
	 */

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
	/** Entries recorded inside this widget scope. */
	children: FrameEntry[];
	/** State snapshot used by the current React render. */
	renderState: unknown;
	/** Persistence schema/conversion hooks for this widget instance. */
	persistence: ResolvedPersistenceOptions | null;
	/** DOM and accessibility props computed during the draw pass. */
	widgetProps: WidgetProps;
	/** Type erased render function created by {@link defineWidget}. */
	renderFn: (props: FrameRenderProps) => ReactNode;
	/** Optional description rendered in a hidden element. */
	a11yDescription?: string;
}
