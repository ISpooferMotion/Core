import * as errors from "./errors";
import { extractDisplayLabel, getActiveRuntime } from "./runtime";
import type {
	WidgetA11y,
	WidgetConfig,
	WidgetProps,
	WidgetRenderProps,
} from "./types";

// --- Name validation ---

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
	try {
		assertStructuredState(defaultState);
		structuredClone(defaultState);
	} catch (err) {
		throw new Error(
			errors.defaultStateNotCloneable(name, errors.getErrorMessage(err)),
		);
	}
}

function assertStructuredState(
	value: unknown,
	path = "defaultState",
	seen = new WeakSet<object>(),
): void {
	if (value === null || typeof value !== "object") return;
	if (seen.has(value)) return;
	seen.add(value);

	const allowed = [
		Object.prototype,
		Array.prototype,
		Date.prototype,
		Map.prototype,
		Set.prototype,
		RegExp.prototype,
	];
	const proto = Object.getPrototypeOf(value);
	if (!allowed.includes(proto)) {
		throw new Error(`${path} uses an unsupported custom prototype.`);
	}

	if (value instanceof Map) {
		for (const [key, entry] of value) {
			assertStructuredState(key, `${path}.<key>`, seen);
			assertStructuredState(entry, `${path}.<value>`, seen);
		}
	} else if (value instanceof Set) {
		for (const entry of value) {
			assertStructuredState(entry, `${path}.<value>`, seen);
		}
	} else if (Array.isArray(value)) {
		for (const [index, entry] of value.entries()) {
			assertStructuredState(entry, `${path}[${index}]`, seen);
		}
	} else {
		for (const [key, entry] of Object.entries(value)) {
			assertStructuredState(entry, `${path}.${key}`, seen);
		}
	}
}

// --- widgetProps factory ---

function populateWidgetProps<A extends unknown[]>(
	props: WidgetProps,
	widgetName: string,
	slug: string,
	id: string,
	a11y: WidgetA11y<A> | undefined,
	args: A,
	descriptionId: string | undefined,
): void {
	props["data-ism-widget"] = widgetName;
	props["data-ism-id"] = id;
	props.className = `ism-widget ism-${slug}`;

	if (a11y?.role) {
		props.role = a11y.role;
	} else {
		delete props.role;
	}

	if (a11y?.label) {
		props["aria-label"] =
			typeof a11y.label === "function" ? a11y.label(args) : a11y.label;
	} else {
		delete props["aria-label"];
	}

	if (a11y?.description && descriptionId) {
		props["aria-describedby"] = descriptionId;
	} else {
		delete props["aria-describedby"];
	}
}

/**
 * Define a new widget type and return its callable function.
 *
 * This is the **only** registration path for widgets. Every widget in the
 * system  including those in this library  goes through this function.
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

	validateWidgetName(name);
	validateDefaultState(name, defaultState);

	const getLabel: (...args: A) => string | undefined =
		config.getLabel ??
		((...args: A) => {
			const first: unknown = args[0];
			return typeof first === "string" ? first : undefined;
		});

	const consumeStateFn = consumeState
		? (state: unknown): unknown => consumeState(state as S)
		: undefined;

	const slug = name.toLowerCase();

	const renderFn = (props: {
		id: string;
		state: unknown;
		setState: (updater: unknown) => void;
		runtimeId: string;
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
			runtimeId: props.runtimeId,
			setState: typedSetState,
			args: props.args as unknown as A,
			children: props.children,
			widgetProps: props.widgetProps,
		} satisfies WidgetRenderProps<S, A>);
	};

	return (...args: A): R => {
		const runtime = getActiveRuntime();

		if (!runtime.isDrawing()) {
			const label = getLabel(...args);
			throw new Error(errors.widgetOutsideDraw(name, label));
		}

		const label = getLabel(...args);
		const id = runtime.buildId(name, label);

		const state = runtime.getState<S>(
			id,
			defaultState,
			config.persistent ?? false,
		);

		const entry = runtime.acquireFrameEntry();
		entry.id = id;
		entry.widgetName = name;
		entry.args = args as unknown[];
		entry.scoped = scoped;
		entry.defaultState = defaultState;
		entry.renderState = state;
		entry.persistent = config.persistent ?? false;

		const descriptionId = a11y?.description
			? runtime.getDomId("description", id)
			: undefined;

		populateWidgetProps(
			entry.widgetProps,
			name,
			slug,
			id,
			a11y,
			args,
			descriptionId,
		);

		entry.renderFn = renderFn;

		if (a11y?.description) {
			entry.a11yDescription = a11y.description;
		} else {
			delete entry.a11yDescription;
		}

		runtime.getCurrentParentChildren().push(entry);

		if (scoped) {
			const displayLabel = label ? extractDisplayLabel(label) : name;
			runtime.pushScope(id, displayLabel, entry);
		}

		const returnValue = getReturnValue(state, ...args);

		if (consumeStateFn) {
			runtime.consumeState(
				id,
				state,
				consumeStateFn,
				config.persistent ?? false,
			);
		}

		return returnValue;
	};
}
