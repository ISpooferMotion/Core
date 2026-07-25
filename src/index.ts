/**
 * @ispoofermotion/core -- IMUI runtime for Tauri + React
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
 * is stable from v1.0.0. New behavior is always additive -- new optional
 * parameters or new functions. Existing signatures never change.
 *
 * @since 1.0.0
 */

export type { AppOptions } from "./createApp";
export { createApp, useReactContext } from "./createApp";
export { DevConsole } from "./DevConsole";
export { DevTools } from "./DevTools";
export { defineWidget } from "./defineWidget";
export { ISMCoreErrorBoundary, ISMLibErrorBoundary } from "./ErrorBoundary";
export { attachDevConsole, getDevLogs, pushLog } from "./logger";
export { makeInteractive } from "./makeInteractive";
export { extractDisplayLabel } from "./runtime";
export type {
	StorageAdapter,
	WidgetA11y,
	WidgetConfig,
	WidgetProps,
	WidgetRenderProps,
} from "./types";

// Runtime convenience functions
// These are thin, documented wrappers around the runtime singleton,
// providing a flat API surface for user draw functions.

import * as errors from "./errors";
import { getActiveRuntime, mountedRuntimes } from "./runtime";

/**
 * Push an ID segment onto the stack.
 *
 * All widgets called while this segment is active will include it as a
 * prefix in their composite IDs, creating a stable unique identity even
 * when the same widget type appears multiple times.
 *
 * **Always pair with a matching `popId()` call.**
 *
 * @param id - A stable string identifier (e.g., a database row ID, not a loop index)
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * for (const item of items) {
 *   pushId(item.id);
 *   Text(item.name);
 *   if (Button("Delete")) { remove(item.id); markDirty(); }
 *   popId();
 * }
 * ```
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
 * Must be paired with a preceding `pushId()`. Calling `popId()` with an
 * empty stack logs a warning and is a no-op.
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
 * @param key Context key (e.g. "disabled")
 * @param value Context value
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
 * Push a layer onto the layer stack. All subsequent root-level widgets
 * will be rendered into this layer (useful for modals/tooltips).
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

/**
 * Shallow compare two arrays.
 */
function shallowEqual(a: unknown[], b: unknown[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		if (a[i] !== b[i]) return false;
	}
	return true;
}

/**
 * Memoize a subtree of widgets. If dependencies have not changed,
 * the drawClosure will not be executed and the previous frame's UI
 * will be reused, drastically reducing CPU overhead.
 *
 * @param id Unique ID for this block
 * @param deps Array of dependencies to check for changes
 * @param drawClosure Function containing widget calls
 *
 * @since 2.0.0
 */
export function memoBlock(
	id: string,
	deps: unknown[],
	drawClosure: () => void,
): void {
	const runtime = getActiveRuntime();
	if (!runtime.isDrawing()) {
		throw new Error(errors.idStackOutsideDraw("memoBlock"));
	}

	const memoId = runtime.buildMemoKey(id);
	const cached = runtime.getMemo(memoId);

	if (cached && shallowEqual(cached.deps, deps)) {
		runtime.pushCachedSubtree(cached.subtree);
	} else {
		// We push an ID segment so that any widgets created inside the closure
		// get stable IDs relative to this memo block.
		runtime.pushIdSegment(id);
		const subtree = runtime.captureSubtree(drawClosure);
		runtime.popIdSegment();

		runtime.setMemo(memoId, deps, subtree);
	}
}

/**
 * Request focus for a specific widget ID.
 *
 * @since 2.0.0
 */
export function setFocus(id: string | null): void {
	const runtime = getActiveRuntime();
	runtime.setFocus(id);
}

/**
 * Check if a specific widget ID currently has focus.
 *
 * @since 2.0.0
 */
export function isFocused(id: string): boolean {
	const runtime = getActiveRuntime();
	return runtime.isFocused(id);
}

/**
 * Close the innermost open scoped widget.
 *
 * Must be called exactly once for every scoped widget call (e.g., a widget
 * defined with `scoped: true`). Calling `end()` more times than there are
 * open scopes logs an error and is a no-op.
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * if (Collapsing("Settings")) {
 *   Slider("Volume", 0, 100);
 *   end(); // closes Collapsing
 * }
 * ```
 */
export function end(): void {
	const runtime = getActiveRuntime();
	if (!runtime.isDrawing()) {
		throw new Error(errors.endOutsideDraw());
	}
	runtime.popScope();
}

/**
 * Signal that your app's external state has changed and a new frame is needed.
 *
 * You do **not** need to call this after widget interactions -- those trigger
 * re-renders automatically via `setState`. Call `markDirty()` when you change
 * your own variables from outside the draw function (e.g., from a timer,
 * network response, or Tauri event listener).
 *
 * Multiple `markDirty()` calls within the same microtask batch are coalesced
 * into a single re-render.
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * // From a Tauri event
 * listen("download_progress", (e) => {
 *   state.progress = e.payload.percent;
 *   markDirty();
 * });
 *
 * // From a timer
 * setInterval(() => {
 *   state.elapsed++;
 *   markDirty();
 * }, 1000);
 * ```
 */
export function markDirty(): void {
	for (const runtime of mountedRuntimes) {
		runtime.markDirty();
	}
}
