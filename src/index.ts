export type { IsmConfig, LayerMode } from "./config";
export {
	DEFAULT_LAYER_MODE,
	DEFAULT_LAYER_Z_INDEX,
	DEFAULT_SHOW_DEV_TOOLS,
	DEFAULT_STATE_RETENTION_FRAMES,
	DEFAULT_STRICT_IDS,
	DEFAULT_STRICT_RUNTIME,
	defineConfig,
} from "./config";
export type { AppHandle, AppOptions, IsmApp } from "./createApp";
export { createApp, useReactContext } from "./createApp";
export { defineWidget } from "./defineWidget";
export type {
	ErrorFallbackContext,
	ErrorFallbackProps,
	ISMCoreErrorBoundaryProps,
} from "./ErrorBoundary";
export {
	ErrorFallback,
	ISMCoreErrorBoundary,
} from "./ErrorBoundary";
export type {
	DiagnosticLevel,
	DiagnosticSink,
	ISMDiagnostic,
	ISMErrorCode,
} from "./errors";
export { ISMError } from "./errors";
export { makeInteractive } from "./makeInteractive";
export { extractDisplayLabel } from "./runtime";
export type {
	PersistentStateOptions,
	StorageAdapter,
	StorageFailure,
	StorageOperation,
	WidgetA11y,
	WidgetConfig,
	WidgetProps,
	WidgetRenderProps,
} from "./types";
export { CORE_VERSION } from "./version";

import * as errors from "./errors";
import {
	getActiveRuntime,
	getActiveRuntimeOrNull,
	getRuntimeForId,
	mountedRuntimes,
} from "./runtime";
import type { FrameEntry } from "./types";

export function pushId(id: string): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("pushId"),
		);
	}

	runtime.pushIdSegment(id);
}

export function popId(): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("popId"),
		);
	}

	runtime.popIdSegment();
}

export function withId<T>(id: string, drawClosure: () => T): T {
	pushId(id);
	try {
		return drawClosure();
	} finally {
		popId();
	}
}

export function pushContext<T>(key: string, value: T): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("pushContext"),
		);
	}

	runtime.pushContext(key, value);
}

export function popContext(key: string): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("popContext"),
		);
	}

	runtime.popContext(key);
}

export function getContext<T>(key: string): T | undefined {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("getContext"),
		);
	}

	return runtime.getContext<T>(key);
}

export function withContext<T, R>(
	key: string,
	value: T,
	drawClosure: () => R,
): R {
	pushContext(key, value);
	try {
		return drawClosure();
	} finally {
		popContext(key);
	}
}

export function pushLayer(layerName: string): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("pushLayer"),
		);
	}

	runtime.pushLayer(layerName);
}

export function popLayer(): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("popLayer"),
		);
	}

	runtime.popLayer();
}

export function withLayer<T>(layerName: string, drawClosure: () => T): T {
	pushLayer(layerName);
	try {
		return drawClosure();
	} finally {
		popLayer();
	}
}

function shallowEqual(a: readonly unknown[], b: readonly unknown[]): boolean {
	if (a.length !== b.length) {
		return false;
	}

	for (let index = 0; index < a.length; index++) {
		if (!Object.is(a[index], b[index])) {
			return false;
		}
	}

	return true;
}

export function memoBlock(
	id: string,
	deps: readonly unknown[],
	drawClosure: () => void,
): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_ID_STACK_OUTSIDE_DRAW",
			errors.idStackOutsideDraw("memoBlock"),
		);
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

	if (id === null) {
		for (const runtime of mountedRuntimes) runtime.setFocus(null);
	}
}

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

export function getFocusedId(): string | null {
	const runtime = getActiveRuntime();
	return runtime.getFocusedId();
}

export function end(): void {
	const runtime = getActiveRuntime();

	if (!runtime.isDrawing()) {
		throw errors.createISMError(
			"ISM_END_OUTSIDE_DRAW",
			errors.endOutsideDraw(),
		);
	}

	runtime.popScope();
}

export function markDirty(): void {
	for (const runtime of mountedRuntimes) {
		runtime.markDirty();
	}
}
