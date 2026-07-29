import * as errors from "./errors";
import type { FrameEntry, StorageAdapter } from "./types";

/**
 * Tracks an open scoped widget (e.g., Collapsing, Window).
 * Scopes nest: children are appended to the innermost scope's FrameEntry.
 */
interface ScopeEntry {
	id: string;
	label: string;
	frameEntry: FrameEntry;
}

/**
 * Object pool for zero-allocation FrameEntry nodes.
 */
class FramePool {
	private pool: FrameEntry[] = [];
	private index = 0;

	reset(): void {
		this.index = 0;
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
		return entry;
	}
}

/**
 * The immediate-mode runtime engine.
 *
 * Manages widget state persistence, the ID stack for scoping,
 * the per-frame widget tree (frame buffer), and scheduling re-renders
 * through a registered React trigger.
 *
 * There is exactly one Runtime instance per application (singleton).
 */
export class Runtime {
	/** Optional persistence backend */
	private storage: StorageAdapter | null;

	/** Widget state persisted across frames, keyed by composite ID */
	private stateStore = new Map<string, unknown>();

	/** Context stack for implicit state down the widget tree */
	private contextStack = new Map<string, unknown[]>();

	/** Cache for memoBlock subtrees */
	private memoCache = new Map<
		string,
		{ deps: unknown[]; subtree: FrameEntry[] }
	>();

	/** TTL for graceful memoBlock cache exits (memoKey -> expiry timestamp ms) */
	private memoTTL = new Map<string, number>();

	/** memoBlock keys touched during the current frame (for TTL-based GC) */
	private memoKeysThisFrame = new Set<string>();

	/** ID stack for pushId/popId scoping */
	private idStack: string[] = [];

	/** Cached string prefix derived from idStack to avoid .join("/") on every widget call */
	private idPrefix = "";

	/** Per-frame collision counter: how many times each raw ID has appeared */
	private collisionCounter = new Map<string, number>();

	/** Raw IDs that have already emitted a duplicate warning this frame */
	private duplicateWarned = new Set<string>();

	/** Current frame's root-level entries, partitioned by layer */
	private frameRoot = new Map<string, FrameEntry[]>();

	/** The stack of active layers. Defaults to ["default"] */
	private activeLayerStack: string[] = ["default"];

	/** Globally tracked focused widget ID */
	private focusedId: string | null = null;

	/**
	 * Composite ids (including hand-registered sub-ids, see
	 * {@link registerExternalId}) owned by *this* runtime instance.
	 *
	 * Previously this bookkeeping lived in a single module-level
	 * `idOwnerRuntime` map shared by every `Runtime` on the page. Because id
	 * composition is purely content-based (stack prefix + widget name +
	 * label) with no per-runtime namespace, two independent `createApp()`
	 * roots with structurally similar draw functions could produce the same
	 * composite id, and the shared map meant whichever runtime drew last
	 * silently stole ownership from the other -- with no warning. Keeping
	 * this set per-instance means each runtime's own bookkeeping can never be
	 * corrupted by another runtime; see {@link getRuntimeForId} for how
	 * lookups across instances are now resolved.
	 */
	private ownedIds = new Set<string>();

	/** Object pool to prevent allocating FrameEntry objects every frame */
	private framePool = new FramePool();

	/** TTL for graceful state exits (id -> expiry timestamp ms) */
	private stateTTL = new Map<string, number>();
	private static readonly GC_TTL_MS = 1000; // Keep state alive for 1s after unmounting

	/** Stack of open scoped widgets for end() matching */
	private scopeStack: ScopeEntry[] = [];

	/** Whether we're inside a beginFrame/endFrame pass */
	private drawing = false;

	/** Registered React re-render trigger */
	private rerenderFn: (() => void) | null = null;

	/** Whether a re-render has been requested but not yet processed */
	private dirty = false;

	/** Whether an app component is currently mounted */
	private appMounted = false;

	constructor(storage?: StorageAdapter) {
		this.storage = storage ?? null;
	}

	// --- App lifecycle ---

	/**
	 * Register the React re-render trigger. Called by createApp on mount.
	 * Each Runtime instance supports exactly one registered trigger at a time
	 * (one per createApp() root). Multiple Runtime instances -- i.e. multiple
	 * createApp() roots on the same page -- are supported simultaneously and
	 * are tracked in {@link mountedRuntimes}.
	 */
	registerApp(rerenderFn: () => void): void {
		this.appMounted = true;
		this.rerenderFn = rerenderFn;
		mountedRuntimes.add(this);
	}

	/**
	 * Deregister the app and clear all state. Called by createApp on unmount.
	 */
	unregisterApp(): void {
		this.appMounted = false;
		this.rerenderFn = null;
		this.stateStore.clear();
		this.idStack = [];
		this.idPrefix = "";
		this.collisionCounter.clear();
		this.duplicateWarned.clear();
		this.frameRoot.clear();
		this.activeLayerStack = ["default"];
		this.framePool.reset();
		this.stateTTL.clear();
		this.memoCache.clear();
		this.memoTTL.clear();
		this.memoKeysThisFrame.clear();
		this.contextStack.clear();
		this.scopeStack.length = 0;
		this.focusedId = null;
		this.drawing = false;
		this.dirty = false;
		this.ownedIds.clear();
		mountedRuntimes.delete(this);
	}

	/**
	 * Whether an app is currently mounted.
	 */
	isAppMounted(): boolean {
		return this.appMounted;
	}

	// --- Frame lifecycle ---

	/**
	 * Start a new frame. Clears the frame buffer and per-frame counters.
	 * Must be paired with endFrame().
	 */
	beginFrame(): void {
		this.drawing = true;
		this.frameRoot.clear();
		this.activeLayerStack = ["default"];
		this.framePool.reset();
		this.collisionCounter.clear();
		this.duplicateWarned.clear();
		this.scopeStack.length = 0;
		this.idStack.length = 0;
		this.idPrefix = "";
		this.contextStack.clear();
		this.memoKeysThisFrame.clear();
		this.dirty = false;
	}

	/**
	 * End the current frame. Validates scope closure and garbage-collects
	 * state for widgets that disappeared since the previous frame.
	 */
	endFrame(): void {
		// Validate all scopes were closed
		if (this.scopeStack.length > 0) {
			const unclosed = this.scopeStack.map((s) => s.label);
			console.error(errors.unclosedScopes(unclosed));
		}

		// Collect current frame's IDs
		const currentIds = new Set<string>();
		for (const entries of this.frameRoot.values()) {
			this.collectIds(entries, currentIds);
		}

		// TTL-based GC: allow graceful state exits (e.g. for AnimatePresence)
		const now = Date.now();
		for (const [id, expiry] of this.stateTTL.entries()) {
			if (currentIds.has(id)) {
				this.stateTTL.set(id, now + Runtime.GC_TTL_MS);
			} else if (now > expiry) {
				this.stateStore.delete(id);
				this.stateTTL.delete(id);
				if (this.focusedId === id) {
					this.focusedId = null;
				}
				this.ownedIds.delete(id);
			}
		}

		// Initialize TTL for new IDs
		for (const id of currentIds) {
			if (!this.stateTTL.has(id)) {
				this.stateTTL.set(id, now + Runtime.GC_TTL_MS);
			}
		}

		// TTL-based GC for memoBlock's subtree cache. Without this, memoBlock
		// calls keyed by a dynamic id (e.g. a list item id inside pushId)
		// accumulate in memoCache forever once that item is removed --
		// captureSubtree/setMemo have no other eviction path, so a long-lived
		// app with a changing list leaks one cache entry (deps + a cloned
		// FrameEntry subtree) per removed item. Mirrors the stateStore GC above.
		for (const [key, expiry] of this.memoTTL.entries()) {
			if (this.memoKeysThisFrame.has(key)) {
				this.memoTTL.set(key, now + Runtime.GC_TTL_MS);
			} else if (now > expiry) {
				this.memoCache.delete(key);
				this.memoTTL.delete(key);
			}
		}
		for (const key of this.memoKeysThisFrame) {
			if (!this.memoTTL.has(key)) {
				this.memoTTL.set(key, now + Runtime.GC_TTL_MS);
			}
		}

		this.drawing = false;
	}

	/**
	 * Whether we're currently inside a draw pass.
	 */
	isDrawing(): boolean {
		return this.drawing;
	}

	/**
	 * Get the current frame buffer (root-level entries) keyed by layer.
	 */
	getFrameBuffer(): Map<string, FrameEntry[]> {
		return this.frameRoot;
	}

	// --- Widget state ---

	/**
	 * Look up or initialize persistent state for a widget by ID.
	 * If no state exists, a deep clone of defaultState is stored and returned.
	 */
	getState<S>(id: string, defaultState: S, persistent: boolean = false): S {
		if (!this.stateStore.has(id)) {
			let initialState: S;
			try {
				initialState = structuredClone(defaultState);
			} catch (err) {
				throw new Error(
					errors.defaultStateCloneFailure(id, errors.getErrorMessage(err)),
				);
			}
			if (persistent && this.storage) {
				const stored = this.storage.get(id);
				if (stored !== undefined && stored !== null) {
					initialState = stored as S;
				} else {
					this.storage.set(id, initialState);
				}
			}
			this.stateStore.set(id, initialState);
		}
		return this.stateStore.get(id) as S;
	}

	/**
	 * Update persistent state for a widget by ID.
	 * Accepts a direct value or an updater function (prev => next).
	 * Triggers a re-render via markDirty().
	 */
	setState(id: string, updater: unknown, persistent: boolean = false): void {
		const current = this.stateStore.get(id);
		const next =
			typeof updater === "function"
				? (updater as (prev: unknown) => unknown)(current)
				: updater;
		this.stateStore.set(id, next);

		if (persistent && this.storage) {
			this.storage.set(id, next);
		}

		this.markDirty();
	}

	// --- ID system ---

	/**
	 * Build a composite ID from the current ID stack, widget name, and label.
	 *
	 * ID composition rules:
	 * - Stack prefix: all pushId values joined with "/"
	 * - Widget name: always included for type-level disambiguation
	 * - Label handling:
	 *   - "Label##suffix" -> full string used as-is (display is "Label")
	 *   - "Label###stableId" -> only "stableId" used for ID (display is "Label")
	 *   - "Label" -> used as-is
	 *   - undefined -> widget name used as fallback
	 * - Collision: second occurrence of the same raw ID gets "__2" appended (with warning)
	 */
	buildId(widgetName: string, label: string | undefined): string {
		let idPart: string;

		if (label !== undefined) {
			// ### convention: only text after ### is the ID
			const tripleHashIdx = label.indexOf("###");
			if (tripleHashIdx !== -1) {
				idPart = label.substring(tripleHashIdx + 3);
			} else {
				// ## convention (or no hash): full string is the ID
				idPart = label;
			}
		} else {
			// No label: use widget name as ID component
			idPart = widgetName;
		}

		// Compose: stack/WidgetName/idPart
		const rawId = `${this.idPrefix}${widgetName}/${idPart}`;

		// Collision detection and auto-disambiguation
		const count = this.collisionCounter.get(rawId) ?? 0;
		this.collisionCounter.set(rawId, count + 1);

		if (count > 0) {
			if (!this.duplicateWarned.has(rawId) && label !== undefined) {
				const displayLabel = extractDisplayLabel(label);
				console.warn(errors.duplicateId(widgetName, displayLabel));
				this.duplicateWarned.add(rawId);
			}
			const collidedId = `${rawId}__${count + 1}`;
			this.ownedIds.add(collidedId);
			return collidedId;
		}

		this.ownedIds.add(rawId);
		return rawId;
	}

	/**
	 * Register a hand-constructed id (not produced by {@link buildId}) as
	 * owned by this runtime, so code that looks up ownership by id (e.g.
	 * `makeInteractive`'s focus/blur routing via {@link getRuntimeForId})
	 * can resolve it. Intended for widgets that build compound sub-element
	 * ids of their own (e.g. `${id}/tab/${tab}`) that don't correspond to a
	 * separate widget instance and so never go through `buildId`.
	 *
	 * Idempotent -- safe to call every render.
	 */
	registerExternalId(id: string): void {
		this.ownedIds.add(id);
	}

	/** Whether this runtime instance currently owns (has registered) `id`. */
	ownsId(id: string): boolean {
		return this.ownedIds.has(id);
	}

	// --- Environment Context Stack ---

	/**
	 * Push a value onto a specific context stack key.
	 */
	pushContext<T>(key: string, value: T): void {
		let stack = this.contextStack.get(key);
		if (!stack) {
			stack = [];
			this.contextStack.set(key, stack);
		}
		stack.push(value);
	}

	/**
	 * Pop the most recent value from a specific context stack key.
	 */
	popContext(key: string): void {
		const stack = this.contextStack.get(key);
		if (!stack || stack.length === 0) {
			console.warn(errors.unbalancedPopContext(key));
			return;
		}
		stack.pop();
	}

	/**
	 * Get the current active value for a specific context stack key.
	 */
	getContext<T>(key: string): T | undefined {
		const stack = this.contextStack.get(key);
		if (!stack || stack.length === 0) {
			return undefined;
		}
		return stack[stack.length - 1] as T;
	}

	// --- Layers ---

	/**
	 * Push a layer onto the layer stack. All subsequent root-level widgets
	 * will be rendered into this layer (useful for modals/tooltips).
	 */
	pushLayer(layerName: string): void {
		this.activeLayerStack.push(layerName);
	}

	/**
	 * Pop the most recent layer from the stack.
	 */
	popLayer(): void {
		if (this.activeLayerStack.length <= 1) {
			console.warn(errors.popDefaultLayer());
			return;
		}
		this.activeLayerStack.pop();
	}

	/**
	 * Get the current active layer.
	 */
	getActiveLayer(): string {
		return this.activeLayerStack[this.activeLayerStack.length - 1] ?? "default";
	}

	// --- Memoization ---

	getMemo(id: string): { deps: unknown[]; subtree: FrameEntry[] } | undefined {
		return this.memoCache.get(id);
	}

	setMemo(id: string, deps: unknown[], subtree: FrameEntry[]): void {
		this.memoCache.set(id, { deps, subtree });
	}

	/**
	 * Build a stable cache key for a memoBlock.
	 *
	 * Uses the current ID stack as a namespace prefix but bypasses
	 * `buildId` and the collision counter entirely. Memo blocks are
	 * not widgets and must not participate in duplicate-ID detection
	 * or conflict with a user widget named "MemoBlock".
	 */
	buildMemoKey(id: string): string {
		const key = `${this.idPrefix}__memo__/${id}`;
		this.memoKeysThisFrame.add(key);
		return key;
	}

	/**
	 * Deep clone a subtree of FrameEntries so it is detached from the FramePool
	 */
	private cloneSubtree(entries: FrameEntry[]): FrameEntry[] {
		return entries.map((entry) => ({
			...entry,
			args: [...entry.args],
			widgetProps: { ...entry.widgetProps },
			children: this.cloneSubtree(entry.children),
		}));
	}

	captureSubtree(memoId: string, drawClosure: () => void): FrameEntry[] {
		const scopeDepthBefore = this.scopeStack.length;
		const parentChildren = this.getCurrentParentChildren();
		const startIndex = parentChildren.length;

		drawClosure();

		if (this.scopeStack.length !== scopeDepthBefore) {
			console.error(errors.memoBlockUnbalancedScope(memoId));
		}

		// Re-fetch: if the closure left an extra scope open, parentChildren
		// (captured before drawClosure ran) is no longer the array new entries
		// were actually pushed into. This can't fully recover a correct
		// capture, but it avoids silently slicing the wrong array.
		const currentParentChildren = this.getCurrentParentChildren();
		const captured =
			currentParentChildren === parentChildren
				? parentChildren.slice(startIndex, currentParentChildren.length)
				: [];

		return this.cloneSubtree(captured);
	}

	/**
	 * Push a previously-captured, cloned subtree into the current frame.
	 *
	 * These entries are plain (non-pooled) objects created once by
	 * {@link captureSubtree} and never mutated afterward by anything in the
	 * runtime (render/consume only read FrameEntry fields), so they're safe
	 * to reuse by reference across every frame that hits the memo cache --
	 * no extra clone needed here.
	 */
	pushCachedSubtree(subtree: FrameEntry[]): void {
		const parentChildren = this.getCurrentParentChildren();
		parentChildren.push(...subtree);
	}

	// --- Focus Management ---

	setFocus(id: string | null): void {
		if (this.focusedId !== id) {
			this.focusedId = id;
			this.markDirty();
		}
	}

	isFocused(id: string): boolean {
		return this.focusedId === id;
	}

	getFocusedId(): string | null {
		return this.focusedId;
	}

	// --- DevTools Inspector ---

	getTree(): Map<string, FrameEntry[]> {
		return this.frameRoot;
	}

	getStateStore(): Map<string, unknown> {
		return this.stateStore;
	}

	// --- Scoping ---

	/**
	 * Push a scope onto the scope stack. Called by scoped widgets.
	 * Subsequent widget registrations become children of this scope's FrameEntry.
	 * Also pushes the scope's ID onto the ID stack for nested ID composition.
	 */
	pushScope(id: string, label: string, frameEntry: FrameEntry): void {
		this.scopeStack.push({ id, label, frameEntry });
		this.idStack.push(id);
	}

	/**
	 * Pop the innermost scope. Called by end().
	 * Pops both the scope stack and the ID stack.
	 */
	popScope(): void {
		if (this.scopeStack.length === 0) {
			console.error(errors.endWithoutScope());
			return;
		}
		this.scopeStack.pop();
		this.idStack.pop();
	}

	/**
	 * Acquire a pooled FrameEntry for zero-allocation rendering.
	 */
	acquireFrameEntry(): FrameEntry {
		return this.framePool.acquire();
	}

	/**
	 * Get the children array of the innermost open scope.
	 * If no scopes are open, returns the root frame buffer for the active layer.
	 */
	getCurrentParentChildren(): FrameEntry[] {
		if (this.scopeStack.length === 0) {
			const activeLayer = this.getActiveLayer();
			let entries = this.frameRoot.get(activeLayer);
			if (!entries) {
				entries = [];
				this.frameRoot.set(activeLayer, entries);
			}
			return entries;
		}
		const topScope = this.scopeStack[this.scopeStack.length - 1];
		return topScope ? topScope.frameEntry.children : [];
	}

	// --- ID stack (pushId / popId) ---

	/**
	 * Push an ID segment onto the stack.
	 * All widgets registered while this segment is on the stack
	 * will have it as a prefix in their composite IDs.
	 */
	pushIdSegment(id: string): void {
		this.idStack.push(id);
		this.idPrefix = `${this.idStack.join("/")}/`;
	}

	/**
	 * Pop the most recent ID segment from the stack.
	 */
	popIdSegment(): void {
		if (this.idStack.length === 0) {
			console.warn(errors.popIdEmpty());
			return;
		}
		this.idStack.pop();
		this.idPrefix = this.idStack.length > 0 ? `${this.idStack.join("/")}/` : "";
	}

	// --- Scheduling ---

	/**
	 * Signal that the UI needs a re-render.
	 * Calls the registered React trigger. No-ops if already dirty.
	 */
	markDirty(): void {
		if (this.dirty) return;
		this.dirty = true;
		if (this.rerenderFn) {
			const trigger = this.rerenderFn;
			// Always defer to a microtask. Calling a React dispatch
			// synchronously during render or a useEffect flush causes
			// "Too many re-renders". The microtask runs after React
			// finishes its current work, which is always safe.
			Promise.resolve().then(() => {
				if (this.rerenderFn) trigger();
			});
		}
	}

	// --- Transient state consumption ---

	/**
	 * Walk the current frame buffer and call consumeStateFn on each widget
	 * that defines one. This resets one-shot event flags (e.g., "clicked").
	 * Called by the React bridge after DOM commit (in useEffect).
	 */
	consumeTransientState(): void {
		for (const entries of this.frameRoot.values()) {
			this.consumeEntries(entries);
		}
	}

	// --- Internals ---

	private collectIds(entries: FrameEntry[], ids: Set<string>): void {
		for (const entry of entries) {
			ids.add(entry.id);
			this.collectIds(entry.children, ids);
		}
	}

	private consumeEntries(entries: FrameEntry[]): void {
		for (const entry of entries) {
			if (entry.consumeStateFn) {
				const currentState = this.stateStore.get(entry.id);
				if (currentState !== undefined) {
					const nextState = entry.consumeStateFn(currentState);
					this.stateStore.set(entry.id, nextState);
					// setState() writes through to storage for persistent widgets;
					// this automatic per-frame reset must do the same, or a
					// persistent widget's saved value silently drifts from what's
					// actually in memory every time its consumeState fires.
					if (entry.persistent && this.storage) {
						this.storage.set(entry.id, nextState);
					}
				}
			}
			this.consumeEntries(entry.children);
		}
	}
}

/**
 * Extract the display label from a raw label string.
 * Strips ## and ### suffixes for display purposes.
 *
 * Examples:
 * - "Delete##item_3" -> "Delete"
 * - "Score###player_hp" -> "Score"
 * - "Hello world" -> "Hello world"
 */
export function extractDisplayLabel(label: string): string {
	const tripleHashIdx = label.indexOf("###");
	if (tripleHashIdx !== -1) {
		return label.substring(0, tripleHashIdx);
	}
	const doubleHashIdx = label.indexOf("##");
	if (doubleHashIdx !== -1) {
		return label.substring(0, doubleHashIdx);
	}
	return label;
}

let activeRuntime: Runtime | null = null;
/**
 * Global set of all mounted runtimes on the page.
 * @since 2.0.0
 */
export const mountedRuntimes = new Set<Runtime>();

/** Ids for which a cross-runtime collision warning has already been logged. */
const crossRuntimeCollisionWarned = new Set<string>();

/**
 * Look up which Runtime instance owns a given composite widget id, if any.
 * Returns undefined if the id is unknown to every mounted runtime, or has
 * been garbage-collected.
 *
 * Used by code that needs to act on "the widget with this id" (e.g. focus
 * management) without broadcasting to every mounted runtime on the page,
 * which would be both wasteful and incorrect if two separate apps ever
 * happen to produce the same composite id.
 *
 * Ownership is tracked per-runtime (see `Runtime#ownedIds`), not in a single
 * shared map, so one runtime can never silently overwrite another's
 * ownership record. Because id composition is purely content-based (with no
 * per-runtime namespace), it *is* still possible -- if unlikely -- for two
 * independent `createApp()` roots to legitimately produce the same
 * composite id. In that rare case this function logs a one-time warning
 * (rather than silently picking a "winner") and returns the first match, so
 * routing degrades explicitly instead of failing silently.
 *
 * @internal
 */
export function getRuntimeForId(id: string): Runtime | undefined {
	let match: Runtime | undefined;
	for (const runtime of mountedRuntimes) {
		if (runtime.ownsId(id)) {
			if (match === undefined) {
				match = runtime;
			} else {
				if (!crossRuntimeCollisionWarned.has(id)) {
					crossRuntimeCollisionWarned.add(id);
					console.warn(
						`[ism] Multiple mounted apps produced the same widget id ('${id}'). ` +
							"Ids are only guaranteed unique within a single createApp() root -- " +
							"routing (e.g. focus tracking) for this id is ambiguous and will " +
							"resolve to whichever app happened to be checked first.",
					);
				}
				break;
			}
		}
	}
	return match;
}

// Expose devtools hook
if (typeof window !== "undefined") {
	const win = window as unknown as Record<string, unknown>;
	const existing = (
		typeof win.__ISM_DEVTOOLS__ === "object" && win.__ISM_DEVTOOLS__ !== null
			? win.__ISM_DEVTOOLS__
			: {}
	) as Record<string, unknown>;
	win.__ISM_DEVTOOLS__ = {
		...existing,
		getRuntimes: () => mountedRuntimes,
	};
}

export function getActiveRuntime(): Runtime {
	if (!activeRuntime) {
		throw new Error(errors.noActiveRuntime());
	}
	return activeRuntime;
}

/**
 * Like {@link getActiveRuntime}, but returns `null` instead of throwing
 * when no runtime is currently active (e.g. outside any draw pass).
 *
 * Used by API functions that have a legitimate reason to be called outside
 * a draw pass -- from a DOM event handler or an async callback -- and need
 * to fall back to some other strategy (routing by id ownership, or
 * broadcasting to every mounted runtime) instead of failing outright.
 *
 * @internal
 */
export function getActiveRuntimeOrNull(): Runtime | null {
	return activeRuntime;
}

export function setActiveRuntime(runtime: Runtime | null): void {
	activeRuntime = runtime;
}

/**
 * Execute `fn` with `runtime` as the active context, then restore
 * the previous active runtime.
 *
 * This is safe for nested calls (e.g., memoBlock's captureSubtree
 * invoking widget code): the previous runtime is always restored,
 * even if `fn` throws.
 *
 * @internal. Used by createApp only.
 */
export function withRuntime<T>(runtime: Runtime, fn: () => T): T {
	const prev = activeRuntime;
	activeRuntime = runtime;
	try {
		return fn();
	} finally {
		activeRuntime = prev;
	}
}
