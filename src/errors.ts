const PREFIX = "[ism]";

/** Convert any caught value into a readable error message. */
export function getErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
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

/** A widget name is empty or contains a reserved character. */
export function invalidWidgetName(name: string, reason: string): string {
	return (
		`${PREFIX} defineWidget() received an invalid widget name: ${JSON.stringify(name)}. ${reason} ` +
		"Widget names must be non-empty strings that do not contain '/', '#', or whitespace."
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
