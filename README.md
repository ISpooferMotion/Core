<div align="center">
  <img src="./assets/logo.svg" alt="ISMCore Logo" width="128" />
</div>

<h1 align="center">@ispoofermotion/core</h1>

<p align="center">
  <img src="https://img.shields.io/badge/version-3.0.0-blue.svg?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/license-Proprietary-red.svg?style=for-the-badge" alt="License: Proprietary" />
  <img src="https://img.shields.io/badge/React-19.0.0-61DAFB.svg?style=for-the-badge&logo=react" alt="React 19" />
</p>

<p align="center">
  The core declarative rendering engine and widget system for your UI.
</p>

## Overview

`@ispoofermotion/core` provides a highly optimized, React-based runtime for any UI layer. It abstracts away complex React state and layout thrashing by offering a specialized `defineWidget` API tailored for high-frequency IPC state streaming and headless rendering synchronization.

### Installation

```bash
bun add @ispoofermotion/core
```

## Architecture

* **Widget System (`defineWidget`)**: A declarative factory for defining UI components with isolated state boundaries, built-in accessibility scaffolding, and predictable re-render cycles.
* **Runtime Orchestration (`createApp`)**: A customized application mount wrapper that handles global error boundaries, React 19 concurrent mode initialization, and root-level IPC injection.
* **Style Engine**: Bundles the baseline `styles.css` containing global aesthetic resets and tactile layout primitives.

## Usage

### Defining a Widget

```tsx
import { defineWidget } from "@ispoofermotion/core";
import { createElement } from "react";

export const ProfileCard = defineWidget({
  name: "ProfileCard",
  defaultState: { clicked: false },
  render: ({ state, setState, args }) => {
    return createElement("div", null, `Hello ${args[0]}`);
  }
});
```

### Development Scripts

| Command             | Description                                  |
| ------------------- | -------------------------------------------- |
| `bun run build`     | Bundles the library using `tsup`.            |
| `bun run dev`       | Watches source files and rebuilds on change. |
| `bun run test`      | Runs the test suite via Vitest.              |
| `bun run lint`      | Runs the Biome linter across `src/`.         |
| `bun run typecheck` | Validates TypeScript types.                  |

## License

Proprietary and Confidential. Unauthorized copying, distribution, or usage of this file, via any medium, is strictly prohibited.
