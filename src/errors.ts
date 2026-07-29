const PREFIX = "[ism]";

/**
 * Normalize a caught value (which TypeScript types as `unknown`, since
 * JavaScript allows throwing anything) into a display-ready message string.
 *
 * Centralizes the `err instanceof Error ? err.message : String(err)`
 * pattern that was previously duplicated across `cli.ts`, `DevTools.ts`,
 * and `runtime.ts`.
 */
export function getErrorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

/**
 * Widget called outside of a draw function.
 */
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

/**
 * end() called with no open scope to close.
 */
export function endWithoutScope(): string {
	return (
		`${PREFIX} end() was called but there's no open section to close. ` +
		"Make sure every scoped widget (like Collapsing or Window) has exactly one matching end()."
	);
}

/**
 * Frame ended with unclosed scoped widgets.
 */
export function unclosedScopes(names: string[]): string {
	const list = names.map((n) => `'${n}'`).join(", ");
	return (
		`${PREFIX} Frame ended with ${names.length} unclosed section(s): ${list}. ` +
		"Add an end() call after each section's content."
	);
}

/**
 * Two widgets with the same label in the same scope (auto-resolved, warning only).
 */
export function duplicateId(widgetName: string, displayLabel: string): string {
	return (
		`${PREFIX} Two widgets with label '${displayLabel}' in the same scope. ` +
		"They'll work, but consider adding ##unique_id to tell them apart. " +
		`Example: ${widgetName}("${displayLabel}##1")`
	);
}

/**
 * end() called outside of a draw function.
 */
export function endOutsideDraw(): string {
	return `${PREFIX} end() was called outside of a draw function. It can only be used inside the function you pass to createApp().`;
}

/**
 * pushId/popId called outside of a draw function.
 */
export function idStackOutsideDraw(fnName: string): string {
	return `${PREFIX} ${fnName}() was called outside of a draw function. It can only be used inside the function you pass to createApp().`;
}

/**
 * popId() called with an empty ID stack.
 */
export function popIdEmpty(): string {
	return `${PREFIX} popId() called but the ID stack is empty. Make sure every pushId() has a matching popId().`;
}

/**
 * defineWidget() called with an invalid widget name.
 */
export function invalidWidgetName(name: string, reason: string): string {
	return (
		`${PREFIX} defineWidget() received an invalid widget name: ${JSON.stringify(name)}. ${reason} ` +
		"Widget names must be non-empty strings that do not contain '/', '#', or whitespace."
	);
}

/**
 * defineWidget() called with a function as defaultState.
 */
export function invalidDefaultState(widgetName: string): string {
	return (
		`${PREFIX} defineWidget("${widgetName}") has a function as its defaultState. ` +
		"defaultState must be a plain value (object, array, primitive). " +
		"If you need computed initial state, use a factory: defaultState: { value: initialValue }."
	);
}

/**
 * A widget or API function was called outside of a drawing frame
 * (activeRuntime is null).
 */
export function noActiveRuntime(): string {
	return (
		`${PREFIX} A widget was called but no drawing frame is active. ` +
		"Widgets can only be called inside the function you pass to createApp()."
	);
}

/**
 * popContext() called with no matching push.
 */
export function unbalancedPopContext(key: string): string {
	return (
		`${PREFIX} Unbalanced popContext for key '${key}'. ` +
		"Make sure every pushContext() has a matching popContext()."
	);
}

/**
 * popLayer() called when only the default layer is on the stack.
 */
export function popDefaultLayer(): string {
	return (
		`${PREFIX} Cannot pop the default layer. ` +
		"Make sure every pushLayer() has a matching popLayer()."
	);
}

/**
 * defaultState failed structuredClone() at defineWidget() time (a nested
 * function, class instance, DOM node, Symbol, etc). Caught here -- rather
 * than only at the first widget call, deep inside a user's app -- so the
 * failure surfaces immediately when the widget is defined.
 */
export function defaultStateNotCloneable(
	widgetName: string,
	message: string,
): string {
	return (
		`${PREFIX} defineWidget("${widgetName}")'s defaultState is not structured-cloneable: ${message} ` +
		"defaultState must consist of plain objects, arrays, primitives, Map, " +
		"Set, or Date. Class instances, DOM nodes, Symbols, and functions " +
		"(including nested ones) are not supported."
	);
}

/**
 * structuredClone(defaultState) failed for a given widget instance id.
 */
export function defaultStateCloneFailure(id: string, message: string): string {
	return (
		`${PREFIX} Failed to initialize state for widget '${id}': ${message} ` +
		"defaultState must be structured-cloneable (plain objects, arrays, " +
		"primitives, Map, Set, Date). Class instances, DOM nodes, and functions " +
		"are not supported."
	);
}

/**
 * memoBlock's drawClosure left scopes open (or closed extra ones), so the
 * captured subtree cannot be trusted.
 */
export function memoBlockUnbalancedScope(id: string): string {
	return (
		`${PREFIX} memoBlock('${id}') closure left an unbalanced scope stack ` +
		"(a scoped widget was opened without a matching end(), or vice versa). " +
		"The captured subtree may be incorrect. Make sure every scoped widget " +
		"inside a memoBlock closure has a matching end() before the closure returns."
	);
}
