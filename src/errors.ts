const PREFIX = "[ism]";

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
