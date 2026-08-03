import type * as React from "react";
import type { ReactNode } from "react";
import {
	createElement,
	Fragment,
	useContext,
	useEffect,
	useMemo,
	useReducer,
} from "react";
import type { IsmConfig } from "./config";
import { resolveConfig } from "./config";
import { DevTools } from "./DevTools";
import { ErrorFallback, ISMCoreErrorBoundary } from "./ErrorBoundary";
import * as errors from "./errors";
import { getActiveRuntimeOrNull, Runtime, withRuntime } from "./runtime";
import type { FrameEntry, StorageAdapter } from "./types";

/**
 * Render a single FrameEntry to a React element.
 * Retrieves the widget's current state, creates a setState callback,
 * recursively renders children, and calls the entry's render closure.
 */
function renderEntry(runtime: Runtime, entry: FrameEntry): ReactNode {
	const setState = (updater: unknown) => {
		runtime.setState(entry.id, updater, entry.persistent);
	};

	const children =
		entry.children.length > 0
			? createElement(
					Fragment,
					null,
					...entry.children.map((child) =>
						createElement(
							Fragment,
							{ key: child.id },
							renderEntry(runtime, child),
						),
					),
				)
			: null;

	const widget = entry.renderFn({
		id: entry.id,
		state: entry.renderState,
		runtimeId: runtime.getInstanceId(),
		setState,
		args: entry.args,
		children,
		widgetProps: entry.widgetProps,
	});

	if (!entry.a11yDescription) return widget;

	return createElement(
		Fragment,
		null,
		widget,
		createElement(
			"span",
			{
				id: runtime.getDomId("description", entry.id),
				style: {
					position: "absolute",
					width: "1px",
					height: "1px",
					padding: 0,
					margin: "-1px",
					overflow: "hidden",
					clip: "rect(0, 0, 0, 0)",
					whiteSpace: "nowrap",
					border: 0,
				},
			},
			entry.a11yDescription,
		),
	);
}

/**
 * Render the full frame buffer to a React element tree.
 * Each entry is wrapped in a keyed Fragment for stable reconciliation.
 */
function renderFrameBuffer(
	runtime: Runtime,
	layers: Map<string, FrameEntry[]>,
	layerZIndex: number,
): ReactNode {
	if (layers.size === 0) return null;

	const layerElements: ReactNode[] = [];

	for (const [layerName, entries] of layers.entries()) {
		if (entries.length === 0) continue;

		layerElements.push(
			createElement(
				"div",
				{
					key: `layer-${layerName}`,
					"data-ism-layer": layerName,
					style:
						layerName === "default"
							? undefined
							: {
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									height: "100%",
									pointerEvents: "none",
									zIndex: layerZIndex,
								},
				},
				...entries.map((entry) =>
					createElement(
						Fragment,
						{ key: entry.id },
						renderEntry(runtime, entry),
					),
				),
			),
		);
	}

	return createElement(Fragment, null, ...layerElements);
}

/**
 * Read a React Context from within the function you pass to `createApp()`.
 *
 * This is a direct passthrough to `useContext`  it adds no special
 * handling for the immediate-mode draw loop. Because your draw function
 * runs synchronously inside `ISMCore`'s render body, calling this remains
 * fully subject to the Rules of Hooks: call it unconditionally, on every
 * frame, in the same order. Calling it inside an `if` branch (very natural
 * in immediate-mode code, e.g. inside `if (Button("x")) { ... }`) will
 * produce the same "Rendered more hooks than during the previous render"
 * error as misusing any other hook.
 */
export function useReactContext<T>(context: React.Context<T>): T {
	const runtime = getActiveRuntimeOrNull();
	if (runtime?.isCapturingMemo()) {
		throw new Error(errors.reactContextInsideMemoBlock());
	}
	return useContext(context);
}

/**
 * Options for createApp.
 * @since 3.2.0
 */
export interface AppOptions extends IsmConfig {
	/** Optional persistence adapter used by widgets with `persistent: true`. */
	storage?: StorageAdapter;
}

/**
 * Create the root React component for an immediate-mode app.
 *
 * Takes a draw function that describes the entire UI through widget calls.
 * Returns a standard `React.FC` wrapped in an `ISMCoreErrorBoundary` that
 * shows a friendly message instead of a blank screen on error.
 *
 * The returned component:
 * 1. Registers a re-render trigger with the runtime on mount
 * 2. Runs `beginFrame` → `drawFn` → `endFrame` on each render (the "draw pass")
 * 3. Converts the frame buffer to React elements (the "commit")
 * 4. Consumes one-shot widget state during the draw pass
 * 5. Cleans up all runtime state on unmount
 *
 * @param drawFn - Pure function describing the UI for one frame.
 *   Call widget functions here. JSX is not used; `useReactContext` is the only supported React hook and must follow the Rules of Hooks.
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * import { createApp, markDirty } from "@ispoofermotion/core";
 * import { Button, Text } from "./widgets";
 *
 * let count = 0;
 *
 * const App = createApp(() => {
 *   Text("Count: " + count);
 *   if (Button("Increment")) {
 *     count++;
 *     markDirty();
 *   }
 * });
 *
 * createRoot(document.getElementById("root")!).render(createElement(App));
 * ```
 */

export function createApp(drawFn: () => void, options?: AppOptions): React.FC {
	const config = resolveConfig(options);
	const storage = options?.storage;

	function ISMCore() {
		// Create a unique runtime instance for this app root
		const runtime = useMemo(() => new Runtime(storage), []);

		// Force re-render by incrementing a counter.
		// This is the only React state in the entire system.
		const [, forceRender] = useReducer((x: number) => x + 1, 0);

		// Register the re-render trigger on mount, clean up on unmount
		useEffect(() => {
			runtime.registerApp(forceRender);
			return () => {
				runtime.unregisterApp();
			};
		}, [runtime]);

		// Run the draw pass: describe this frame as pure data.
		// withRuntime restores the previous active runtime on exit,
		// even if drawFn or endFrame throws; prevents a leaked global.
		let drawError: Error | null = null;

		withRuntime(runtime, () => {
			runtime.beginFrame();
			try {
				drawFn();
				if (config.showDevTools) {
					DevTools();
				}
			} catch (err: unknown) {
				console.error("[ism] Uncaught error in draw function:", err);
				drawError = err instanceof Error ? err : new Error(String(err));
			}
			runtime.endFrame();
		});

		// If the draw function threw, show a friendly error
		if (drawError) {
			return createElement(ErrorFallback, {
				title: "Draw function error",
				error: drawError,
				kind: "draw",
				onRetry: () => forceRender(),
			});
		}

		// Convert frame buffer to React elements
		const frameBuffer = runtime.getFrameBuffer();
		const zIndex = config.layerZIndex;
		const renderedFrame = withRuntime(runtime, () =>
			renderFrameBuffer(runtime, frameBuffer, zIndex),
		);
		return createElement("div", { "data-ism-root": "" }, renderedFrame);
	}

	ISMCore.displayName = "ISMCore";

	// Wrap in an error boundary so uncaught errors from widget render functions
	// show a friendly message instead of a blank screen.
	function ISMCoreApp() {
		return createElement(ISMCoreErrorBoundary, null, createElement(ISMCore));
	}
	ISMCoreApp.displayName = "ISMCoreApp";

	return ISMCoreApp;
}
