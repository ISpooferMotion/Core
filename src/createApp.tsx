import type * as React from "react";
import type { ErrorInfo, ReactNode } from "react";
import {
	createElement,
	Fragment,
	lazy,
	Suspense,
	useContext,
	useEffect,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
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
import { getActiveRuntimeOrNull, Runtime, withRuntime } from "./runtime";
import type { FrameEntry, StorageAdapter, StorageFailure } from "./types";

const LazyDevToolsOverlay = lazy(async () => {
	const module = await import("./DevTools");
	return { default: module.DevToolsOverlay };
});

function renderEntry(runtime: Runtime, entry: FrameEntry): ReactNode {
	const setState = (updater: unknown) => {
		runtime.setState(entry.id, updater, entry.persistence ?? false);
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

function renderFrameBuffer(
	runtime: Runtime,
	layers: Map<string, FrameEntry[]>,
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
					createElement(
						Fragment,
						{ key: entry.id },
						renderEntry(runtime, entry),
					),
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
	if (runtime?.isCapturingMemo()) {
		throw errors.createISMError(
			"ISM_REACT_CONTEXT_IN_MEMO",
			errors.reactContextInsideMemoBlock(),
		);
	}
	return useContext(context);
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

	function ISMCoreRenderer({ runtime }: { runtime: Runtime }) {
		const [drawRetryAttempt, requestDrawRetry] = useReducer(
			(attempt: number) => attempt + 1,
			0,
		);
		const lastSuccessfulRetryAttempt = useRef(0);

		let drawError: Error | null = null;
		let frameTransactionId: number | null = null;

		withRuntime(runtime, () => {
			frameTransactionId = runtime.beginFrame(true);
			try {
				drawFn();
				runtime.prepareFrame(frameTransactionId);
			} catch (err: unknown) {
				runtime.abortFrame(frameTransactionId);
				drawError = err instanceof Error ? err : new Error(String(err));
				errors.emitDiagnostic(
					onDiagnostic,
					errors.createDiagnostic(
						errors.getErrorCode(drawError, "ISM_DRAW_ERROR"),
						"error",
						"[ism] Uncaught error in draw function.",
						{ cause: drawError, runtimeId: runtime.getInstanceId() },
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
							{ cause: hookError, runtimeId: runtime.getInstanceId() },
						),
					);
				}
			}
		});

		useLayoutEffect(() => {
			if (frameTransactionId !== null && drawError === null) {
				runtime.commitFrame(frameTransactionId);
				lastSuccessfulRetryAttempt.current = drawRetryAttempt;
			}
			return () => {
				if (frameTransactionId !== null) {
					runtime.abortFrame(frameTransactionId);
				}
			};
		});

		if (drawError) {
			const context: ErrorFallbackContext = {
				title: "Draw function error",
				error: drawError,
				kind: "draw",
				errorCode: errors.getErrorCode(drawError, "ISM_DRAW_ERROR"),
				showErrorDetails,
				retryFailed: drawRetryAttempt > lastSuccessfulRetryAttempt.current,
				onRetry: requestDrawRetry,
			};
			return createElement(SafeErrorFallback, {
				context,
				...(renderErrorFallback ? { renderFallback: renderErrorFallback } : {}),
				...(onDiagnostic ? { onDiagnostic } : {}),
			});
		}

		const frameBuffer = runtime.getFrameBuffer();
		const renderedFrame = withRuntime(runtime, () =>
			renderFrameBuffer(
				runtime,
				frameBuffer,
				config.layerZIndex,
				config.layerMode,
			),
		);
		if (!config.showDevTools) return renderedFrame;
		return createElement(
			Fragment,
			null,
			renderedFrame,
			createElement(
				Suspense,
				{ fallback: null },
				createElement(LazyDevToolsOverlay, {
					runtime,
					zIndex: config.layerZIndex + 1,
				}),
			),
		);
	}

	ISMCoreRenderer.displayName = "ISMCoreRenderer";

	function ISMCoreApp() {
		const runtime = useMemo(
			() =>
				new Runtime(
					storage,
					storageNamespace,
					onStorageError,
					config.strictIds,
					config.strictRuntime,
					onDiagnostic,
					config.stateRetentionFrames,
				),
			[],
		);
		const [, forceRender] = useReducer((x: number) => x + 1, 0);

		useEffect(() => {
			runtime.registerApp(forceRender);
			localRuntimes.add(runtime);
			return () => {
				localRuntimes.delete(runtime);
				runtime.unregisterApp();
			};
		}, [runtime]);

		return (
			<ISMCoreErrorBoundary
				{...(onError
					? { onError: (error: Error, info: ErrorInfo) => onError(error, info) }
					: {})}
				{...(renderErrorFallback
					? { renderFallback: renderErrorFallback }
					: {})}
				showErrorDetails={showErrorDetails}
				{...(onDiagnostic ? { onDiagnostic } : {})}
			>
				<ISMCoreRenderer runtime={runtime} />
			</ISMCoreErrorBoundary>
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
		for (const runtime of localRuntimes)
			cleared += runtime.clearPersistentState();
		return cleared;
	};
	app.clearStorageNamespace = () => {
		let cleared = 0;
		for (const runtime of localRuntimes)
			cleared += runtime.clearStorageNamespace();
		return cleared;
	};

	return app;
}
