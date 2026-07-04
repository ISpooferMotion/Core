import * as errors from "./errors";
import { extractDisplayLabel, getActiveRuntime } from "./runtime";
import type {
	WidgetA11y,
	WidgetConfig,
	WidgetProps,
	WidgetRenderProps,
} from "./types";

/// Name validation \\\

const INVALID_NAME_CHARS = /[/#\s]/;

function validateWidgetName(name: string): void {
	if (!name || name.length === 0) {
		throw new Error(errors.invalidWidgetName(name, "Name is empty."));
	}
	if (INVALID_NAME_CHARS.test(name)) {
		throw new Error(
			errors.invalidWidgetName(
				name,
				"Name contains a reserved character ('/', '#', or whitespace).",
			),
		);
	}
}

function validateDefaultState<S>(name: string, defaultState: S): void {
	if (typeof defaultState === "function") {
		throw new Error(errors.invalidDefaultState(name));
	}
}

/// widgetProps factory \\\

function buildWidgetProps<A extends unknown[]>(
	widgetName: string,
	id: string,
	a11y: WidgetA11y<A> | undefined,
	args: A,
): WidgetProps {
	const slug = widgetName.toLowerCase();
	const props: WidgetProps = {
		"data-ism-widget": widgetName,
		"data-ism-id": id,
		className: `ism-widget ism-${slug}`,
	};

	if (a11y) {
		if (a11y.role) props.role = a11y.role;
		if (a11y.label) {
			props["aria-label"] =
				typeof a11y.label === "function" ? a11y.label(args) : a11y.label;
		}
		if (a11y.description) {
			// Store description text in a data attribute so makeInteractive can
			// wire up aria-describedby with a real DOM element if needed.
			// Widget authors who want full describedby support should use makeInteractive().
			props["aria-describedby"] = `ism-desc-${id}`;
		}
	}

	return props;
}

/**
 * Define a new widget type and return its callable function.
 *
 * This is the **only** registration path for widgets. Every widget in the
 * system -- including those in this library -- goes through this function.
 * Do not call runtime internals directly.
 *
 * The returned function is what end users call inside their draw function
 * (e.g., `Button("Click me")`, `Slider("Volume", 0, 100)`).
 *
 * Each call during a draw pass:
 * 1. Resolves a stable composite ID from the label + ID stack
 * 2. Looks up or initializes persistent state
 * 3. Builds `widgetProps` (styling hook + ARIA attributes)
 * 4. Registers a FrameEntry in the current frame buffer
 * 5. Returns the value computed by `getReturnValue`
 *
 * @typeParam S - The shape of this widget's persistent state
 * @typeParam A - Tuple type of the arguments the widget function accepts
 * @typeParam R - The return type of the widget function
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * const Button = defineWidget<{ clicked: boolean }, [label: string], boolean>({
 *   name: "Button",
 *   defaultState: { clicked: false },
 *   a11y: { role: "button", label: ([label]) => label },
 *   render: ({ id, state, setState, args, widgetProps }) => {
 *     const [label] = args;
 *     return createElement("button", {
 *       key: id,
 *       ...widgetProps,
 *       tabIndex: 0,
 *       onClick: () => setState({ clicked: true }),
 *     }, extractDisplayLabel(label));
 *   },
 *   getReturnValue: (state) => state.clicked,
 *   consumeState: (state) => ({ ...state, clicked: false }),
 * });
 * ```
 */
export function defineWidget<S, A extends unknown[], R>(
	config: WidgetConfig<S, A, R>,
): (...args: A) => R {
	const {
		name,
		defaultState,
		scoped = false,
		render,
		getReturnValue,
		consumeState,
		a11y,
	} = config;

	// Validate at definition time, not call time
	validateWidgetName(name);
	validateDefaultState(name, defaultState);

	// Resolve the label extraction strategy.
	// Default: use the first argument if it's a string.
	const getLabel: (...args: A) => string | undefined =
		config.getLabel ??
		((...args: A) => {
			const first: unknown = args[0];
			return typeof first === "string" ? first : undefined;
		});

	// Build the optional consume closure
	const consumeStateFn = consumeState
		? (state: unknown): unknown => consumeState(state as S)
		: undefined;

	// Return the callable widget function
	return (...args: A): R => {
		const runtime = getActiveRuntime();

		// Guard: must be inside a draw frame
		if (!runtime.isDrawing()) {
			const label = getLabel(...args);
			throw new Error(errors.widgetOutsideDraw(name, label));
		}

		// Extract label and build composite ID
		const label = getLabel(...args);
		const id = runtime.buildId(name, label);

		// Look up or initialize persistent state
		const state = runtime.getState<S>(id, defaultState);

		// Build widgetProps (computed once per frame per instance)
		const widgetProps = buildWidgetProps<A>(name, id, a11y, args);

		// Build the render closure that bridges from type-erased FrameRenderProps
		// to the fully-typed WidgetRenderProps.
		const renderFn = (props: {
			id: string;
			state: unknown;
			setState: (updater: unknown) => void;
			args: unknown[];
			children: import("react").ReactNode | null;
			widgetProps: WidgetProps;
		}) => {
			const typedSetState = (updater: S | ((prev: S) => S)) => {
				props.setState(updater);
			};

			return render({
				id: props.id,
				state: props.state as S,
				setState: typedSetState,
				args: props.args as unknown as A,
				children: props.children,
				widgetProps: props.widgetProps,
			} satisfies WidgetRenderProps<S, A>);
		};

		// Acquire frame entry from the zero-allocation pool
		const entry = runtime.acquireFrameEntry();
		entry.id = id;
		entry.widgetName = name;
		entry.args = args as unknown[];
		entry.scoped = scoped;
		entry.defaultState = defaultState;
		entry.persistent = config.persistent ?? false;
		entry.widgetProps = widgetProps;
		entry.renderFn = renderFn;
		entry.consumeStateFn = consumeStateFn;

		// Register in the current parent's children (scope-aware)
		runtime.getCurrentParentChildren().push(entry);

		// If this is a scoped widget, push it onto the scope stack.
		// All subsequent widget calls will become children of this entry
		// until end() is called.
		if (scoped) {
			const displayLabel = label ? extractDisplayLabel(label) : name;
			runtime.pushScope(id, displayLabel, entry);
		}

		// Compute and return the user-facing value
		return getReturnValue(state, ...args);
	};
}
