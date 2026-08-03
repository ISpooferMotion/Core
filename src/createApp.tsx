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
 * Render one frame entry and its children.
 *
 * @internal
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
 * Convert the frame buffer into a React tree.
 * Named layers are wrapped separately so their z index can be applied.
 *
 * @internal
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
 * Read a React context from the draw function passed to `createApp`.
 *
 * This calls React's `useContext` directly, so the normal Rules of Hooks still
 * apply. Call it on every frame and in the same order. Do not place it inside
 * a condition or inside `memoBlock`, since a memo cache hit can skip the call.
 */
export function useReactContext<T>(context: React.Context<T>): T {
	const runtime = getActiveRuntimeOrNull();
	if (runtime?.isCapturingMemo()) {
		throw new Error(errors.reactContextInsideMemoBlock());
	}
	return useContext(context);
}

/**
 * Options accepted by {@link createApp}.
 *
 * @since 3.2.0
 */
export interface AppOptions extends IsmConfig {
	/** Synchronous storage used by widgets with `persistent: true`. */
	storage?: StorageAdapter;
}

/**
 * Create the React component that runs an immediate mode draw function.
 *
 * Each render starts a frame, calls `drawFn`, closes the frame, and converts
 * the recorded widgets into React elements. The returned component owns its
 * runtime and clears that runtime when it unmounts.
 *
 * Widget calls belong inside `drawFn`. `useReactContext` is the only supported
 * React hook in that function, and it must follow the normal Rules of Hooks.
 *
 * @param drawFn Function that describes one UI frame.
 * @param options Runtime configuration and optional storage.
 * @returns A React component ready to mount.
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
 *   Text(`Count: ${count}`);
 *   if (Button("Increment")) {
 *     count += 1;
 *     markDirty();
 *   }
 * });
 * ```
 */

export function createApp(drawFn: () => void, options?: AppOptions): React.FC {
	const config = resolveConfig(options);
	const storage = options?.storage;

	function ISMCore() {
		// Keep one runtime for the lifetime of this app root.
		const runtime = useMemo(() => new Runtime(storage), []);

		// React state is only used to request another frame.
		// The counter value itself is not used.
		const [, forceRender] = useReducer((x: number) => x + 1, 0);

		// Connect the runtime to React while this component is mounted.
		useEffect(() => {
			runtime.registerApp(forceRender);
			return () => {
				runtime.unregisterApp();
			};
		}, [runtime]);

		// Record the current frame as plain runtime data.
		// withRuntime always restores the previous active runtime.
		// This also happens when drawing or frame cleanup throws.
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

		// Draw errors are shown inside the app instead of leaving an empty root.
		if (drawError) {
			return createElement(ErrorFallback, {
				title: "Draw function error",
				error: drawError,
				kind: "draw",
				onRetry: () => forceRender(),
			});
		}

		// Turn the recorded frame into React elements.
		const frameBuffer = runtime.getFrameBuffer();
		const zIndex = config.layerZIndex;
		const renderedFrame = withRuntime(runtime, () =>
			renderFrameBuffer(runtime, frameBuffer, zIndex),
		);
		return createElement("div", { "data-ism-root": "" }, renderedFrame);
	}

	ISMCore.displayName = "ISMCore";

	// Widget render errors are handled separately by the React boundary.
	// The boundary keeps a render failure from replacing the whole page.
	function ISMCoreApp() {
		return createElement(ISMCoreErrorBoundary, null, createElement(ISMCore));
	}
	ISMCoreApp.displayName = "ISMCoreApp";

	return ISMCoreApp;
}
