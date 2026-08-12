const PREFIX = "[ism]";

/** Stable machine-readable diagnostic/error codes. */
export type ISMErrorCode =
	| "ISM_WIDGET_OUTSIDE_DRAW"
	| "ISM_END_WITHOUT_SCOPE"
	| "ISM_UNCLOSED_SCOPES"
	| "ISM_DUPLICATE_ID"
	| "ISM_DUPLICATE_ID_STRICT"
	| "ISM_END_OUTSIDE_DRAW"
	| "ISM_ID_STACK_OUTSIDE_DRAW"
	| "ISM_POP_ID_EMPTY"
	| "ISM_INVALID_WIDGET_NAME"
	| "ISM_INVALID_DEFAULT_STATE"
	| "ISM_NO_ACTIVE_RUNTIME"
	| "ISM_UNBALANCED_CONTEXT"
	| "ISM_POP_DEFAULT_LAYER"
	| "ISM_DEFAULT_STATE_NOT_CLONEABLE"
	| "ISM_DEFAULT_STATE_CLONE_FAILURE"
	| "ISM_MEMO_UNBALANCED"
	| "ISM_REACT_CONTEXT_IN_MEMO"
	| "ISM_UNBALANCED_ID_STACK"
	| "ISM_UNBALANCED_LAYER_STACK"
	| "ISM_FRAME_TRANSACTION"
	| "ISM_STORAGE_FAILURE"
	| "ISM_DRAW_ERROR"
	| "ISM_WIDGET_RENDER_ERROR"
	| "ISM_CROSS_RUNTIME_ID_COLLISION"
	| "ISM_DIAGNOSTIC_SINK_FAILURE";

/** Severity emitted through the diagnostics sink. */
export type DiagnosticLevel = "debug" | "warning" | "error";

/** Structured runtime diagnostic suitable for logging or telemetry. */
export interface ISMDiagnostic {
	code: ISMErrorCode;
	level: DiagnosticLevel;
	message: string;
	details?: Readonly<Record<string, unknown>>;
	cause?: unknown;
	runtimeId?: string;
}

/** Consumer-defined destination for structured diagnostics. */
export type DiagnosticSink = (diagnostic: ISMDiagnostic) => void;

/** Error with a stable code and optional structured details. */
export class ISMError extends Error {
	readonly code: ISMErrorCode;
	readonly details?: Readonly<Record<string, unknown>>;

	constructor(
		code: ISMErrorCode,
		message: string,
		options: {
			cause?: unknown;
			details?: Readonly<Record<string, unknown>>;
		} = {},
	) {
		super(
			message,
			options.cause === undefined ? undefined : { cause: options.cause },
		);
		this.name = "ISMError";
		this.code = code;
		if (options.details) this.details = options.details;
	}
}

/** Create a coded error without losing the existing human-readable message. */
export function createISMError(
	code: ISMErrorCode,
	message: string,
	options?: {
		cause?: unknown;
		details?: Readonly<Record<string, unknown>>;
	},
): ISMError {
	return new ISMError(code, message, options);
}

/** Build a structured diagnostic. */
export function createDiagnostic(
	code: ISMErrorCode,
	level: DiagnosticLevel,
	message: string,
	options: {
		cause?: unknown;
		details?: Readonly<Record<string, unknown>>;
		runtimeId?: string;
	} = {},
): ISMDiagnostic {
	return {
		code,
		level,
		message,
		...(options.details ? { details: options.details } : {}),
		...(options.cause !== undefined ? { cause: options.cause } : {}),
		...(options.runtimeId ? { runtimeId: options.runtimeId } : {}),
	};
}

/** Deliver a diagnostic, falling back to the console when no sink exists. */
export function emitDiagnostic(
	sink: DiagnosticSink | null | undefined,
	diagnostic: ISMDiagnostic,
): void {
	if (sink) {
		try {
			sink(diagnostic);
			return;
		} catch (error) {
			console.error(
				`${PREFIX} [ISM_DIAGNOSTIC_SINK_FAILURE] Diagnostic sink threw while handling ${diagnostic.code}.`,
				error,
			);
		}
	}

	const label = `${PREFIX} [${diagnostic.code}] ${diagnostic.message}`;
	if (diagnostic.level === "debug")
		console.debug(label, diagnostic.details ?? "");
	else if (diagnostic.level === "warning")
		console.warn(label, diagnostic.details ?? "", diagnostic.cause ?? "");
	else console.error(label, diagnostic.details ?? "", diagnostic.cause ?? "");
}

/** Convert any caught value into a readable error message. */
export function getErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/** Return a stable code from a caught error when available. */
export function getErrorCode(
	error: unknown,
	fallback: ISMErrorCode,
): ISMErrorCode {
	return error instanceof ISMError ? error.code : fallback;
}

/** A widget was called outside a draw pass. */
export function widgetOutsideDraw(
	widgetName: string,
	label: string | undefined,
): string {
	const call = label ? `${widgetName}("${label}")` : `${widgetName}()`;
	return (
		`${PREFIX} ${call} was called outside of a draw function. ` +
		"Widgets can only be called inside the function you pass to createApp()."
	);
}

/** `end` was called without an open scope. */
export function endWithoutScope(): string {
	return (
		`${PREFIX} end() was called but there's no open section to close. ` +
		"Make sure every scoped widget (like Collapsing or Window) has exactly one matching end()."
	);
}

/** A frame finished with scopes still open. */
export function unclosedScopes(names: string[]): string {
	const list = names.map((n) => `'${n}'`).join(", ");
	return (
		`${PREFIX} Frame ended with ${names.length} unclosed section(s): ${list}. ` +
		"Add an end() call after each section's content."
	);
}

/** Two widgets produced the same base ID in one scope. */
export function duplicateId(widgetName: string, displayLabel: string): string {
	return (
		`${PREFIX} Two widgets with label '${displayLabel}' in the same scope. ` +
		"They'll work, but consider adding ##unique_id to tell them apart. " +
		`Example: ${widgetName}("${displayLabel}##1")`
	);
}

/** Strict ID mode rejected a duplicate logical widget identity. */
export function duplicateIdStrict(
	widgetName: string,
	displayLabel: string,
): string {
	return (
		`${PREFIX} strictIds rejected duplicate widget identity '${displayLabel}' for ${widgetName}. ` +
		"Give repeated widgets stable unique identity with pushId()/withId() or an explicit ##/### ID suffix."
	);
}

/** `end` was called outside a draw pass. */
export function endOutsideDraw(): string {
	return `${PREFIX} end() was called outside of a draw function. It can only be used inside the function you pass to createApp().`;
}

/** An ID stack function was called outside a draw pass. */
export function idStackOutsideDraw(fnName: string): string {
	return `${PREFIX} ${fnName}() was called outside of a draw function. It can only be used inside the function you pass to createApp().`;
}

/** `popId` was called while the ID stack was empty. */
export function popIdEmpty(): string {
	return `${PREFIX} popId() called but the ID stack is empty. Make sure every pushId() has a matching popId().`;
}

/** A widget name is not safe for IDs, CSS classes, and diagnostics. */
export function invalidWidgetName(name: string, reason: string): string {
	return (
		`${PREFIX} defineWidget() received an invalid widget name: ${JSON.stringify(name)}. ${reason} ` +
		"Widget names must match /^[A-Za-z][A-Za-z0-9_-]*$/ ."
	);
}

/** A widget used a function as its default state. */
export function invalidDefaultState(widgetName: string): string {
	return (
		`${PREFIX} defineWidget("${widgetName}") has a function as its defaultState. ` +
		"defaultState must be a plain value (object, array, primitive). " +
		"If you need computed initial state, use a factory: defaultState: { value: initialValue }."
	);
}

/** A runtime API was called without an active runtime. */
export function noActiveRuntime(): string {
	return (
		`${PREFIX} A widget was called but no drawing frame is active. ` +
		"Widgets can only be called inside the function you pass to createApp()."
	);
}

/** `popContext` was called without a matching value. */
export function unbalancedPopContext(key: string): string {
	return (
		`${PREFIX} Unbalanced popContext for key '${key}'. ` +
		"Make sure every pushContext() has a matching popContext()."
	);
}

/** `popLayer` tried to remove the default layer. */
export function popDefaultLayer(): string {
	return (
		`${PREFIX} Cannot pop the default layer. ` +
		"Make sure every pushLayer() has a matching popLayer()."
	);
}

/**
 * The widget default state cannot be cloned safely.
 * This check runs when the widget is defined so the error appears early.
 */
export function defaultStateNotCloneable(
	widgetName: string,
	message: string,
): string {
	return (
		`${PREFIX} defineWidget("${widgetName}")'s defaultState is not structured-cloneable: ${message} ` +
		"defaultState must consist of plain objects, arrays, primitives, Map, " +
		"Set, Date, or RegExp. Class instances, DOM nodes, Symbols, and functions " +
		"(including nested ones) are not supported."
	);
}

/** A widget state could not be cloned for a specific instance. */
export function defaultStateCloneFailure(id: string, message: string): string {
	return (
		`${PREFIX} Failed to initialize state for widget '${id}': ${message} ` +
		"defaultState must be structured-cloneable (plain objects, arrays, " +
		"primitives, Map, Set, Date, RegExp). Class instances, DOM nodes, and functions " +
		"are not supported."
	);
}

/** A memo closure changed the scope depth while its subtree was captured. */
export function memoBlockUnbalancedState(id: string): string {
	return (
		`${PREFIX} memoBlock('${id}') closure left runtime stacks unbalanced. ` +
		"Every scoped widget, pushId(), pushContext(), and pushLayer() inside the " +
		"closure must have a matching end(), popId(), popContext(), or popLayer() " +
		"before the closure returns."
	);
}

/** React hooks inside `memoBlock` would be skipped on cache hits. */
export function reactContextInsideMemoBlock(): string {
	return (
		`${PREFIX} useReactContext() cannot be called inside memoBlock(). ` +
		"A memo cache hit skips the closure and would change React's hook order. " +
		"Read the context before memoBlock() and include the value in its dependencies."
	);
}
