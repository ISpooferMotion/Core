# Core Library AI Knowledge Base & Integration Manual

> **Package:** `@ispoofermotion/core`
> **Version:** `4.2.0`
> **Target Environment:** Node.js `>=22`, React `>=18 <20`, Modern Browsers, Tauri, Vite, Next.js / Bundlers
> **Module Types:** Dual ESM (`dist/index.js`) and CommonJS (`dist/index.cjs`) with complete TypeScript declarations (`dist/index.d.ts`, `dist/index.d.cts`)

---

## 1. System Overview & Architectural Mental Model

`@ispoofermotion/core` is an **immediate-mode UI runtime designed for React applications**, with explicit architectural affordances for desktop containers like **Tauri**.

### The Immediate-Mode Abstraction in React

Traditional React code is *retained-mode*: the UI hierarchy is declared as a tree of persistent JSX elements, and state mutations trigger reconciliation across virtual DOM nodes.

In `@ispoofermotion/core`, UI declarations happen imperatively inside a synchronous **`draw` function** executed on every frame:

```text
Consuming App / UI
       │
       ▼ (invokes declarative-style widget functions imperatively)
  drawFn()
       │
       ▼ (records FrameEntry records into active transaction buffer)
   Runtime (Frame Transaction: beginFrame -> prepareFrame -> commitFrame)
       │
       ▼ (produces frame buffer: Map<layerName, FrameEntry[]>)
ISMCoreRenderer (React Host Layer)
       │
       ▼ (reconciles widgets into real DOM nodes & manages focus / a11y)
  DOM / Screen
```

1. **The Draw Function:** Developers write a synchronous function (e.g., `() => { if (Button("Click me")) count++; }`).
2. **Transactional Frame Pipeline:** Each frame run begins with `runtime.beginFrame()`. Widget calls populate an active `workingFrameRoot`. At the end of the frame, `prepareFrame()` evaluates scopes and prunes expired state, followed by `commitFrame()` which writes pending persistent mutations to storage and schedules a React render.
3. **Immediate Return Values:** Widgets return their live interaction states (e.g., boolean `true` on click, current text value on input) during the very frame in which the event was committed.
4. **State Separation:** Widget state is held by Core's internal `stateStore` in the `Runtime` instance, decoupled from React component lifecycle.
5. **Decoupled Inspector:** An isolated DevTools overlay exposes tree and state inspections without polluting consumer bundles.

---

## 2. Public API Inventory

### Main Package Exports (`@ispoofermotion/core`)

#### `createApp(drawFn: () => void, options?: AppOptions): IsmApp`
* **Module:** `createApp.tsx`
* **Purpose:** High-level entry point. Wraps a synchronous immediate-mode `draw` function into a standard React functional component that also implements `AppHandle`.
* **Parameters:**
  * `drawFn: () => void` *(Required)*: The user-defined drawing routine. Must be synchronous. Must not call React hooks directly (except `useReactContext` outside `memoBlock`).
  * `options?: AppOptions` *(Optional)*: Configuration object for storage, layers, strictness, and diagnostics.
* **Returns:** `IsmApp` — a callable React functional component augmented with `AppHandle` methods (`markDirty`, `setFocus`, `isFocused`, `getFocusedId`, `resetState`, `clearPersistentState`, `clearStorageNamespace`).
* **Side Effects:** Creates internal `Runtime` instances for each mount, registers the root to `mountedRuntimes`, and handles frame transactions.
* **Lifecycle:** When mounted in React, sets up an `ISMCoreErrorBoundary` and begins the frame loop. When unmounted, cleans up its runtime and schedules microtask state pruning.

#### `defineWidget<S, A extends unknown[], R>(config: WidgetConfig<S, A, R>): (...args: A) => R`
* **Module:** `defineWidget.ts`
* **Purpose:** Defines a reusable widget function for use within the `draw` function.
* **Parameters:**
  * `config: WidgetConfig<S, A, R>` *(Required)*:
    * `name: string`: Alphanumeric widget identifier (must match `/^[A-Za-z][A-Za-z0-9_-]*$/`).
    * `defaultState: S`: Initial state. Must pass structured-clone validation (no functions, DOM nodes, or unsupported prototypes).
    * `render: (props: WidgetRenderProps<S, A>) => ReactNode`: React rendering function executed when widgets are committed to screen.
    * `getReturnValue: (state: S, ...args: A) => R`: Extracts the immediate return value for the caller.
    * `consumeState?: (state: S) => S`: Optional callback to reset transient one-shot actions (e.g., clearing `clicked: true` to `false`).
    * `scoped?: boolean`: If `true`, the widget opens an ID/nesting scope that must be closed with `end()`.
    * `persistent?: boolean`: If `true`, widget state persists across app reloads via configured `StorageAdapter`.
    * `getLabel?: (...args: A) => string | undefined`: Derives the disambiguating label from arguments.
    * `a11y?: WidgetA11y<A>`: Accessibility roles, labels, and description metadata.
* **Returns:** A callable function `(...args: A) => R` that can only be invoked inside an active `draw` pass.

#### `memoBlock(id: string, deps: readonly unknown[], drawClosure: () => void): void`
* **Module:** `index.ts`
* **Purpose:** Memoizes an immediate-mode subtree. If `deps` are shallowly equal (compared via `Object.is`), skips running `drawClosure` and replays the cached frame entries.
* **Parameters:**
  * `id: string`: Stable identifier segment for the memo block within its parent scope.
  * `deps: readonly unknown[]`: Dependency array.
  * `drawClosure: () => void`: Immediate-mode drawing routine to cache.
* **Caveats:** Calling `useReactContext` inside `drawClosure` throws `ISM_REACT_CONTEXT_IN_MEMO`. Read contexts outside `memoBlock` and pass them into `deps`.

#### `makeInteractive(onClick: () => void, options?: InteractiveOptions): InteractiveProps`
* **Module:** `makeInteractive.ts`
* **Purpose:** Utility helper for custom widgets. Adds standard keyboard accessibility (`Enter` and `Space` activation) and pointer events to custom interactive elements.
* **Features:** Tracks `currentTarget` across component re-renders using internal `WeakSet` references, ensuring Space keypresses spanning multiple frames fire properly on `keyup`.

#### Identification & Scoping APIs
* **`pushId(id: string): void`**: Pushes an arbitrary string segment onto the hierarchical ID stack.
* **`popId(): void`**: Pops the top segment off the ID stack. Throws `ISM_POP_ID_EMPTY` if called on an empty stack.
* **`withId<T>(id: string, drawClosure: () => T): T`**: Scoped helper wrapping `pushId` / `popId` in a `try...finally` block. Returns the result of `drawClosure`.
* **`end(): void`**: Closes the current scoped widget subtree (for widgets defined with `scoped: true`). Throws `ISM_END_WITHOUT_SCOPE` if no scope is open.

#### Layering APIs
* **`pushLayer(layerName: string): void`**: Directs subsequent widget emissions to `layerName` (e.g., `"overlay"`, `"tooltip"`, `"modal"`).
* **`popLayer(): void`**: Pops the top layer. Throws `ISM_POP_DEFAULT_LAYER` if attempting to pop the base `"default"` layer.
* **`withLayer<T>(layerName: string, drawClosure: () => T): T`**: Scoped helper wrapping `pushLayer` / `popLayer` in `try...finally`.

#### Immediate-Mode Context APIs
* **`pushContext<T>(key: string, value: T): void`**: Pushes an ambient value to the draw stack for `key`.
* **`popContext(key: string): void`**: Pops the most recent value for `key`.
* **`getContext<T>(key: string): T | undefined`**: Reads the active ambient value for `key`.
* **`withContext<T, R>(key: string, value: T, drawClosure: () => R): R`**: Scoped helper wrapping `pushContext` / `popContext` in `try...finally`.

#### Focus APIs
* **`setFocus(id: string | null): void`**: Sets keyboard focus to a widget ID across runtimes. Passing `null` clears focus.
* **`isFocused(id: string): boolean`**: Returns `true` if `id` matches the current active focused ID.
* **`getFocusedId(): string | null`**: Returns the currently focused widget ID.

#### Error & Diagnostic APIs
* **`ISMCoreErrorBoundary`**: React class error boundary wrapping widget renders. Catches rendering crashes, reports diagnostics via `onDiagnostic`, logs to `console.error`, and renders `null` (or consumer-provided `renderFallback`).
* **`ErrorFallback`**: Headless fallback renderer. Emits formatted diagnostics to `console.error` and returns `null`.
* **`shouldShowErrorDetailsByDefault(): boolean`**: Returns `true` in non-production Node environments, `false` otherwise.

---

## 3. Types & Data Models

### `AppOptions`
```typescript
export interface AppOptions extends IsmConfig {
  storage?: StorageAdapter;
  storageNamespace?: string;
  onStorageError?: (failure: StorageFailure) => void;
  onDiagnostic?: DiagnosticSink;
  onError?: (error: Error, info?: ErrorInfo) => void;
  renderErrorFallback?: (context: ErrorFallbackContext) => ReactNode;
  showErrorDetails?: boolean;
}
```

### `WidgetConfig<S, A, R>`
```typescript
export interface WidgetConfig<S, A extends unknown[] = unknown[], R = void>
  extends PersistentStateOptions<S> {
  name: string;
  defaultState: S;
  persistent?: boolean;
  scoped?: boolean;
  getLabel?: (...args: A) => string | undefined;
  render: (props: WidgetRenderProps<S, A>) => ReactNode;
  getReturnValue: (state: S, ...args: A) => R;
  consumeState?: (state: S) => S;
  a11y?: WidgetA11y<A>;
}
```

### `StorageAdapter`
```typescript
export interface StorageAdapter {
  has(key: string): boolean;
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  keys(): Iterable<string>;
}
```

### `ISMDiagnostic`
```typescript
export interface ISMDiagnostic {
  code: ISMErrorCode;
  level: "debug" | "warning" | "error";
  message: string;
  details?: Readonly<Record<string, unknown>>;
  cause?: unknown;
  runtimeId?: string;
}
```

---

## 4. State & Transaction Model

Core manages state through a multi-tier pipeline:

```text
[ Authoritative State Store (Memory) ]
            │
            ├─ Transient Frame State (One-shot triggers consumed via consumeState)
            ├─ Memoized Subtrees (Invalidated if dependencies change or IDs collide)
            └─ Buffered Storage Writes (Applied strictly on commitFrame)
```

1. **Authoritative vs Transient State:**
   * Authoritative: Widget state persisted in `Runtime.stateStore`. Survives across frames unless explicitly pruned or reset.
   * Transient: Consumed triggers (e.g., button clicks). Reset by `consumeState` during the frame pass.
2. **Transaction Lifecycle:**
   * `beginFrame(preservePreparedState)`: Allocates a transaction ID, snapshots internal maps, and creates a working frame buffer. If React replays a frame (Concurrent Mode / Suspense), `preservePreparedState` ensures uncommitted storage writes are preserved without data loss.
   * `prepareFrame()`: Validates that scopes and stacks are balanced. Prunes unreferenced state older than `retentionFrames`.
   * `commitFrame()`: Flushes all pending storage operations to `StorageAdapter`, swaps frame pools, and updates revision counters.
   * `abortFrame()`: Restores the transaction snapshot, rolling back any partial state updates or one-shot consumptions if a draw or render fails.

---

## 5. Identification & Disambiguation Rules

Every widget in Core receives a fully-qualified, deterministic hierarchical ID:

```text
/<ParentScope>/<WidgetName>/<Disambiguator>
```

### Label Parsing & Disambiguation Suffixes
When defining widgets that take a string label:
* `Button("Save")` has label `"Save"`.
* If multiple widgets with the same label exist in the same scope, Core appends an automatic collision counter (e.g., `Button/Save#1`, `Button/Save#2`) and emits an `ISM_DUPLICATE_ID` warning.
* **Explicit ID Syntax (`##` and `###`):**
  * `Button("Save##primary")`: Display label is `"Save"`, internal ID segment is `"primary"`.
  * `Button("Save###global_save")`: Overrides the entire ID segment.
* **Strict IDs Mode:** When `strictIds: true` is configured in `AppOptions` or `ism.config.json`, ID collisions throw `ISM_DUPLICATE_ID_STRICT` immediately rather than auto-incrementing suffixes.

---

## 6. Layering & Overlay Architecture

Core isolates overlays, modals, and tooltips from the primary widget tree using **named layers**.

```typescript
withLayer("overlay", () => {
  Modal("Confirm deletion", () => {
    if (Button("Delete")) performDelete();
  });
});
```

* **Layer Rendering:**
  * Default layer (`"default"`): Rendered directly into the main widget container.
  * Named layers: Rendered into a sibling layer host with `pointer-events: none`, while active widgets receive `pointer-events: auto`.
* **Layer Modes:**
  * `"root"` (Default): Overlays position absolutely relative to the app's root container.
  * `"viewport"`: Overlays position fixed across the entire browser / desktop viewport.
* **Z-Index:** Configurable via `layerZIndex` (defaults to `100`).

---

## 7. Error Handling & Diagnostics Architecture

Core provides non-crashing, production-safe error containment:

1. **Console-Only Headless Fallback:**
   When an unhandled exception occurs inside widget rendering or the draw function, Core catches the failure, reports diagnostic metadata to `console.error`, and renders `null` into the DOM. No bulky default UI elements are injected into your layout.
2. **Custom Error Boundaries:**
   Consumers can provide `renderErrorFallback` in `AppOptions` or `renderFallback` in `ISMCoreErrorBoundary`:
   ```typescript
   const App = createApp(draw, {
     renderErrorFallback: (context) => (
       <div role="alert">
         <h3>Error: {context.errorCode}</h3>
         <button onClick={context.onRetry}>Try again</button>
       </div>
     ),
   });
   ```
3. **Diagnostic Sink:**
   Supply `onDiagnostic: (diagnostic) => void` in `AppOptions` to route all warnings, performance invariants, and errors to external logging or telemetry services (e.g., Sentry, OpenTelemetry).

### Exhaustive Error Code Reference

| Error Code | Level | Cause / Condition |
| :--- | :--- | :--- |
| `ISM_WIDGET_OUTSIDE_DRAW` | Error | A widget function was called outside an active `draw` pass. |
| `ISM_END_OUTSIDE_DRAW` | Error | `end()` was called outside an active `draw` pass. |
| `ISM_ID_STACK_OUTSIDE_DRAW` | Error | `pushId`, `popId`, `pushLayer`, or `pushContext` called outside `draw`. |
| `ISM_END_WITHOUT_SCOPE` | Error | `end()` was called when no scoped widget was active. |
| `ISM_UNCLOSED_SCOPES` | Error | A scoped widget was opened but never closed with `end()` before the frame finished. |
| `ISM_DUPLICATE_ID` | Warning | Two widgets share the same ID in the same scope without explicit `##` suffixes. |
| `ISM_DUPLICATE_ID_STRICT` | Error | Thrown in `strictIds` mode when an ID collision is detected. |
| `ISM_POP_ID_EMPTY` | Error | `popId()` called on an empty ID stack. |
| `ISM_INVALID_WIDGET_NAME` | Error | Widget name violates alphanumeric regex naming constraints. |
| `ISM_INVALID_DEFAULT_STATE` | Error | Widget default state is a function or non-serializable type. |
| `ISM_DEFAULT_STATE_NOT_CLONEABLE` | Error | `structuredClone()` failed on the widget's `defaultState`. |
| `ISM_DEFAULT_STATE_CLONE_FAILURE` | Error | Cloned state failed to instantiate properly. |
| `ISM_REACT_CONTEXT_IN_MEMO` | Error | `useReactContext()` invoked inside a `memoBlock()` closure. |
| `ISM_UNBALANCED_ID_STACK` | Error | `pushId()` call without a matching `popId()` at frame end. |
| `ISM_UNBALANCED_CONTEXT` | Error | `pushContext()` call without matching `popContext()` at frame end. |
| `ISM_UNBALANCED_LAYER_STACK` | Error | `pushLayer()` call without matching `popLayer()` at frame end. |
| `ISM_POP_DEFAULT_LAYER` | Error | Attempted to pop the root `"default"` layer. |
| `ISM_STORAGE_FAILURE` | Error | Storage adapter read/write failure or missing `storageNamespace`. |
| `ISM_FRAME_TRANSACTION` | Error | Internal transaction state corruption or invalid transaction commit. |
| `ISM_DRAW_ERROR` | Error | Thrown unhandled exception inside the user's synchronous `draw` function. |
| `ISM_WIDGET_RENDER_ERROR` | Error | Thrown unhandled exception inside a widget's React `render` component. |
| `ISM_CROSS_RUNTIME_ID_COLLISION` | Error | Multiple mounted `createApp` roots collision on global focus routing. |
| `ISM_DIAGNOSTIC_SINK_FAILURE` | Warning | Consumer-provided `onDiagnostic` hook threw an exception. |

---

## 8. DevTools & Inspection Protocol

Core includes a zero-overhead DevTools protocol for debugging:

* **Subpath Import:** `@ispoofermotion/core/devtools`
* **Protocol Symbol:** `Symbol.for("@ispoofermotion/core/inspector-protocol/v1")`
* **Multi-Instance Sharing:** Mounted runtimes are registered globally on `globalThis[Symbol.for("@ispoofermotion/core/mounted-runtimes")]`, allowing independently loaded bundles or micro-frontends to be visible in DevTools.
* **Component:** `<DevToolsOverlay runtime={runtime} />` renders an inspector drawer with "Elements" and "State" inspection tabs.

---

## 9. Integration Guide & Practical Workflows

### Task 1: Initialize an Immediate-Mode Application
```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { createApp } from "@ispoofermotion/core";
import { Button, Counter } from "./myWidgets";

const App = createApp(() => {
  if (Button("Increment")) {
    console.log("Button clicked!");
  }
  Counter("Main Counter");
}, {
  showErrorDetails: true,
  strictIds: true,
});

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
```

### Task 2: Define a Custom Stateful Widget
```tsx
import { defineWidget } from "@ispoofermotion/core";
import React from "react";

export const Toggle = defineWidget<{ active: boolean }, [label: string], boolean>({
  name: "Toggle",
  defaultState: { active: false },
  render: ({ state, setState, args, widgetProps }) => (
    <button
      type="button"
      {...widgetProps}
      aria-pressed={state.active}
      onClick={() => setState((prev) => ({ active: !prev.active }))}
    >
      {args[0]}: {state.active ? "ON" : "OFF"}
    </button>
  ),
  getReturnValue: (state) => state.active,
});
```

### Task 3: One-Shot Action Consumption Pattern
```tsx
export const ActionButton = defineWidget<{ triggered: boolean }, [label: string], boolean>({
  name: "ActionButton",
  defaultState: { triggered: false },
  render: ({ setState, args, widgetProps }) => (
    <button
      type="button"
      {...widgetProps}
      onClick={() => setState({ triggered: true })}
    >
      {args[0]}
    </button>
  ),
  getReturnValue: (state) => state.triggered,
  consumeState: () => ({ triggered: false }), // Resets immediately after the caller reads it
});
```

### Task 4: Persistent State Across Sessions
```tsx
import { createApp } from "@ispoofermotion/core";

const browserStorage = {
  has: (k: string) => localStorage.getItem(k) !== null,
  get: (k: string) => JSON.parse(localStorage.getItem(k) || "null"),
  set: (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v)),
  delete: (k: string) => localStorage.removeItem(k),
  keys: () => Object.keys(localStorage),
};

export const App = createApp(draw, {
  storage: browserStorage,
  storageNamespace: "my-app-settings",
});
```

---

## 10. Rules for AI Consumers

1. **NEVER call widget functions outside `draw`:** Invoking `Button("Test")` inside a standard React component or an async callback throws `ISM_WIDGET_OUTSIDE_DRAW`.
2. **ALWAYS balance scopes with `end()`:** Widgets configured with `scoped: true` MUST be matched with a corresponding `end()` call in the same frame branch. Prefer helper wrappers where possible.
3. **DO NOT call `useReactContext` inside `memoBlock`:** React hook call order diverges if cached. Read React contexts outside `memoBlock` and pass values via the `deps` array.
4. **DO NOT invent custom state mechanisms for widgets:** Rely on `defineWidget`'s `render` prop `setState`. Do not attach global external stores when widget state suffices.
5. **DISAMBIGUATE duplicate labels in loops:** Use `withId(item.id, () => { ... })` or explicit `Button("Delete##" + item.id)` syntax.
6. **PRESERVE zero-UI error behavior:** Core does not render intrusive error overlays into the DOM. Use `renderErrorFallback` only when custom UI fallback states are explicitly requested.
7. **DO NOT duplicate layer roots:** Core manages layer mounting and z-indexing automatically. Use `withLayer("layerName", ...)` instead of creating custom portal containers.
