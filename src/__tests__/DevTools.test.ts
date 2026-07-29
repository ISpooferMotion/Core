import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../createApp";
import { defineWidget } from "../defineWidget";
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

const Button = defineWidget<{ clicked: boolean }, [label: string], boolean>({
	name: "Button",
	defaultState: { clicked: false },
	a11y: { role: "button", label: ([label]) => label },
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

function click(el: Element | null) {
	act(() => {
		el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}

describe("DevTools", () => {
	it("renders collapsed by default, showing only the open button", () => {
		const App = createApp(
			() => {
				Button("Save");
			},
			{ showDevTools: true },
		);

		const root = createRoot(container);
		act(() => {
			root.render(createElement(App));
		});

		expect(
			container.querySelector('[aria-label="Open DevTools"]'),
		).not.toBeNull();
		expect(container.querySelector('[role="tablist"]')).toBeNull();
	});

	it("expands to show tabs when the open button is clicked", () => {
		const App = createApp(
			() => {
				Button("Save");
			},
			{ showDevTools: true },
		);

		const root = createRoot(container);
		act(() => {
			root.render(createElement(App));
		});

		click(container.querySelector('[aria-label="Open DevTools"]'));

		const tablist = container.querySelector('[role="tablist"]');
		expect(tablist).not.toBeNull();
		expect(container.querySelectorAll('[role="tab"]').length).toBe(2);
		// Elements tab is active by default; the Elements tab's own live-tree
		// snapshot should mention the widget drawn by the host app.
		expect(container.textContent).toContain("Button");
	});

	it("wires the tab/tabpanel ARIA relationship correctly", () => {
		const App = createApp(
			() => {
				Button("Save");
			},
			{ showDevTools: true },
		);

		const root = createRoot(container);
		act(() => {
			root.render(createElement(App));
		});
		click(container.querySelector('[aria-label="Open DevTools"]'));

		const tabpanel = container.querySelector('[role="tabpanel"]');
		expect(tabpanel).not.toBeNull();
		const tabpanelId = tabpanel?.getAttribute("id");
		expect(tabpanelId).toBeTruthy();

		const elementsTab = Array.from(
			container.querySelectorAll('[role="tab"]'),
		).find((el) => el.textContent === "Elements");
		expect(elementsTab?.getAttribute("aria-controls")).toBe(tabpanelId);
		expect(tabpanel?.getAttribute("aria-labelledby")).toBe(
			elementsTab?.getAttribute("id"),
		);
	});

	it("switches to the State tab and shows the live state store", () => {
		const App = createApp(
			() => {
				Button("Save");
			},
			{ showDevTools: true },
		);

		const root = createRoot(container);
		act(() => {
			root.render(createElement(App));
		});
		click(container.querySelector('[aria-label="Open DevTools"]'));

		const stateTab = Array.from(
			container.querySelectorAll('[role="tab"]'),
		).find((el) => el.textContent === "State");
		click(stateTab ?? null);

		expect(container.textContent).toContain("clicked");
	});

	it("collapses again when the close button is clicked", () => {
		const App = createApp(
			() => {
				Button("Save");
			},
			{ showDevTools: true },
		);

		const root = createRoot(container);
		act(() => {
			root.render(createElement(App));
		});
		click(container.querySelector('[aria-label="Open DevTools"]'));
		expect(container.querySelector('[role="tablist"]')).not.toBeNull();

		click(container.querySelector('[aria-label="Close DevTools"]'));
		expect(container.querySelector('[role="tablist"]')).toBeNull();
		expect(
			container.querySelector('[aria-label="Open DevTools"]'),
		).not.toBeNull();
	});
});
