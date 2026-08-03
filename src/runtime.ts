import * as errors from "./errors";
import type { FrameEntry, StorageAdapter } from "./types";

interface ScopeEntry {
	id: string;
	label: string;
	frameEntry: FrameEntry;
	previousIdPrefix: string;
}

interface MemoCacheEntry {
	deps: unknown[];
	subtree: FrameEntry[];
	widgetIds: string[];
}

export interface MemoIdentity {
	cacheKey: string;
	idSegment: string;
}

function encodeIdSegment(value: string): string {
	return value.replaceAll("%", "%25").replaceAll("/", "%2F");
}

function cloneMapOfArrays(map: Map<string, unknown[]>): Map<string, unknown[]> {
	return new Map(Array.from(map, ([key, value]) => [key, [...value]]));
}

function cloneMapOfSets<K, V>(map: Map<K, Set<V>>): Map<K, Set<V>> {
	return new Map(Array.from(map, ([key, value]) => [key, new Set(value)]));
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
	return (
		left.length === right.length &&
		left.every((value, index) => value === right[index])
	);
}

function mapsOfArraysEqual(
	left: Map<string, unknown[]>,
	right: Map<string, unknown[]>,
): boolean {
	if (left.size !== right.size) return false;
	for (const [key, leftValues] of left) {
		const rightValues = right.get(key);
		if (!rightValues || !arraysEqual(leftValues, rightValues)) return false;
	}
	return true;
}

function shallowStateEqual(left: unknown, right: unknown): boolean {
	if (Object.is(left, right)) return true;
	if (Array.isArray(left) && Array.isArray(right)) {
		return arraysEqual(left, right);
	}
	if (
		left !== null &&
		right !== null &&
		typeof left === "object" &&
		typeof right === "object" &&
		Object.getPrototypeOf(left) === Object.prototype &&
		Object.getPrototypeOf(right) === Object.prototype
	) {
		const leftRecord = left as Record<string, unknown>;
		const rightRecord = right as Record<string, unknown>;
		const leftKeys = Object.keys(leftRecord);
		if (leftKeys.length !== Object.keys(rightRecord).length) return false;
		return leftKeys.every(
			(key) =>
				Object.hasOwn(rightRecord, key) &&
				Object.is(leftRecord[key], rightRecord[key]),
		);
	}
	return false;
}

function restoreMap<K, V>(target: Map<K, V>, source: Map<K, V>): void {
	target.clear();
	for (const [key, value] of source) target.set(key, value);
}

function restoreSet<T>(target: Set<T>, source: Set<T>): void {
	target.clear();
	for (const value of source) target.add(value);
}

let nextRuntimeInstanceId = 1;

class FramePool {
	private pool: FrameEntry[] = [];
	private index = 0;

	reset(): void {
		this.index = 0;
	}

	trim(maxRetained: number): void {
		if (this.pool.length > maxRetained) this.pool.length = maxRetained;
	}

	acquire(): FrameEntry {
		if (this.index >= this.pool.length) {
			this.pool.push({
				id: "",
				widgetName: "",
				args: [],
				scoped: false,
				children: [],
				defaultState: null,
				renderState: null,
				persistent: false,
				widgetProps: {
					"data-ism-widget": "",
					"data-ism-id": "",
					className: "",
				},
				renderFn: () => null,
			} satisfies FrameEntry);
		}

		const entry = this.pool[this.index++] as FrameEntry;
		entry.children.length = 0;
		delete entry.a11yDescription;
		return entry;
	}
}

/** Runtime state for one component returned by `createApp`. */
export class Runtime {
	private readonly storage: StorageAdapter | null;
	private stateStore = new Map<string, unknown>();
	private contextStack = new Map<string, unknown[]>();
	private memoCache = new Map<string, MemoCacheEntry>();
	private memoKeysByWidgetId = new Map<string, Set<string>>();
	private memoTTL = new Map<string, number>();
	private memoKeysThisFrame = new Set<string>();
	private memoCollisionCounter = new Map<string, number>();
	private memoCaptureDepth = 0;
	private idPrefixStack: string[] = [];
	private idPrefix = "";
	private collisionCounter = new Map<string, number>();
	private usedFinalIds = new Set<string>();
	private duplicateWarned = new Set<string>();
	private frameRoot = new Map<string, FrameEntry[]>();
	private activeLayerStack: string[] = ["default"];
	private focusedId: string | null = null;
	private ownedIds = new Set<string>();
	private framePool = new FramePool();
	private stateTTL = new Map<string, number>();
	private static readonly GC_TTL_MS = 1000;
	private scopeStack: ScopeEntry[] = [];
	private drawing = false;
	private rerenderFn: (() => void) | null = null;
	private dirty = false;
	private readonly instanceId = `ism-runtime-${nextRuntimeInstanceId++}`;
	private lifecycleToken = 0;
	private appMounted = false;
	private treeRevision = 0;
	private stateRevision = 0;
	private lastTreeFingerprint = "";

	constructor(storage?: StorageAdapter) {
		this.storage = storage ?? null;
	}

	registerApp(rerenderFn: () => void): void {
		this.lifecycleToken++;
		this.appMounted = true;
		this.rerenderFn = rerenderFn;
		this.dirty = false;
		mountedRuntimes.add(this);
	}

	unregisterApp(): void {
		this.appMounted = false;
		this.rerenderFn = null;
		this.dirty = false;
		mountedRuntimes.delete(this);
		if (mountedRuntimes.size <= 1) crossRuntimeCollisionWarned.clear();

		const token = ++this.lifecycleToken;
		queueMicrotask(() => {
			if (!this.appMounted && this.lifecycleToken === token) this.clearState();
		});
	}

	private clearState(): void {
		this.stateStore.clear();
		this.contextStack.clear();
		this.memoCache.clear();
		this.memoKeysByWidgetId.clear();
		this.memoTTL.clear();
		this.memoKeysThisFrame.clear();
		this.memoCollisionCounter.clear();
		this.idPrefixStack.length = 0;
		this.idPrefix = "";
		this.collisionCounter.clear();
		this.usedFinalIds.clear();
		this.duplicateWarned.clear();
		this.frameRoot.clear();
		this.activeLayerStack = ["default"];
		this.focusedId = null;
		this.ownedIds.clear();
		this.framePool.reset();
		this.stateTTL.clear();
		this.scopeStack.length = 0;
		this.drawing = false;
		this.dirty = false;
		this.memoCaptureDepth = 0;
		this.treeRevision++;
		this.stateRevision++;
		this.lastTreeFingerprint = "";
	}

	isAppMounted(): boolean {
		return this.appMounted;
	}

	getInstanceId(): string {
		return this.instanceId;
	}

	getDomId(kind: string, id: string): string {
		return `${this.instanceId}-${encodeIdSegment(kind)}-${encodeIdSegment(id)}`;
	}

	beginFrame(): void {
		this.drawing = true;
		this.frameRoot.clear();
		this.activeLayerStack = ["default"];
		this.framePool.reset();
		this.collisionCounter.clear();
		this.memoCollisionCounter.clear();
		this.usedFinalIds.clear();
		this.duplicateWarned.clear();
		this.scopeStack.length = 0;
		this.idPrefixStack.length = 0;
		this.idPrefix = "";
		this.contextStack.clear();
		this.memoKeysThisFrame.clear();
		this.dirty = false;
	}

	endFrame(): void {
		if (this.scopeStack.length > 0) {
			console.error(
				errors.unclosedScopes(this.scopeStack.map((scope) => scope.label)),
			);
		}

		const currentIds = new Set<string>();
		for (const entries of this.frameRoot.values())
			this.collectIds(entries, currentIds);

		const now = Date.now();
		for (const [id, expiry] of this.stateTTL) {
			if (currentIds.has(id)) {
				this.stateTTL.set(id, now + Runtime.GC_TTL_MS);
			} else if (now > expiry) {
				this.stateStore.delete(id);
				this.stateRevision++;
				this.stateTTL.delete(id);
				this.ownedIds.delete(id);
				this.invalidateMemoForWidget(id);
				if (this.focusedId === id) this.focusedId = null;
			}
		}
		for (const id of currentIds) {
			if (!this.stateTTL.has(id))
				this.stateTTL.set(id, now + Runtime.GC_TTL_MS);
		}

		for (const [key, expiry] of this.memoTTL) {
			if (this.memoKeysThisFrame.has(key)) {
				this.memoTTL.set(key, now + Runtime.GC_TTL_MS);
			} else if (now > expiry) {
				this.deleteMemo(key);
			}
		}
		for (const key of this.memoKeysThisFrame) {
			if (!this.memoTTL.has(key))
				this.memoTTL.set(key, now + Runtime.GC_TTL_MS);
		}

		if (this.idPrefixStack.length > 0) {
			console.error(
				`[ism] Unbalanced pushId/popId calls: ${this.idPrefixStack.length} segment(s) remain open.`,
			);
		}
		for (const [key, stack] of this.contextStack) {
			if (stack.length > 0) {
				console.error(
					`[ism] Unbalanced context stack for "${key}": ${stack.length} value(s) remain.`,
				);
			}
		}
		if (this.activeLayerStack.length > 1) {
			console.error(
				`[ism] Unbalanced pushLayer/popLayer calls: ${this.activeLayerStack.length - 1} layer(s) remain open.`,
			);
		}

		const treeFingerprint = this.computeTreeFingerprint();
		if (treeFingerprint !== this.lastTreeFingerprint) {
			this.lastTreeFingerprint = treeFingerprint;
			this.treeRevision++;
		}

		this.framePool.trim(Math.max(currentIds.size * 2, 128));
		this.drawing = false;
	}

	isDrawing(): boolean {
		return this.drawing;
	}

	getFrameBuffer(): Map<string, FrameEntry[]> {
		return this.frameRoot;
	}

	getState<S>(id: string, defaultState: S, persistent = false): S {
		if (!this.stateStore.has(id)) {
			let initialState: S;
			try {
				initialState = structuredClone(defaultState);
			} catch (error) {
				throw new Error(
					errors.defaultStateCloneFailure(id, errors.getErrorMessage(error)),
				);
			}

			if (persistent && this.storage) {
				const stored = this.storage.get(id);
				if (stored !== undefined && stored !== null) initialState = stored as S;
				else this.storage.set(id, initialState);
			}
			this.stateStore.set(id, initialState);
			this.stateRevision++;
		}
		return this.stateStore.get(id) as S;
	}

	setState(id: string, updater: unknown, persistent = false): void {
		if (!this.stateStore.has(id)) return;
		const current = this.stateStore.get(id);
		const next =
			typeof updater === "function"
				? (updater as (previous: unknown) => unknown)(current)
				: updater;
		this.stateStore.set(id, next);
		this.stateRevision++;
		if (persistent && this.storage) this.storage.set(id, next);
		this.invalidateMemoForWidget(id);
		this.markDirty();
	}

	consumeState(
		id: string,
		currentState: unknown,
		consumer: (state: unknown) => unknown,
		persistent = false,
	): void {
		if (!this.stateStore.has(id)) return;
		const next = consumer(currentState);
		if (shallowStateEqual(currentState, next)) return;
		this.stateStore.set(id, next);
		this.stateRevision++;
		if (persistent && this.storage) this.storage.set(id, next);
	}

	buildId(widgetName: string, label: string | undefined): string {
		const rawLabel =
			label === undefined
				? widgetName
				: label.includes("###")
					? label.slice(label.indexOf("###") + 3)
					: label;
		const rawId = `${this.idPrefix}${encodeIdSegment(widgetName)}/${encodeIdSegment(rawLabel)}`;
		let occurrence = this.collisionCounter.get(rawId) ?? 0;
		let finalId = occurrence === 0 ? rawId : `${rawId}__${occurrence + 1}`;

		while (this.usedFinalIds.has(finalId)) {
			occurrence++;
			finalId = `${rawId}__${occurrence + 1}`;
		}

		this.collisionCounter.set(rawId, occurrence + 1);
		this.reserveId(finalId);
		if (
			finalId !== rawId &&
			label !== undefined &&
			!this.duplicateWarned.has(rawId)
		) {
			this.duplicateWarned.add(rawId);
			console.warn(errors.duplicateId(widgetName, extractDisplayLabel(label)));
		}
		return finalId;
	}

	ownsId(id: string): boolean {
		return this.ownedIds.has(id);
	}

	pushContext<T>(key: string, value: T): void {
		let stack = this.contextStack.get(key);
		if (!stack) {
			stack = [];
			this.contextStack.set(key, stack);
		}
		stack.push(value);
	}

	popContext(key: string): void {
		const stack = this.contextStack.get(key);
		if (!stack || stack.length === 0) {
			console.warn(errors.unbalancedPopContext(key));
			return;
		}
		stack.pop();
	}

	getContext<T>(key: string): T | undefined {
		const stack = this.contextStack.get(key);
		return stack?.[stack.length - 1] as T | undefined;
	}

	pushLayer(layerName: string): void {
		this.activeLayerStack.push(layerName);
	}

	popLayer(): void {
		if (this.activeLayerStack.length <= 1) {
			console.warn(errors.popDefaultLayer());
			return;
		}
		this.activeLayerStack.pop();
	}

	getActiveLayer(): string {
		return this.activeLayerStack[this.activeLayerStack.length - 1] ?? "default";
	}

	buildMemoIdentity(id: string): MemoIdentity {
		const encoded = encodeIdSegment(id);
		const base = `${this.idPrefix}__memo__/${encoded}`;
		const count = (this.memoCollisionCounter.get(base) ?? 0) + 1;
		this.memoCollisionCounter.set(base, count);
		const suffix = count === 1 ? "" : `__${count}`;
		const cacheKey = `${base}${suffix}`;
		this.memoKeysThisFrame.add(cacheKey);
		return { cacheKey, idSegment: `${encoded}${suffix}` };
	}

	/** @deprecated Use `buildMemoIdentity`. */
	buildMemoKey(id: string): string {
		return this.buildMemoIdentity(id).cacheKey;
	}

	getMemo(id: string): MemoCacheEntry | undefined {
		return this.memoCache.get(id);
	}

	setMemo(id: string, deps: readonly unknown[], subtree: FrameEntry[]): void {
		this.deleteMemo(id);
		const widgetIds = this.collectSubtreeIds(subtree);
		this.memoCache.set(id, { deps: [...deps], subtree, widgetIds });
		for (const widgetId of widgetIds) {
			let keys = this.memoKeysByWidgetId.get(widgetId);
			if (!keys) {
				keys = new Set<string>();
				this.memoKeysByWidgetId.set(widgetId, keys);
			}
			keys.add(id);
		}
	}

	private deleteMemo(id: string): void {
		const existing = this.memoCache.get(id);
		if (existing) {
			for (const widgetId of existing.widgetIds) {
				const keys = this.memoKeysByWidgetId.get(widgetId);
				keys?.delete(id);
				if (keys?.size === 0) this.memoKeysByWidgetId.delete(widgetId);
			}
		}
		this.memoCache.delete(id);
		this.memoTTL.delete(id);
	}

	private invalidateMemoForWidget(widgetId: string): void {
		const keys = this.memoKeysByWidgetId.get(widgetId);
		if (!keys) return;
		for (const key of [...keys]) this.deleteMemo(key);
	}

	isCapturingMemo(): boolean {
		return this.memoCaptureDepth > 0;
	}

	captureSubtree(memoId: string, drawClosure: () => void): FrameEntry[] {
		const scopeSnapshot = [...this.scopeStack];
		const prefixStackSnapshot = [...this.idPrefixStack];
		const prefixSnapshot = this.idPrefix;
		const contextSnapshot = cloneMapOfArrays(this.contextStack);
		const layerSnapshot = [...this.activeLayerStack];
		const frameRootSnapshot = new Map(this.frameRoot);
		const frameLengths = this.snapshotFrameLengths();
		const collisionSnapshot = new Map(this.collisionCounter);
		const usedSnapshot = new Set(this.usedFinalIds);
		const warnedSnapshot = new Set(this.duplicateWarned);
		const ownedSnapshot = new Set(this.ownedIds);
		const stateSnapshot = new Map(this.stateStore);
		const stateTTLSnapshot = new Map(this.stateTTL);
		const stateRevisionSnapshot = this.stateRevision;
		const memoCacheSnapshot = new Map(this.memoCache);
		const memoKeysByWidgetIdSnapshot = cloneMapOfSets(this.memoKeysByWidgetId);
		const memoTTLSnapshot = new Map(this.memoTTL);
		const memoKeysThisFrameSnapshot = new Set(this.memoKeysThisFrame);
		const dirtySnapshot = this.dirty;
		const detached: FrameEntry = {
			id: `__memo_capture__/${encodeIdSegment(memoId)}`,
			widgetName: "MemoCapture",
			args: [],
			scoped: true,
			children: [],
			defaultState: null,
			renderState: null,
			persistent: false,
			widgetProps: {
				"data-ism-widget": "MemoCapture",
				"data-ism-id": "",
				className: "",
			},
			renderFn: () => null,
		};
		const sentinel: ScopeEntry = {
			id: detached.id,
			label: memoId,
			frameEntry: detached,
			previousIdPrefix: this.idPrefix,
		};

		this.scopeStack.push(sentinel);
		this.memoCaptureDepth++;
		let succeeded = false;
		try {
			drawClosure();
			const scopeBalanced =
				this.scopeStack.length === scopeSnapshot.length + 1 &&
				this.scopeStack[this.scopeStack.length - 1] === sentinel;
			const otherStacksBalanced =
				this.idPrefix === prefixSnapshot &&
				arraysEqual(this.idPrefixStack, prefixStackSnapshot) &&
				mapsOfArraysEqual(this.contextStack, contextSnapshot) &&
				arraysEqual(this.activeLayerStack, layerSnapshot);

			if (!scopeBalanced || !otherStacksBalanced) {
				throw new Error(errors.memoBlockUnbalancedState(memoId));
			}

			succeeded = true;
			return this.cloneSubtree(detached.children);
		} finally {
			this.memoCaptureDepth--;
			this.restoreFrameSnapshot(frameRootSnapshot, frameLengths);
			this.scopeStack = [...scopeSnapshot];
			this.idPrefixStack = [...prefixStackSnapshot];
			this.idPrefix = prefixSnapshot;
			restoreMap(this.contextStack, contextSnapshot);
			this.activeLayerStack = [...layerSnapshot];

			if (!succeeded) {
				restoreMap(this.collisionCounter, collisionSnapshot);
				restoreSet(this.usedFinalIds, usedSnapshot);
				restoreSet(this.duplicateWarned, warnedSnapshot);
				restoreSet(this.ownedIds, ownedSnapshot);
				restoreMap(this.stateStore, stateSnapshot);
				restoreMap(this.stateTTL, stateTTLSnapshot);
				this.stateRevision = stateRevisionSnapshot;
				restoreMap(this.memoCache, memoCacheSnapshot);
				restoreMap(this.memoKeysByWidgetId, memoKeysByWidgetIdSnapshot);
				restoreMap(this.memoTTL, memoTTLSnapshot);
				restoreSet(this.memoKeysThisFrame, memoKeysThisFrameSnapshot);
				this.dirty = dirtySnapshot;
			}
		}
	}

	pushCachedSubtree(subtree: FrameEntry[]): boolean {
		const ids = this.collectSubtreeIds(subtree);
		if (ids.some((id) => this.usedFinalIds.has(id))) return false;
		for (const id of ids) this.reserveId(id);
		this.refreshRenderState(subtree);
		this.getCurrentParentChildren().push(...subtree);
		return true;
	}

	appendCapturedSubtree(subtree: FrameEntry[]): void {
		this.getCurrentParentChildren().push(...subtree);
	}

	setFocus(id: string | null): void {
		if (this.focusedId === id) return;
		this.focusedId = id;
		this.markDirty();
	}

	isFocused(id: string): boolean {
		return this.focusedId === id;
	}

	getFocusedId(): string | null {
		return this.focusedId;
	}

	getTree(): Map<string, FrameEntry[]> {
		return this.frameRoot;
	}

	getStateStore(): Map<string, unknown> {
		return this.stateStore;
	}

	getInspectionRevision(kind: "tree" | "state"): number {
		return kind === "tree" ? this.treeRevision : this.stateRevision;
	}

	pushScope(id: string, label: string, frameEntry: FrameEntry): void {
		this.scopeStack.push({
			id,
			label,
			frameEntry,
			previousIdPrefix: this.idPrefix,
		});
		this.idPrefix = `${id}/`;
	}

	popScope(): void {
		if (this.scopeStack.length === 0) {
			console.error(errors.endWithoutScope());
			return;
		}
		const scope = this.scopeStack.pop();
		this.idPrefix = scope?.previousIdPrefix ?? "";
	}

	acquireFrameEntry(): FrameEntry {
		return this.framePool.acquire();
	}

	getCurrentParentChildren(): FrameEntry[] {
		const scope = this.scopeStack[this.scopeStack.length - 1];
		if (scope) return scope.frameEntry.children;
		const layer = this.getActiveLayer();
		let entries = this.frameRoot.get(layer);
		if (!entries) {
			entries = [];
			this.frameRoot.set(layer, entries);
		}
		return entries;
	}

	pushIdSegment(id: string): void {
		this.idPrefixStack.push(this.idPrefix);
		this.idPrefix = `${this.idPrefix}${encodeIdSegment(id)}/`;
	}

	popIdSegment(): void {
		if (this.idPrefixStack.length === 0) {
			console.warn(errors.popIdEmpty());
			return;
		}
		this.idPrefix = this.idPrefixStack.pop() ?? "";
	}

	markDirty(): void {
		if (this.dirty) return;
		this.dirty = true;
		if (!this.rerenderFn) return;
		const trigger = this.rerenderFn;
		const lifecycleToken = this.lifecycleToken;
		queueMicrotask(() => {
			if (
				this.rerenderFn === trigger &&
				this.lifecycleToken === lifecycleToken &&
				this.dirty
			) {
				trigger();
			}
		});
	}

	private computeTreeFingerprint(): string {
		let firstHash = 0x811c9dc5;
		let secondHash = 0x9e3779b9;
		let nodeCount = 0;
		const mix = (value: string) => {
			for (let index = 0; index < value.length; index++) {
				const code = value.charCodeAt(index);
				firstHash = Math.imul(firstHash ^ code, 0x01000193);
				secondHash = Math.imul(secondHash ^ code, 0x85ebca6b);
			}
		};
		const visit = (entries: FrameEntry[]) => {
			mix("[");
			for (const entry of entries) {
				nodeCount++;
				mix(entry.id);
				visit(entry.children);
			}
			mix("]");
		};

		for (const [layer, entries] of this.frameRoot) {
			mix("<");
			mix(layer);
			visit(entries);
			mix(">");
		}

		return `${nodeCount}:${firstHash >>> 0}:${secondHash >>> 0}`;
	}

	private reserveId(id: string): void {
		this.usedFinalIds.add(id);
		this.ownedIds.add(id);
	}

	private collectIds(entries: FrameEntry[], ids: Set<string>): void {
		for (const entry of entries) {
			ids.add(entry.id);
			this.collectIds(entry.children, ids);
		}
	}

	private collectSubtreeIds(entries: FrameEntry[]): string[] {
		const ids: string[] = [];
		const visit = (nodes: FrameEntry[]) => {
			for (const node of nodes) {
				ids.push(node.id);
				visit(node.children);
			}
		};
		visit(entries);
		return ids;
	}

	private refreshRenderState(entries: FrameEntry[]): void {
		for (const entry of entries) {
			if (this.stateStore.has(entry.id))
				entry.renderState = this.stateStore.get(entry.id);
			this.refreshRenderState(entry.children);
		}
	}

	private cloneSubtree(entries: FrameEntry[]): FrameEntry[] {
		return entries.map((entry) => ({
			...entry,
			args: [...entry.args],
			widgetProps: { ...entry.widgetProps },
			children: this.cloneSubtree(entry.children),
		}));
	}

	private snapshotFrameLengths(): Map<FrameEntry[], number> {
		const snapshot = new Map<FrameEntry[], number>();
		const visit = (entries: FrameEntry[]) => {
			snapshot.set(entries, entries.length);
			for (const entry of entries) visit(entry.children);
		};
		for (const entries of this.frameRoot.values()) visit(entries);
		return snapshot;
	}

	private restoreFrameSnapshot(
		rootSnapshot: Map<string, FrameEntry[]>,
		lengthSnapshot: Map<FrameEntry[], number>,
	): void {
		for (const [entries, length] of lengthSnapshot) entries.length = length;
		restoreMap(this.frameRoot, rootSnapshot);
	}
}

export function extractDisplayLabel(label: string): string {
	const tripleHashIndex = label.indexOf("###");
	if (tripleHashIndex !== -1) return label.slice(0, tripleHashIndex);
	const doubleHashIndex = label.indexOf("##");
	return doubleHashIndex === -1 ? label : label.slice(0, doubleHashIndex);
}

let activeRuntime: Runtime | null = null;
export const mountedRuntimes = new Set<Runtime>();

const MAX_CROSS_RUNTIME_WARNINGS = 256;
const crossRuntimeCollisionWarned = new Set<string>();

function rememberCrossRuntimeWarning(id: string): boolean {
	if (crossRuntimeCollisionWarned.has(id)) return false;
	if (crossRuntimeCollisionWarned.size >= MAX_CROSS_RUNTIME_WARNINGS) {
		const oldest = crossRuntimeCollisionWarned.values().next().value as
			| string
			| undefined;
		if (oldest !== undefined) crossRuntimeCollisionWarned.delete(oldest);
	}
	crossRuntimeCollisionWarned.add(id);
	return true;
}

export function getRuntimeForId(id: string): Runtime | undefined {
	let match: Runtime | undefined;
	for (const runtime of mountedRuntimes) {
		if (!runtime.ownsId(id)) continue;
		if (!match) {
			match = runtime;
			continue;
		}
		if (rememberCrossRuntimeWarning(id)) {
			console.warn(
				`[ism] Multiple mounted apps produced the same widget id ('${id}'). ` +
					"Ids are unique within one createApp root, but routing for this id across roots is ambiguous.",
			);
		}
		break;
	}
	if (!match) crossRuntimeCollisionWarned.delete(id);
	return match;
}

export function getRuntimeByInstanceId(
	instanceId: string,
): Runtime | undefined {
	for (const runtime of mountedRuntimes) {
		if (runtime.getInstanceId() === instanceId) return runtime;
	}
	return undefined;
}

if (typeof window !== "undefined") {
	const win = window as unknown as Record<string, unknown>;
	const existing =
		typeof win.__ISM_DEVTOOLS__ === "object" && win.__ISM_DEVTOOLS__ !== null
			? (win.__ISM_DEVTOOLS__ as Record<string, unknown>)
			: {};
	win.__ISM_DEVTOOLS__ = { ...existing, getRuntimes: () => mountedRuntimes };
}

export function getActiveRuntime(): Runtime {
	if (!activeRuntime) throw new Error(errors.noActiveRuntime());
	return activeRuntime;
}

export function getActiveRuntimeOrNull(): Runtime | null {
	return activeRuntime;
}

export function setActiveRuntime(runtime: Runtime | null): void {
	activeRuntime = runtime;
}

export function withRuntime<T>(runtime: Runtime, fn: () => T): T {
	const previous = activeRuntime;
	activeRuntime = runtime;
	try {
		return fn();
	} finally {
		activeRuntime = previous;
	}
}
