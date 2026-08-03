/**
 * @ispoofermotion/core  IMUI runtime for Tauri + React
 *
 * @packageDocumentation
 *
 * ## Quick start
 *
 * ```ts
 * import { createApp, defineWidget, end, markDirty } from "@ispoofermotion/core";
 * import "@ispoofermotion/core/styles.css";
 *
 * // 1. Define your widgets
 * const Button = defineWidget<{ clicked: boolean }, [label: string], boolean>({
 *   name: "Button",
 *   defaultState: { clicked: false },
 *   a11y: { role: "button", label: ([label]) => label },
 *   render: ({ id, setState, args, widgetProps }) =>
 *     createElement("button", {
 *       key: id,
 *       ...widgetProps,
 *       ...makeInteractive(() => setState({ clicked: true })),
 *     }, args[0]),
 *   getReturnValue: (state) => state.clicked,
 *   consumeState: (state) => ({ ...state, clicked: false }),
 * });
 *
 * // 2. Write your draw function
 * let count = 0;
 * const App = createApp(() => {
 *   if (Button("Increment")) { count++; markDirty(); }
 * });
 *
 * // 3. Mount
 * createRoot(document.getElementById("root")!).render(createElement(App));
 * ```
 *
 * ## Stability guarantee
 *
 * See `STABILITY.md` in the repository root. The public API listed below
 * is stable from v3.2.0 onwards. New behavior is always additive  new
 * optional parameters or new functions. Existing signatures are preserved
 * in patch releases; carefully scoped type corrections may occur in minor
 * releases when runtime behavior is unchanged.
 * (Versions prior to 3.2.0 predate this guarantee; see the changelog.)
 *
 * @since 1.0.0
 */

export type { IsmConfig } from "./config";
export {
	DEFAULT_LAYER_Z_INDEX,
	DEFAULT_SHOW_DEV_TOOLS,
	defineConfig,
} from "./config";
export type { AppOptions } from "./createApp";
export { createApp, useReactContext } from "./createApp";
export { DevTools } from "./DevTools";
export { defineWidget } from "./defineWidget";
export { ISMCoreErrorBoundary, ISMLibErrorBoundary } from "./ErrorBoundary";
export { makeInteractive } from "./makeInteractive";
export { extractDisplayLabel } from "./runtime";
export type {
	StorageAdapter,
	WidgetA11y,
	WidgetConfig,
	WidgetProps,
	WidgetRenderProps,
} from "./types";

import * as errors from "./errors";
import {
	getActiveRuntime,
	getActiveRuntimeOrNull,
	getRuntimeForId,
	mountedRuntimes,
} from "./runtime";
import type { FrameEntry } from "./types";

/**
 * Push an ID segment onto the stack.
 *
 * All widgets called while this segment is active will include it as a
 * prefix in their composite IDs, creating a stable unique identity even
 * when the same widget type appears multiple times.
 *
 * **Always pair with a matching `popId()` call.**
 *
 * @param id - A stable string identifier
 *
 * @since 1.0.0
 */
export function pushId(id: string): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("pushId"));
	}

	runtime.pushIdSegment(id);
}

/**
 * Pop the most recent ID segment from the stack.
 *
 * @since 1.0.0
 */
export function popId(): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("popId"));
	}

	runtime.popIdSegment();
}

/**
 * Push an environment context value.
 *
 * @since 2.0.0
 */
export function pushContext<T>(key: string, value: T): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("pushContext"));
	}

	runtime.pushContext(key, value);
}

/**
 * Pop the most recent environment context value.
 *
 * @since 2.0.0
 */
export function popContext(key: string): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("popContext"));
	}

	runtime.popContext(key);
}

/**
 * Get the current environment context value for a key.
 *
 * @since 2.0.0
 */
export function getContext<T>(key: string): T | undefined {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("getContext"));
	}

	return runtime.getContext<T>(key);
}

/**
 * Push a layer onto the layer stack.
 *
 * @since 2.0.0
 */
export function pushLayer(layerName: string): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("pushLayer"));
	}

	runtime.pushLayer(layerName);
}

/**
 * Pop the most recent layer from the stack.
 *
 * @since 2.0.0
 */
export function popLayer(): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("popLayer"));
	}

	runtime.popLayer();
}

function shallowEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let index = 0; index < a.length; index++) {
		if (a[index] !== b[index]) {
			return false;
		}
	}

	return true;
}

/**
 * Memoize a subtree of widgets.
 *
 * @since 2.0.0
 */
export function memoBlock(
	id: string,
	deps: readonly unknown[],
	drawClosure: () => void,
): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("memoBlock"));
	}

	const identity = runtime.buildMemoIdentity(id);
	const cached = runtime.getMemo(identity.cacheKey);

	if (
		cached &&
		shallowEqual(cached.deps, deps) &&
		runtime.pushCachedSubtree(cached.subtree)
	) {
		return;
	}

	runtime.pushIdSegment(identity.idSegment);

	let subtree: FrameEntry[];

	try {
		subtree = runtime.captureSubtree(id, drawClosure);
	} finally {
		runtime.popIdSegment();
	}

	runtime.appendCapturedSubtree(subtree);
	runtime.setMemo(identity.cacheKey, deps, subtree);
}

/**
 * Request focus for a specific widget ID.
 *
 * @since 2.0.0
 */
export function setFocus(id: string | null): void {
	const active = getActiveRuntimeOrNull();

	if (active) {
		active.setFocus(id);
		return;
	}

	const owner = id !== null ? getRuntimeForId(id) : undefined;

	if (owner) {
		owner.setFocus(id);
		return;
	}

	for (const runtime of mountedRuntimes) {
		runtime.setFocus(id);
	}
}

/**
 * Check whether a specific widget ID currently has focus.
 *
 * @since 2.0.0
 */
export function isFocused(id: string): boolean {
	const active = getActiveRuntimeOrNull();

	if (active) {
		return active.isFocused(id);
	}

	const owner = getRuntimeForId(id);

	if (owner) {
		return owner.isFocused(id);
	}

	for (const runtime of mountedRuntimes) {
		if (runtime.isFocused(id)) {
			return true;
		}
	}

	return false;
}

/**
 * Get the currently focused widget ID.
 *
 * @since 3.3.0
 */
export function getFocusedId(): string | null {
	const runtime = getActiveRuntime();
	return runtime.getFocusedId();
}

/**
 * Close the innermost open scoped widget.
 *
 * @since 1.0.0
 */
export function end(): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw new Error(errors.endOutsideDraw());
	}

	runtime.popScope();
}

/**
 * Signal that external state changed and a new frame is needed.
 *
 * @since 1.0.0
 */
export function markDirty(): void {
	for (const runtime of mountedRuntimes) {
		runtime.markDirty();
	}
}
