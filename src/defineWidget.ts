import * as errors from "./errors";
import { extractDisplayLabel, getActiveRuntime } from "./runtime";
import type {
	ResolvedPersistenceOptions,
	WidgetA11y,
	WidgetConfig,
	WidgetProps,
	WidgetRenderProps,
} from "./types";

// Widget name rules

const VALID_WIDGET_NAME = /^[A-Za-z][A-Za-z0-9_-]*$/;

function validateWidgetName(name: string): void {
	if (!VALID_WIDGET_NAME.test(name)) {
		throw errors.createISMError(
			"ISM_INVALID_WIDGET_NAME",
			errors.invalidWidgetName(
				name,
				"Name must start with an ASCII letter and contain only letters, digits, underscores, or hyphens.",
			),
			{ details: { name } },
		);
	}
}

function validateDefaultState<S>(name: string, defaultState: S): void {
	if (typeof defaultState === "function") {
		throw errors.createISMError(
			"ISM_INVALID_DEFAULT_STATE",
			errors.invalidDefaultState(name),
			{ details: { name } },
		);
	}
	try {
		assertStructuredState(defaultState);
		structuredClone(defaultState);
	} catch (err) {
		throw errors.createISMError(
			"ISM_DEFAULT_STATE_NOT_CLONEABLE",
			errors.defaultStateNotCloneable(name, errors.getErrorMessage(err)),
			{ cause: err, details: { name } },
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

function resolvePersistenceOptions<S, A extends unknown[], R>(
	config: WidgetConfig<S, A, R>,
): ResolvedPersistenceOptions | null {
	const hasPersistenceHooks =
		config.storageVersion !== undefined ||
		config.validateStoredState !== undefined ||
		config.migrateStoredState !== undefined ||
		config.serialize !== undefined ||
		config.deserialize !== undefined;

	if (!config.persistent) {
		if (hasPersistenceHooks) {
			throw new Error(
				`[ism] Widget "${config.name}" configures persistence hooks but persistent is not true.`,
			);
		}
		return null;
	}

	const storageVersion = config.storageVersion ?? 1;
	if (!Number.isSafeInteger(storageVersion) || storageVersion < 1) {
		throw new Error(
			`[ism] Widget "${config.name}" storageVersion must be a positive safe integer.`,
		);
	}

	return {
		storageVersion,
		...(config.validateStoredState
			? {
					validateStoredState: (value: unknown) =>
						config.validateStoredState?.(value) ?? false,
				}
			: {}),
		...(config.migrateStoredState
			? {
					migrateStoredState: (
						value: unknown,
						fromVersion: number,
						toVersion: number,
					) => config.migrateStoredState?.(value, fromVersion, toVersion),
				}
			: {}),
		...(config.serialize
			? { serialize: (state: unknown) => config.serialize?.(state as S) }
			: {}),
		...(config.deserialize ? { deserialize: config.deserialize } : {}),
	};
}

// Shared widget props

function populateWidgetProps<A extends unknown[]>(
	props: WidgetProps,
	widgetName: string,
	slug: string,
	id: string,
	a11y: WidgetA11y<A> | undefined,
	args: A,
	descriptionId: string | undefined,
	inNamedLayer: boolean,
): void {
	props["data-ism-widget"] = widgetName;
	props["data-ism-id"] = id;
	props.className = `ism-widget ism-${slug}`;
	if (inNamedLayer) {
		props.style = { pointerEvents: "auto" };
	} else {
		delete props.style;
	}

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
 * Define a widget type and return the function used during a draw pass.
 *
 * Every call creates a frame entry with a stable ID, reads the current state,
 * builds the common DOM props, and returns the value from `getReturnValue`.
 * Scoped widgets stay open until {@link end} is called.
 *
 * @typeParam S Widget state.
 * @typeParam A Widget argument tuple.
 * @typeParam R Value returned by the widget call.
 *
 * @param config Widget definition.
 * @returns A callable widget function.
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * const Button = defineWidget<{ clicked: boolean }, [label: string], boolean>({
 *   name: "Button",
 *   defaultState: { clicked: false },
 *   a11y: { role: "button", label: ([label]) => label },
 *   render: ({ id, args, setState, widgetProps }) =>
 *     createElement(
 *       "button",
 *       {
 *         key: id,
 *         type: "button",
 *         ...widgetProps,
 *         onClick: () => setState({ clicked: true }),
 *       },
 *       args[0],
 *     ),
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
	const persistence = resolvePersistenceOptions(config);

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
			throw errors.createISMError(
				"ISM_WIDGET_OUTSIDE_DRAW",
				errors.widgetOutsideDraw(name, label),
				{ details: { name, ...(label === undefined ? {} : { label }) } },
			);
		}

		const label = getLabel(...args);
		const id = runtime.buildId(name, label);

		const state = runtime.getState<S>(id, defaultState, persistence ?? false);

		const entry = runtime.acquireFrameEntry();
		entry.id = id;
		entry.widgetName = name;
		entry.args = args as unknown[];
		entry.renderState = state;
		entry.persistence = persistence;

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
			runtime.getActiveLayer() !== "default",
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
			runtime.consumeState(id, state, consumeStateFn, persistence ?? false);
		}

		return returnValue;
	};
}
