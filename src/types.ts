import type { ReactNode } from "react";

/**
 * Interface for injecting external persistent storage into the engine.
 *
 * @since 2.0.0
 */
export interface StorageAdapter {
	get(key: string): unknown;
	set(key: string, value: unknown): void;
	delete(key: string): void;
}

/**
 * Stable attributes and class names that the library injects into every widget.
 * Widget authors spread this onto their root DOM element to opt in to the
 * styling hook and DevTools identity.
 *
 * @example
 * ```ts
 * render: ({ id, widgetProps }) =>
 *   createElement("button", { key: id, ...widgetProps }, "Click me"),
 * ```
 */
export interface WidgetProps {
	/** The widget type name, e.g. `"Button"`. Used for CSS targeting. */
	"data-ism-widget": string;
	/** The stable composite ID of this instance. */
	"data-ism-id": string;
	/**
	 * Two CSS classes: `ism-widget` (all widgets) and
	 * `ism-{lowercasename}` (type-specific). Override styles by targeting
	 * these in your CSS without touching library code.
	 */
	className: string;
	/** ARIA role, if set via WidgetConfig.a11y.role */
	role?: string;
	/** ARIA label, if set via WidgetConfig.a11y.label */
	"aria-label"?: string;
	/** ARIA description, if set via WidgetConfig.a11y.description */
	"aria-describedby"?: string;
}

/**
 * Accessibility configuration for a widget type.
 * These values are automatically injected into {@link WidgetProps},
 * so widget authors never need to compute them manually.
 */
export interface WidgetA11y<A extends unknown[] = unknown[]> {
	/**
	 * ARIA role for this widget type (e.g. `"button"`, `"slider"`, `"checkbox"`).
	 * Applied to every instance.
	 */
	role?: string;
	/**
	 * ARIA label generator. Can be a static string or a function that receives
	 * the widget's arguments and returns a label string.
	 *
	 * @example
	 * ```ts
	 * // Static
	 * label: "Close dialog"
	 *
	 * // Dynamic from args
	 * label: ([labelArg]) => String(labelArg)
	 * ```
	 */
	label?: string | ((args: A) => string);
	/**
	 * Human-readable description of what this widget does.
	 * Used as `aria-describedby` text.
	 */
	description?: string;
}

/**
 * Internal render props passed at the type-erasure boundary.
 * Used by FrameEntry.renderFn, which bridges to the typed WidgetRenderProps
 * via closures created in defineWidget.
 */
export interface FrameRenderProps {
	/** Stable composite ID for this widget instance */
	id: string;
	/** Current persistent state (type-erased) */
	state: unknown;
	/** Update this widget's persistent state. Accepts a direct value or updater function. */
	setState: (updater: unknown) => void;
	/** Arguments passed to the widget function by the user */
	args: unknown[];
	/** Rendered children for scoped widgets, null otherwise */
	children: ReactNode | null;
	/** Pre-computed styling + ARIA attributes. Spread onto root DOM element. */
	widgetProps: WidgetProps;
}

/**
 * Props received by a widget's render function.
 * Fully typed -- widget authors work with these, never with FrameRenderProps.
 *
 * @typeParam S - The shape of this widget's persistent state
 * @typeParam A - Tuple type of the arguments the widget function accepts
 */
export interface WidgetRenderProps<S, A extends unknown[] = unknown[]> {
	/** Stable composite ID for this widget instance */
	id: string;
	/** Current persistent state */
	state: S;
	/** Update this widget's persistent state. Triggers a re-render. */
	setState: (updater: S | ((prev: S) => S)) => void;
	/** Arguments passed to the widget function by the user */
	args: A;
	/** Rendered children for scoped widgets, null otherwise */
	children: ReactNode | null;
	/**
	 * Pre-computed styling + ARIA attributes. Spread onto your root DOM element
	 * to participate in the CSS hook system and accessibility tree.
	 *
	 * @example
	 * ```ts
	 * render: ({ id, widgetProps }) =>
	 *   createElement("button", { key: id, ...widgetProps }, "Click"),
	 * ```
	 */
	widgetProps: WidgetProps;
}

/**
 * Configuration for defining a new widget type via {@link defineWidget}.
 *
 * @typeParam S - The shape of this widget's persistent state
 * @typeParam A - Tuple type of the arguments the widget function accepts
 * @typeParam R - The return type of the widget function
 *
 * @since 1.0.0
 */
export interface WidgetConfig<S, A extends unknown[] = unknown[], R = void> {
	/**
	 * Unique name for this widget type (e.g., `"Button"`, `"Slider"`).
	 *
	 * Must be non-empty and must not contain `/`, `#`, or whitespace --
	 * these are reserved characters in the ID composition system.
	 */
	name: string;

	/** Initial state for new instances of this widget */
	defaultState: S;

	/** If true, the widget state is persisted across sessions via the StorageAdapter */
	persistent?: boolean;

	/** If true, this widget opens a scope that must be closed with {@link end} */
	scoped?: boolean;

	/**
	 * Extract the label string from the widget's arguments for ID generation.
	 * If omitted, defaults to using the first argument if it's a string.
	 * Return `undefined` for widgets without labels (e.g., Separator).
	 */
	getLabel?: (...args: A) => string | undefined;

	/**
	 * Render this widget to a React element.
	 * Called by the React bridge during the commit phase.
	 *
	 * Access `props.widgetProps` and spread it onto your root element
	 * to participate in the CSS hook and accessibility systems.
	 */
	render: (props: WidgetRenderProps<S, A>) => ReactNode;

	/**
	 * Compute the value returned to the user when they call this widget function.
	 * Called during the draw pass. Must be side-effect free.
	 */
	getReturnValue: (state: S, ...args: A) => R;

	/**
	 * Reset transient state after each frame.
	 * Called once per frame after React commits, for widgets that were rendered.
	 * Use this to clear one-shot event flags (e.g., `clicked` on a Button).
	 *
	 * @example
	 * ```ts
	 * consumeState: (state) => ({ ...state, clicked: false })
	 * ```
	 */
	consumeState?: (state: S) => S;

	/**
	 * Accessibility configuration. Values are automatically injected into
	 * `widgetProps` so widget authors don't need to compute them manually.
	 */
	a11y?: WidgetA11y<A>;
}

/**
 * Internal frame entry produced during the draw pass.
 * Pure data describing what to render, with closures for the React bridge.
 * No direct DOM references.
 *
 * @internal
 */
export interface FrameEntry {
	/** Stable composite ID */
	id: string;
	/** Widget type name (matches WidgetConfig.name) */
	widgetName: string;
	/** Arguments passed by the user */
	args: unknown[];
	/** Whether this widget opens a scope */
	scoped: boolean;
	/** Child entries (populated between scope open and end()) */
	children: FrameEntry[];
	/** Default state for initializing new instances */
	defaultState: unknown;
	/** Whether the state is persisted across sessions */
	persistent: boolean;
	/**
	 * Pre-computed widgetProps for this entry.
	 * Computed once per frame in defineWidget and cached here.
	 */
	widgetProps: WidgetProps;
	/**
	 * Render closure created by defineWidget.
	 * Bridges from type-erased FrameRenderProps to the typed widget render function.
	 */
	renderFn: (props: FrameRenderProps) => ReactNode;
	/**
	 * Optional closure to reset transient state after each frame.
	 * Created by defineWidget from WidgetConfig.consumeState.
	 */
	consumeStateFn?: (state: unknown) => unknown;
}
