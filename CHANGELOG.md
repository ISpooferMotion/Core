<!-- markdownlint-disable MD013 MD024 -->
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [3.2.0] - 2026-07-26

### Added

- **Configuration CLI & JSON Schema**: Introduced a dedicated configuration system via `IsmConfig` and `defineConfig`. Consumers can now manage app settings via `ism.config.json`, which can be bootstrapped instantly using the newly added CLI (`npx ism-core init`).
- **Enhanced ErrorBoundary UI**: Completely redesigned the internal error catch blocks (both React's `ISMCoreErrorBoundary` and the internal draw pass `drawError`). The new `<ErrorFallback>` component provides a polished, dark-themed diagnostic panel featuring full stack traces, file/line number extraction, and contextual troubleshooting instructions.
- **Stability Guarantee**: Created `STABILITY.md` in the repository root explicitly documenting the library's strict adherence to backward compatibility and additive-only changes for public APIs since v1.0.0.

### Changed

- Updated all internal block comments to adhere to standard `// --- ---` spacing conventions.

### Removed

- **DevConsole & Logger**: Completely removed the internal `DevConsole` widget and `logger.ts` module, as well as the Console tab from `DevTools`. Console interception is no longer handled by `@ispoofermotion/core`.

## [3.1.0] - 2026-07-25

### Added

- `layerZIndex` configuration property added to `AppOptions`, allowing consumers to specify the base z-index for non-default layers.

### Changed

- **Zero-Allocation Hot Path**: The engine's core draw loop is now strictly allocation-free.
  - `widgetProps` instances are now populated by mutating the pooled `entry.widgetProps` object instead of allocating a fresh dictionary on every widget call.
  - The React bridging `renderFn` closure in `defineWidget` is hoisted out of the hot path and only runs once on widget definition, completely eliminating per-widget closure allocation.
  - String allocations (`.join("/")`) have been removed from `buildId` and are now natively cached in the runtime via `idPrefix`.
- Enforced strict Type Safety by enabling `exactOptionalPropertyTypes` in `tsconfig.json` and adding `noExplicitAny` to Biome lint rules.

### Fixed

- **DevTools Crash**: Fixed an exception when accessing the Elements/State tabs caused by reading the active runtime during the React commit phase. (Now uses the safe `mountedRuntimes` set).
- **Runtime Leak Prevention**: Fixed a critical leak vulnerability in `withRuntime`. The draw pass is now strictly guarded by `try/finally` blocks ensuring global runtime state cleanup even when unexpected exceptions are thrown in widget code.
- **makeInteractive Bug**: `makeInteractive` no longer swallows all exceptions via bare catch blocks. Replaced with an explicit iteration over `mountedRuntimes` for out-of-band focus events.
- **memoBlock Isolation**: `memoBlock` collision/scoping issues resolved. It now correctly isolates its namespaces into `__memo__` using `buildMemoKey`, completely bypassing the ID collision counter to prevent user widget conflicts.
- Em-dashes were removed across all source files in accordance with ISpooferMotion engineering standards.

## [3.0.0] - 2026-07-04

### Changed

- **Standardized Naming (`ismlib` -> `ism`)**: Complete migration away from legacy `ismlib` naming conventions across the library.
  - DOM Data attributes updated: `data-ismlib-widget` -> `data-ism-widget`, `data-ismlib-id` -> `data-ism-id`, `data-ismlib-root` -> `data-ism-root`, `data-ismlib-error` -> `data-ism-error`, `data-ismlib-layer` -> `data-ism-layer`.
  - CSS class hooks updated: `.ismlib-widget` -> `.ism-widget`, `.ismlib-{name}` -> `.ism-{name}`.
  - Design tokens updated: `--ismlib-*` -> `--ism-*`.
  - Logging prefix updated from `[ismlib]` to `[ism]`.
  - Global DevTools discovery hook updated from `window.__ISMLIB_DEVTOOLS__` to `window.__ISM_DEVTOOLS__`.
  - Core components renamed from `ISMLib` / `ISMLibApp` to `ISMCore` / `ISMCoreApp`. Renamed `ISMLibErrorBoundary` to `ISMCoreErrorBoundary` (retaining `ISMLibErrorBoundary` as an export alias for backwards compatibility).
- **OKLCH Color System**: Upgraded default design system baseline in `styles.css` to use modern OKLCH color palettes with automatic `--background`, `--foreground`, and semantic token mappings for Light and Dark modes.

## [2.2.0] - 2026-07-03

### Changed

- **DevTools Redesign**: Replaced the basic `DevConsole` with a comprehensive, tabbed `DevTools` widget that correctly sizes itself dynamically (35vh fixed height when expanded, docked to bottom) and provides tabs for Console, Elements, and State.
- **Logger Extraction**: Extracted internal logging functions into a separate `logger.ts` module to prevent circular dependencies between the widget definitions and the core runtime.
- **Global `__ISMLIB_DEVTOOLS__` Hook**: Restored the global discovery hook to its original intent for external extension support, cleanly separating it from the internal in-app `DevTools` panel logging.

## [2.1.0] - 2026-07-02

### Added

- **DevConsole**: Added `attachDevConsole(limit?)`, `getDevLogs()`, and the `DevConsole` immediate-mode widget. Call `attachDevConsole()` once at startup to hook `console.log/warn/error` into a capped ring buffer; render `DevConsole()` anywhere in your draw function to get a floating, collapsible log panel. Zero cost in production - designed to be tree-shaken away behind `import.meta.env.DEV`.

## [2.0.0] - 2026-07-01

### Added

- **Storage Adapters**: Introduced `StorageAdapter` interface. Widgets can now be flagged with `persistent: true` to automatically restore state (e.g., from `localStorage`) across application restarts.
- **Environment Contexts**: Added `pushContext`, `popContext`, and `getContext` APIs for native immediate-mode dependency injection (similar to React Context).
- **Layering & Portals**: Added `pushLayer` and `popLayer` to render overlapping interfaces like tooltips and modals natively.
- **Scope Memoization**: Introduced `memoBlock(id, deps, drawClosure)` for aggressive CPU time reduction by deep-cloning subtrees dynamically when dependencies haven't changed.
- **Focus Management**: Integrated `FocusManager` into the runtime. `makeInteractive` now listens to focus events globally. Added `setFocus` and `isFocused`.
- **DevTools Hook**: The engine now securely mounts to `window.__ISMLIB_DEVTOOLS__`, allowing extensions to query internal layout buffers and the state store without polling.
- (7b9e80f) **Tests**: Fixed TypeScript type errors by providing missing layoutProps in test mocks.
- (b5c12c5) **Chore**: Configured package for `@ispoofermotion` organization release.

### Changed

- **Architectural Overhaul**: Removed the global `runtime` singleton. The engine now uses a React-style thread-local dispatcher pattern (`getActiveRuntime()`), supporting multiple independent `ismlib` instances on a single page.
- **Garbage Collection**: Replaced frame-count based state expiration with a robust, time-based GC using `Date.now()`.
- **Layout System**: Completely deleted absolute positional coordinate tracking (`cursorX`/`cursorY`). Layouts are now cleanly deferred to native CSS Flexbox and Grid.

### Removed

- Removed explicit layout properties (`layoutProps`) globally from the widget definitions, adopting a modern declarative DOM integration pattern.

## [1.0.0] - 2026-06-30

### Added

- Core widget factory `defineWidget` to standardize stateful React component generation.
- Virtual DOM to React runtime adapter in `runtime.ts` for IPC synchronization.
- Application mount wrapper `createApp.tsx` utilizing React 19 concurrent features.
- Global error boundary implementation tailored for Tauri error recovery.
- Automated bundler configuration using `tsup` for ESM, CJS, and DTS output generation.
- High-performance testing pipeline utilizing `vitest` and `happy-dom`.
- Initial baseline UI primitive definitions and CSS structural classes (`styles.css`).
