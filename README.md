# @ispoofermotion/core

`@ispoofermotion/core` is an immediate mode UI runtime built on React. You describe the current frame by calling widgets inside a draw function, and the runtime handles widget identity, state, rendering, and updates.

It works with React 18 and React 19. It was built with Tauri apps in mind, but it does not depend on Tauri and does not set up IPC for you.

## Install

```bash
bun add @ispoofermotion/core react react-dom
```

Import the base styles once near your app entry point.

```ts
import "@ispoofermotion/core/styles.css";
```

## Basic example

```tsx
import {
  createApp,
  defineWidget,
  makeInteractive,
  markDirty,
} from "@ispoofermotion/core";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

const Button = defineWidget<
  { clicked: boolean },
  [label: string],
  boolean
>({
  name: "Button",
  defaultState: { clicked: false },
  a11y: {
    role: "button",
    label: ([label]) => label,
  },
  render: ({ id, args, setState, widgetProps }) =>
    createElement(
      "button",
      {
        key: id,
        ...widgetProps,
        ...makeInteractive(() => setState({ clicked: true })),
      },
      args[0],
    ),
  getReturnValue: (state) => state.clicked,
  consumeState: (state) => ({ ...state, clicked: false }),
});

let count = 0;

const App = createApp(() => {
  if (Button(`Count: ${count}`)) {
    count += 1;
    markDirty();
  }
});

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing #root element");
}

createRoot(root).render(createElement(App));
```

`consumeState` runs after `getReturnValue` during the draw pass. It is useful for values such as clicks that should only be handled once.

## How it works

`createApp` creates a React component and a separate runtime for that app root. Every render starts a frame, runs your draw function, builds a frame tree, and turns that tree into React elements.

`defineWidget` creates a callable widget function. Each widget gets a stable ID, its own state, typed arguments, optional accessibility props, and a render function.

Widget render functions run during React rendering. Keep them pure. The draw function should also stay predictable and should call widgets in a stable order.

## Widget identity

The runtime builds widget IDs from the widget name, label, scope, and current ID stack. Use `pushId` and `popId` when repeated widgets would otherwise produce the same ID.

```ts
for (const user of users) {
  pushId(user.id);
  UserRow(user.name);
  popId();
}
```

A scoped widget opens a child area in the frame tree. Close it with `end`.

```ts
Panel("Settings");
Text("Account");
end();
```

## External state

Call `markDirty()` after changing state that lives outside the widget runtime.

```ts
let connected = false;

const stop = listen("connection_changed", (event) => {
  connected = event.payload;
  markDirty();
});
```

The package does not register Tauri listeners or manage external state automatically.

## Persistent widget state

Pass a synchronous storage adapter to `createApp`, then set `persistent: true` on widgets that should use it.

```ts
const memory = new Map<string, unknown>();

const App = createApp(draw, {
  storage: {
    get: (key) => memory.get(key),
    set: (key, value) => memory.set(key, value),
    delete: (key) => memory.delete(key),
  },
});
```

Storage reads happen while a widget is registered, so async adapters are not supported. Load async data before mounting and expose it through a synchronous adapter.

## Context, layers, and memo blocks

`pushContext`, `getContext`, and `popContext` pass values through the draw tree without adding them to every widget argument.

`pushLayer` and `popLayer` place widgets in named render layers. Nondefault layers use the configured `layerZIndex`.

`memoBlock` reuses a widget subtree while its dependency values stay equal.

```ts
memoBlock("user-list", [users], () => {
  for (const user of users) {
    pushId(user.id);
    UserRow(user.name);
    popId();
  }
});
```

Do not call `useReactContext` inside a `memoBlock`. A cache hit skips the closure, which would change React hook order.

## Configuration

```ts
const App = createApp(draw, {
  layerZIndex: 200,
  showDevTools: true,
  storage,
});
```

`layerZIndex` defaults to `100`.

`showDevTools` defaults to `false`.

`defineConfig` validates these values and returns the same object.

```ts
import { defineConfig } from "@ispoofermotion/core";

export default defineConfig({
  layerZIndex: 200,
  showDevTools: false,
});
```

## Config scaffold

The package includes a small CLI that creates `ism.config.json` with schema support.

```bash
bunx ism-core init
```

Use `--force` to replace an existing file. The runtime does not load this JSON automatically. Import it through your bundler and pass its values to `createApp`.

## Development

Install dependencies.

```bash
bun install
```

Run the main checks.

```bash
bun run typecheck
bun run lint
bun run test
bun run build
```

Other useful commands:

`bun run dev` watches the source and rebuilds it.

`bun run test:coverage` runs tests with coverage.

`bun run docs` rebuilds the TypeDoc site.

`bun run verify:lock` checks that `package.json` and `bun.lock` match.

## API stability

The public API stability rules are in [STABILITY.md](./STABILITY.md). Release history is in [CHANGELOG.md](./CHANGELOG.md).

## License

This project uses the MIT License. See [LICENSE](./LICENSE).
