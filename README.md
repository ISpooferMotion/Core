<div align="center">
  <img src="./assets/logo.svg" alt="ISMCore Logo" width="128" />
</div>

<h1 align="center">@ispoofermotion/core</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.3.1-blue.svg?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/license-MIT-green.svg?style=for-the-badge" alt="License: MIT" />
  <img src="https://img.shields.io/badge/React-19.0.0-61DAFB.svg?style=for-the-badge&logo=react" alt="React 19" />
</p>

<p align="center">
  The core declarative rendering engine and widget system for your UI.
</p>

## Overview

`@ispoofermotion/core` provides a highly optimized, React-based immediate-mode runtime for building UI on top of React 18+ (CI exercises both React 18 and React 19). It abstracts away manual React state wiring by offering a specialized `defineWidget` API for pooled, allocation-light widget state and re-renders, well suited to UIs that update frequently (e.g. driven by Tauri IPC events).

### Installation

```bash
bun add @ispoofermotion/core
```

## Architecture

* **Widget System (`defineWidget`)**: A declarative factory for defining UI components with isolated state boundaries, built-in accessibility scaffolding, and predictable re-render cycles.
* **Runtime Orchestration (`createApp`)**: Returns a plain React component that wraps your draw function in an internal error boundary and schedules re-renders for you. You mount it yourself with `createRoot` exactly as you would any other component -- `createApp` does not perform concurrent-mode initialization or IPC injection on your behalf. If you're using Tauri, wire up `listen(...)` + `markDirty()` yourself.
* **Style Engine**: Bundles the baseline `styles.css` containing global aesthetic resets and tactile layout primitives.

## Usage

### Defining a Widget

```tsx
import { defineWidget } from "@ispoofermotion/core";
import { createElement } from "react";

export const ProfileCard = defineWidget<{ clicked: boolean }, [name: string], boolean>({
  name: "ProfileCard",
  defaultState: { clicked: false },
  a11y: { role: "button", label: ([name]) => `View profile for ${name}` },
  render: ({ id, state, setState, args, widgetProps }) =>
    createElement(
      "div",
      { key: id, ...widgetProps, onClick: () => setState({ clicked: true }) },
      `Hello ${args[0]}`,
    ),
  getReturnValue: (state) => state.clicked,
  consumeState: (state) => ({ ...state, clicked: false }),
});
```

`consumeState` runs immediately after `getReturnValue` during the draw pass. It is intended for one-shot values such as clicks, so the same event is not processed twice when React StrictMode repeats a development render.

When using React context, call `useReactContext()` before entering a `memoBlock()` and include the context value in the memo dependencies. Hooks inside a memoized closure are rejected because cache hits skip that closure and would change hook order.

### Development Scripts

| Command               | Description                                      |
| --------------------- | ------------------------------------------------ |
| `bun run build`       | Bundles the library using `tsup`.                |
| `bun run dev`         | Watches source files and rebuilds on change.     |
| `bun run test`        | Runs the test suite via Vitest.                  |
| `bun run lint`        | Runs the Biome linter across `src/`.             |
| `bun run typecheck`   | Validates TypeScript types.                      |
| `bun run verify:lock` | Confirms `package.json` and `bun.lock` agree.    |

## License

MIT © ISpooferMotion. See [LICENSE](./LICENSE).
