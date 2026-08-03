import { act, createContext, createElement, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, useReactContext } from "../createApp";
import { defineWidget } from "../defineWidget";
import { markDirty, memoBlock, popLayer, pushLayer } from "../index";
import { makeInteractive } from "../makeInteractive";
import { mountedRuntimes } from "../runtime";

let container: HTMLDivElement;

beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
});

afterEach(() => {
	document.body.removeChild(container);
	mountedRuntimes.clear();
});

const Text = defineWidget<Record<string, never>, [text: string], void>({
	name: "Text",
	defaultState: {},
	render: ({ id, args }) => createElement("span", { key: id }, args[0]),
	getReturnValue: () => undefined,
});

const Button = defineWidget<{ clicked: boolean }, [label: string], boolean>({
	name: "Button",
	defaultState: { clicked: false },
	render: ({ id, args, setState, widgetProps }) =>
		createElement(
			"button",
			{
				key: id,
				type: "button" as const,
				...widgetProps,
				onClick: () => setState({ clicked: true }),
			},
			args[0],
		),
	getReturnValue: (state) => state.clicked,
	consumeState: (state) => ({ ...state, clicked: false }),
});

describe("createApp", () => {
	it("renders widgets called from the draw function", () => {
		const App = createApp(() => {
			Text("hello world");
		});

		const root = createRoot(container);

		act(() => {
			root.render(createElement(App));
		});

		expect(container.textContent).toContain("hello world");
	});

	it("re-renders after a click handler updates widget state and calls markDirty", async () => {
		let clickCount = 0;

		const App = createApp(() => {
			if (Button("Click me")) {
				clickCount++;
				markDirty();
			}

			Text(`count: ${clickCount}`);
		});

		const root = createRoot(container);

		act(() => {
			root.render(createElement(App));
		});

		expect(container.textContent).toContain("count: 0");

		const button = container.querySelector("button");

		await act(async () => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.textContent).toContain("count: 1");
	});

	it("handles one-shot widget events exactly once in React StrictMode", async () => {
		let clickCount = 0;

		const App = createApp(() => {
			if (Button("Strict click")) {
				clickCount++;
				markDirty();
			}

			Text(`strict count: ${clickCount}`);
		});

		const root = createRoot(container);

		await act(async () => {
			root.render(createElement(StrictMode, null, createElement(App)));
		});

		await act(async () => {
			container
				.querySelector("button")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

			await Promise.resolve();
		});

		expect(clickCount).toBe(1);
		expect(container.textContent).toContain("strict count: 1");
	});

	it("routes focus to the correct runtime when app roots share a widget ID", () => {
		const Focusable = defineWidget<
			Record<string, never>,
			[label: string],
			void
		>({
			name: "Focusable",
			defaultState: {},
			render: ({ id, runtimeId, args, widgetProps }) =>
				createElement(
					"button",
					{
						type: "button" as const,
						...widgetProps,
						...makeInteractive(() => {}, { id }),
						"data-runtime-id": runtimeId,
					},
					args[0],
				),
			getReturnValue: () => undefined,
		});

		const secondContainer = document.createElement("div");
		document.body.appendChild(secondContainer);

		const AppA = createApp(() => Focusable("same"));
		const AppB = createApp(() => Focusable("same"));
		const rootA = createRoot(container);
		const rootB = createRoot(secondContainer);

		act(() => {
			rootA.render(createElement(AppA));
			rootB.render(createElement(AppB));
		});

		const firstButton = container.querySelector("button");
		const widgetId = firstButton?.getAttribute("data-ism-id") ?? "";
		const runtimeId = firstButton?.getAttribute("data-runtime-id");

		act(() => {
			firstButton?.focus();
		});

		const runtimes = Array.from(mountedRuntimes);
		const owner = runtimes.find(
			(runtime) => runtime.getInstanceId() === runtimeId,
		);
		const other = runtimes.find((runtime) => runtime !== owner);

		expect(owner?.isFocused(widgetId)).toBe(true);
		expect(other?.isFocused(widgetId)).toBe(false);

		act(() => {
			rootA.unmount();
			rootB.unmount();
		});

		document.body.removeChild(secondContainer);
	});

	it("renders a real element for a11y descriptions", () => {
		const Described = defineWidget<Record<string, never>, [], void>({
			name: "Described",
			defaultState: {},
			a11y: { description: "Helpful description" },
			render: ({ widgetProps }) =>
				createElement(
					"button",
					{
						type: "button" as const,
						...widgetProps,
					},
					"Described button",
				),
			getReturnValue: () => undefined,
		});

		const App = createApp(() => Described());
		const root = createRoot(container);

		act(() => {
			root.render(createElement(App));
		});

		const button = container.querySelector("button");
		const descriptionId = button?.getAttribute("aria-describedby");

		expect(descriptionId).toBeTruthy();
		expect(document.getElementById(descriptionId ?? "")?.textContent).toBe(
			"Helpful description",
		);
	});

	it("shows the draw-error fallback when the draw function throws, and recovers on retry", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		let shouldThrow = true;

		const App = createApp(() => {
			if (shouldThrow) {
				throw new Error("draw exploded");
			}

			Text("recovered");
		});

		const root = createRoot(container);

		act(() => {
			root.render(createElement(App));
		});

		expect(container.querySelector("[data-ism-error]")).not.toBeNull();
		expect(container.textContent).toContain("draw exploded");

		shouldThrow = false;

		const retryButton = container.querySelector("button");

		await act(async () => {
			retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.querySelector("[data-ism-error]")).toBeNull();
		expect(container.textContent).toContain("recovered");

		consoleError.mockRestore();
	});

	it("mounts DevTools when showDevTools is true, and not when false or omitted", () => {
		const AppWith = createApp(
			() => {
				Text("hi");
			},
			{ showDevTools: true },
		);

		const AppWithout = createApp(() => {
			Text("hi");
		});

		const rootWith = createRoot(container);

		act(() => {
			rootWith.render(createElement(AppWith));
		});

		expect(
			container.querySelector('[aria-label="Open DevTools"]'),
		).not.toBeNull();

		act(() => {
			rootWith.unmount();
		});

		const secondContainer = document.createElement("div");
		document.body.appendChild(secondContainer);

		const rootWithout = createRoot(secondContainer);

		act(() => {
			rootWithout.render(createElement(AppWithout));
		});

		expect(
			secondContainer.querySelector('[aria-label="Open DevTools"]'),
		).toBeNull();

		act(() => {
			rootWithout.unmount();
		});

		document.body.removeChild(secondContainer);
	});

	it("applies the configured layerZIndex to non-default layers", () => {
		const App = createApp(
			() => {
				pushLayer("modal");
				Text("in a modal");
				popLayer();
			},
			{ layerZIndex: 555 },
		);

		const root = createRoot(container);

		act(() => {
			root.render(createElement(App));
		});

		const layerElement = container.querySelector(
			'[data-ism-layer="modal"]',
		) as HTMLElement | null;

		expect(layerElement).not.toBeNull();
		expect(layerElement?.style.zIndex).toBe("555");
	});

	it("cleans up the runtime from mountedRuntimes on unmount", () => {
		const App = createApp(() => {
			Text("hi");
		});

		const root = createRoot(container);

		act(() => {
			root.render(createElement(App));
		});

		expect(mountedRuntimes.size).toBe(1);

		act(() => {
			root.unmount();
		});

		expect(mountedRuntimes.size).toBe(0);
	});
});

describe("useReactContext", () => {
	it("rejects useReactContext inside memoBlock before hook order can diverge", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const TestContext = createContext("default-value");

		const App = createApp(() => {
			memoBlock("context", [], () => {
				useReactContext(TestContext);
			});
		});

		const root = createRoot(container);

		act(() => {
			root.render(createElement(App));
		});

		expect(container.textContent).toContain(
			"useReactContext() cannot be called inside memoBlock()",
		);

		consoleError.mockRestore();
	});

	it("passes through the current context value", () => {
		const TestContext = createContext("default-value");
		let observed = "";

		const App = createApp(() => {
			observed = useReactContext(TestContext);
			Text(observed);
		});

		const root = createRoot(container);

		act(() => {
			root.render(
				createElement(
					TestContext.Provider,
					{ value: "provided-value" },
					createElement(App),
				),
			);
		});

		expect(observed).toBe("provided-value");
		expect(container.textContent).toContain("provided-value");
	});
});
