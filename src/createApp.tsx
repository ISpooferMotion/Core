import type * as React from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
	createElement,
	Fragment,
	lazy,
	Suspense,
	useCallback,
	useContext,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
} from "react";
import type { IsmConfig, LayerMode } from "./config";
import { resolveConfig } from "./config";
import {
	type ErrorFallbackContext,
	ISMCoreErrorBoundary,
	SafeErrorFallback,
	shouldShowErrorDetailsByDefault,
} from "./ErrorBoundary";
import * as errors from "./errors";
import {
	getActiveRuntimeOrNull,
	isReactContextPendingError,
	Runtime,
	withRuntime,
} from "./runtime";
import { cloneStructuredState } from "./stateValue";
import type { FrameEntry, StorageAdapter, StorageFailure } from "./types";

const LazyDevToolsOverlay = lazy(async () => {
	const module = await import("./DevTools");
	return { default: module.DevToolsOverlay };
});

type FrameSnapshot = ReadonlyMap<string, readonly FrameEntry[]>;

function cloneFrameEntry(entry: FrameEntry): FrameEntry {
	return {
		...entry,
		args: [...entry.args],
		children: entry.children.map(cloneFrameEntry),
		renderState: cloneStructuredState(entry.renderState, "renderState"),
		widgetProps: {
			...entry.widgetProps,
			...(entry.widgetProps.style
				? { style: { ...entry.widgetProps.style } }
				: {}),
		},
	};
}

function snapshotFrameBuffer(
	layers: ReadonlyMap<string, readonly FrameEntry[]>,
): FrameSnapshot {
	return new Map(
		Array.from(layers, ([layerName, entries]) => [
			layerName,
			entries.map(cloneFrameEntry),
		]),
	);
}

interface WidgetRenderBoundaryProps {
	runtime: Runtime;
	entry: FrameEntry;
	renderProps: Parameters<FrameEntry["renderFn"]>[0];
}

function WidgetRenderBoundary({
	runtime,
	entry,
	renderProps,
}: WidgetRenderBoundaryProps): ReactNode {
	return withRuntime(runtime, () => entry.renderFn(renderProps));
}

interface WidgetEntryRendererProps {
	runtime: Runtime;
	entry: FrameEntry;
}

function WidgetEntryRenderer({
	runtime,
	entry,
}: WidgetEntryRendererProps): ReactNode {
	const setState = (updater: unknown) => {
		runtime.setState(entry.id, updater, entry.persistence ?? false);
	};

	const children =
		entry.children.length > 0
			? createElement(
					Fragment,
					null,
					...entry.children.map((child) =>
						createElement(WidgetEntryRenderer, {
							key: child.id,
							runtime,
							entry: child,
						}),
					),
				)
			: null;

	const renderProps: Parameters<FrameEntry["renderFn"]>[0] = {
		id: entry.id,
		state: entry.renderState,
		runtimeId: runtime.getInstanceId(),
		setState,
		args: entry.args,
		children,
		widgetProps: entry.widgetProps,
	};
	const widget = createElement(WidgetRenderBoundary, {
		key: entry.widgetName,
		runtime,
		entry,
		renderProps,
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

function renderFrameBuffer(
	runtime: Runtime,
	layers: FrameSnapshot,
	layerZIndex: number,
	layerMode: LayerMode,
): ReactNode {
	const layerElements: ReactNode[] = [];

	for (const [layerName, entries] of layers.entries()) {
		if (entries.length === 0) continue;

		const namedLayer = layerName !== "default";
		layerElements.push(
			createElement(
				"div",
				{
					key: `layer-${layerName}`,
					"data-ism-layer": layerName,
					style: namedLayer
						? {
								position: layerMode === "viewport" ? "fixed" : "absolute",
								inset: 0,
								pointerEvents: "none",
								zIndex: layerZIndex,
							}
						: { display: "contents" },
				},
				...entries.map((entry) =>
					createElement(WidgetEntryRenderer, {
						key: entry.id,
						runtime,
						entry,
					}),
				),
			),
		);
	}

	return createElement(
		"div",
		{
			"data-ism-root": "",
			"data-ism-layer-host": "",
			style:
				layerMode === "root"
					? { position: "relative", isolation: "isolate" }
					: { position: "static" },
		},
		...layerElements,
	);
}

export function useReactContext<T>(context: React.Context<T>): T {
	const runtime = getActiveRuntimeOrNull();
	if (!runtime?.isDrawing()) {
		throw errors.createISMError(
			"ISM_NO_ACTIVE_RUNTIME",
			errors.noActiveRuntime(),
		);
	}
	if (runtime.isCapturingMemo()) {
		throw errors.createISMError(
			"ISM_REACT_CONTEXT_IN_MEMO",
			errors.reactContextInsideMemoBlock(),
		);
	}
	return runtime.readReactContext(context);
}

export interface AppOptions extends IsmConfig {
	storage?: StorageAdapter;
	storageNamespace?: string;
	onStorageError?: (failure: StorageFailure) => void;
	onDiagnostic?: errors.DiagnosticSink;
	onError?: (error: Error, info?: ErrorInfo) => void;
	renderErrorFallback?: (context: ErrorFallbackContext) => ReactNode;
	showErrorDetails?: boolean;
}

export interface AppHandle {
	markDirty(): void;
	setFocus(id: string | null): boolean;
	isFocused(id: string): boolean;
	getFocusedId(): string | null;
	resetState(id: string): boolean;
	clearPersistentState(): number;
	clearStorageNamespace(): number;
}

export type IsmApp = React.FC & AppHandle;

interface ReactContextReaderProps {
	runtime: Runtime;
	context: React.Context<unknown>;
	onContextChange: () => void;
}

function ReactContextReader({
	runtime,
	context,
	onContextChange,
}: ReactContextReaderProps): null {
	const value = useContext(context);

	useLayoutEffect(() => {
		const changed = runtime.setReactContextValue(context, value);
		if (changed && runtime.isAppMounted()) onContextChange();
	}, [runtime, context, value, onContextChange]);

	return null;
}

interface DrawFailure {
	error: Error;
	retryFailed: boolean;
}

export function createApp(drawFn: () => void, options?: AppOptions): IsmApp {
	const config = resolveConfig(options);
	const storage = options?.storage;
	const storageNamespace = options?.storageNamespace?.trim();
	const onStorageError = options?.onStorageError;
	const onDiagnostic = options?.onDiagnostic;
	const onError = options?.onError;
	const renderErrorFallback = options?.renderErrorFallback;
	const showErrorDetails =
		options?.showErrorDetails ?? shouldShowErrorDetailsByDefault();
	const localRuntimes = new Set<Runtime>();

	if (storage && !storageNamespace) {
		throw errors.createISMError(
			"ISM_STORAGE_FAILURE",
			"[ism] storageNamespace is required when a storage adapter is configured.",
			{ details: { operation: "namespace" } },
		);
	}

	function ISMCoreApp() {
		const runtime = useMemo(() => {
			const nextRuntime = new Runtime(
				storage,
				storageNamespace,
				onStorageError,
				config.strictIds,
				config.strictRuntime,
				onDiagnostic,
				config.stateRetentionFrames,
			);
			return nextRuntime;
		}, []);
		const [frameSnapshot, setFrameSnapshot] = useState<FrameSnapshot>(
			() => new Map(),
		);
		const [drawFailure, setDrawFailure] = useState<DrawFailure | null>(null);
		const [, forceContextBridgeRender] = useReducer(
			(revision: number) => revision + 1,
			0,
		);
		const initialDrawAttempted = useRef(false);
		const retryAttempt = useRef(0);
		const lastSuccessfulRetryAttempt = useRef(0);

		const performDraw = useCallback(() => {
			runtime.consumeDirtySignal();
			let frameTransactionId: number | null = null;

			try {
				withRuntime(runtime, () => {
					frameTransactionId = runtime.beginFrame();
					drawFn();
					runtime.prepareFrame(frameTransactionId);
					runtime.commitFrame(frameTransactionId);
				});

				setFrameSnapshot(snapshotFrameBuffer(runtime.getFrameBuffer()));
				setDrawFailure(null);
				lastSuccessfulRetryAttempt.current = retryAttempt.current;
			} catch (err: unknown) {
				if (frameTransactionId !== null) {
					runtime.abortFrame(frameTransactionId);
				}

				if (isReactContextPendingError(err)) {
					forceContextBridgeRender();
					return;
				}

				const drawError = err instanceof Error ? err : new Error(String(err));
				errors.emitDiagnostic(
					onDiagnostic,
					errors.createDiagnostic(
						errors.getErrorCode(drawError, "ISM_DRAW_ERROR"),
						"error",
						"[ism] Uncaught error in draw function.",
						showErrorDetails
							? { cause: drawError, runtimeId: runtime.getInstanceId() }
							: { runtimeId: runtime.getInstanceId() },
					),
				);
				try {
					onError?.(drawError);
				} catch (hookError) {
					errors.emitDiagnostic(
						onDiagnostic,
						errors.createDiagnostic(
							errors.getErrorCode(drawError, "ISM_DRAW_ERROR"),
							"error",
							"[ism] onError hook threw while handling a draw failure.",
							showErrorDetails
								? { cause: hookError, runtimeId: runtime.getInstanceId() }
								: { runtimeId: runtime.getInstanceId() },
						),
					);
				}
				setDrawFailure({
					error: drawError,
					retryFailed:
						retryAttempt.current > lastSuccessfulRetryAttempt.current,
				});
			}
		}, [runtime]);

		const retryDraw = useCallback(() => {
			retryAttempt.current++;
			performDraw();
		}, [performDraw]);

		useLayoutEffect(() => {
			runtime.registerApp(performDraw);
			localRuntimes.add(runtime);
			if (!initialDrawAttempted.current) {
				initialDrawAttempted.current = true;
				performDraw();
			}
			return () => {
				localRuntimes.delete(runtime);
				runtime.unregisterApp();
			};
		}, [runtime, performDraw]);

		const contextReaders = runtime
			.getRequestedReactContexts()
			.map((context: React.Context<unknown>) =>
				createElement(ReactContextReader, {
					key: runtime.getReactContextId(context),
					runtime,
					context,
					onContextChange: performDraw,
				}),
			);

		let content: ReactNode;
		if (drawFailure) {
			const context: ErrorFallbackContext = {
				title: "Draw function error",
				error: drawFailure.error,
				kind: "draw",
				errorCode: errors.getErrorCode(drawFailure.error, "ISM_DRAW_ERROR"),
				showErrorDetails,
				retryFailed: drawFailure.retryFailed,
				onRetry: retryDraw,
			};
			content = createElement(SafeErrorFallback, {
				context,
				...(renderErrorFallback ? { renderFallback: renderErrorFallback } : {}),
				...(onDiagnostic ? { onDiagnostic } : {}),
			});
		} else {
			const renderedFrame = renderFrameBuffer(
				runtime,
				frameSnapshot,
				config.layerZIndex,
				config.layerMode,
			);
			content = config.showDevTools
				? createElement(
						Fragment,
						null,
						renderedFrame,
						createElement(
							Suspense,
							{ fallback: null },
							createElement(LazyDevToolsOverlay, {
								runtimeId: runtime.getInstanceId(),
								zIndex: config.layerZIndex + 1,
							}),
						),
					)
				: renderedFrame;
		}

		return createElement(
			ISMCoreErrorBoundary,
			{
				...(onError
					? {
							onError: (error: Error, info: ErrorInfo) => onError(error, info),
						}
					: {}),
				...(renderErrorFallback ? { renderFallback: renderErrorFallback } : {}),
				showErrorDetails,
				...(onDiagnostic ? { onDiagnostic } : {}),
			},
			...contextReaders,
			content,
		);
	}
	ISMCoreApp.displayName = "ISMCoreApp";

	const app = ISMCoreApp as unknown as IsmApp;
	app.markDirty = () => {
		for (const runtime of localRuntimes) runtime.markDirty();
	};
	app.setFocus = (id: string | null) => {
		if (id === null) {
			for (const runtime of localRuntimes) runtime.setFocus(null);
			return localRuntimes.size > 0;
		}

		for (const runtime of localRuntimes) {
			if (runtime.ownsId(id)) {
				runtime.setFocus(id);
				return true;
			}
		}

		if (localRuntimes.size === 1) {
			const runtime = localRuntimes.values().next().value as Runtime;
			runtime.setFocus(id);
			return true;
		}
		return false;
	};
	app.isFocused = (id: string) => {
		for (const runtime of localRuntimes) {
			if (runtime.isFocused(id)) return true;
		}
		return false;
	};
	app.getFocusedId = () => {
		let focused: string | null = null;
		for (const runtime of localRuntimes) {
			const candidate = runtime.getFocusedId();
			if (candidate === null) continue;
			if (focused !== null && focused !== candidate) {
				throw errors.createISMError(
					"ISM_CROSS_RUNTIME_ID_COLLISION",
					"[ism] This createApp component is mounted more than once with different focused widgets.",
					{ details: { firstFocused: focused, secondFocused: candidate } },
				);
			}
			focused = candidate;
		}
		return focused;
	};
	app.resetState = (id: string) => {
		for (const runtime of localRuntimes) {
			if (runtime.ownsId(id)) return runtime.resetState(id);
		}
		return false;
	};
	app.clearPersistentState = () => {
		let cleared = 0;
		for (const runtime of localRuntimes) {
			cleared += runtime.clearPersistentState();
		}
		return cleared;
	};
	app.clearStorageNamespace = () => {
		let cleared = 0;
		for (const runtime of localRuntimes) {
			cleared += runtime.clearStorageNamespace();
		}
		return cleared;
	};

	return app;
}
