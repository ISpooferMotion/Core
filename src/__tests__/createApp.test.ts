import { act, createContext, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp, useReactContext } from "../createApp";
import { defineWidget } from "../defineWidget";
import { markDirty, popLayer, pushLayer } from "../index";
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

	it("re-renders after a click handler updates widget state and calls markDirty", () => {
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
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.textContent).toContain("count: 1");
	});

	it("shows the draw-error fallback when the draw function throws, and recovers on retry", () => {
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
		act(() => {
			retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.querySelector("[data-ism-error]")).toBeNull();
		expect(container.textContent).toContain("recovered");
		consoleError.mockRestore();
	});

	it("mounts DevTools when showDevTools is true, and not when false/omitted", () => {
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
		// DevTools' collapsed button has this aria-label.
		expect(
			container.querySelector('[aria-label="Open DevTools"]'),
		).not.toBeNull();

		act(() => {
			rootWith.unmount();
		});

		const container2 = document.createElement("div");
		document.body.appendChild(container2);
		const rootWithout = createRoot(container2);
		act(() => {
			rootWithout.render(createElement(AppWithout));
		});
		expect(container2.querySelector('[aria-label="Open DevTools"]')).toBeNull();
		act(() => {
			rootWithout.unmount();
		});
		document.body.removeChild(container2);
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

		const layerEl = container.querySelector(
			'[data-ism-layer="modal"]',
		) as HTMLElement | null;
		expect(layerEl).not.toBeNull();
		expect(layerEl?.style.zIndex).toBe("555");
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
