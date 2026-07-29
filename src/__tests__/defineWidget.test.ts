import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineWidget } from "../defineWidget";
import { Runtime, setActiveRuntime } from "../runtime";

let runtime: Runtime;
beforeEach(() => {
	vi.useFakeTimers();
	runtime = new Runtime();
	setActiveRuntime(runtime);
});

afterEach(() => {
	vi.useRealTimers();
});

// --- Name validation ---

describe("defineWidget name validation", () => {
	it("throws for an empty name", () => {
		expect(() =>
			defineWidget({
				name: "",
				defaultState: {},
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("[ism]");
	});

	it("throws for a name containing '/'", () => {
		expect(() =>
			defineWidget({
				name: "My/Widget",
				defaultState: {},
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("[ism]");
	});

	it("throws for a name containing '#'", () => {
		expect(() =>
			defineWidget({
				name: "My#Widget",
				defaultState: {},
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("[ism]");
	});

	it("throws for a name containing whitespace", () => {
		expect(() =>
			defineWidget({
				name: "My Widget",
				defaultState: {},
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("[ism]");
	});

	it("throws when defaultState is a function", () => {
		expect(() =>
			defineWidget({
				name: "Bad",
				defaultState: () => {},
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("[ism]");
	});

	it("throws at definition time when defaultState contains a nested function", () => {
		expect(() =>
			defineWidget({
				name: "BadNested",
				defaultState: { onDone: () => {} },
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("not structured-cloneable");
	});

	it("accepts defaultState with Map/Set/Date values", () => {
		expect(() =>
			defineWidget({
				name: "GoodComplexState",
				defaultState: { m: new Map(), s: new Set(), d: new Date() },
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).not.toThrow();
	});

	it("accepts a valid name", () => {
		expect(() =>
			defineWidget({
				name: "MyWidget",
				defaultState: {},
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).not.toThrow();
	});
});

// --- Outside-draw guard ---

describe("widget outside draw guard", () => {
	it("throws when called outside a draw pass", () => {
		runtime.registerApp(() => {});
		const Btn = defineWidget({
			name: "Btn",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});
		expect(() => Btn()).toThrow("outside of a draw function");
	});
});

// --- Conditional rendering ---

describe("conditional widgets", () => {
	it("preserves state when a widget is absent for one frame then returns", () => {
		runtime.registerApp(() => {});
		const Counter = defineWidget<{ n: number }, [], number>({
			name: "Counter",
			defaultState: { n: 0 },
			render: ({ setState }) => {
				setState({ n: 999 });
				return null;
			},
			getReturnValue: (s) => s.n,
		});

		// Frame 1: counter present, state becomes 999 via render (but render runs later)
		runtime.beginFrame();
		Counter();
		runtime.endFrame();

		// Manually set state to simulate a value set during render
		runtime.setState("Counter/Counter", { n: 42 });

		// Frame 2: counter absent
		runtime.beginFrame();
		runtime.endFrame();

		// Frame 3: counter present again
		runtime.beginFrame();
		const val = Counter();
		runtime.endFrame();

		vi.advanceTimersByTime(1500);

		runtime.beginFrame();
		runtime.endFrame();

		// State is preserved because it was only absent for 1 frame (TTL not reached)
		expect(val).toBe(42);
	});

	it("keeps state when a widget is present every frame", () => {
		runtime.registerApp(() => {});
		const Counter = defineWidget<{ n: number }, [], number>({
			name: "Counter2",
			defaultState: { n: 0 },
			render: () => null,
			getReturnValue: (s) => s.n,
		});

		// Frame 1
		runtime.beginFrame();
		Counter();
		runtime.endFrame();
		runtime.setState("Counter2/Counter2", { n: 7 });

		// Frame 2: still present
		runtime.beginFrame();
		const val = Counter();
		runtime.endFrame();

		expect(val).toBe(7);
	});
});

// --- Loop widgets ---

describe("loop widgets with changing counts", () => {
	it("assigns unique IDs to each iteration via pushId", () => {
		const ids: string[] = [];
		runtime.registerApp(() => {});

		runtime.beginFrame();
		for (let i = 0; i < 5; i++) {
			runtime.pushIdSegment(`row-${i}`);
			ids.push(runtime.buildId("Item", `item-${i}`));
			runtime.popIdSegment();
		}
		runtime.endFrame();

		// Each ID must be unique
		const unique = new Set(ids);
		expect(unique.size).toBe(5);
	});

	it("does not bleed state between loop iterations with different counts", () => {
		runtime.registerApp(() => {});

		const Widget = defineWidget<{ val: number }, [n: number], number>({
			name: "LoopWidget",
			defaultState: { val: 0 },
			render: () => null,
			getReturnValue: (s) => s.val,
		});

		// Frame 1: 3 iterations
		runtime.beginFrame();
		for (let i = 0; i < 3; i++) {
			runtime.pushIdSegment(`row-${i}`);
			Widget(i);
			runtime.popIdSegment();
		}
		runtime.endFrame();

		// Frame 2: 2 iterations (one less)
		runtime.beginFrame();
		const results: number[] = [];
		for (let i = 0; i < 2; i++) {
			runtime.pushIdSegment(`row-${i}`);
			results.push(Widget(i));
			runtime.popIdSegment();
		}
		runtime.endFrame();

		// All values should be the default (0); no bleed from previous frame's state
		expect(results).toEqual([0, 0]);
	});
});

// --- widgetProps injection ---

describe("widgetProps", () => {
	it("injects data-ism-widget and class names", () => {
		runtime.registerApp(() => {});
		let capturedProps: unknown;

		const W = defineWidget<{}, [], void>({
			name: "TestWidget",
			defaultState: {},
			render: ({ widgetProps }) => {
				capturedProps = widgetProps;
				return null;
			},
			getReturnValue: () => undefined,
		});

		runtime.beginFrame();
		W();
		runtime.endFrame();

		// Invoke the render fn directly on the frame entry to capture widgetProps
		const entries = runtime.getFrameBuffer().get("default")!;
		const entry = entries[0]!;
		entry.renderFn({
			id: entry.id,
			state: {},
			setState: () => {},
			args: [],
			children: null,
			widgetProps: entry.widgetProps,
		});

		expect(capturedProps).toMatchObject({
			"data-ism-widget": "TestWidget",
			className: expect.stringContaining("ism-testwidget"),
		});
	});

	it("injects ARIA role and label from a11y config", () => {
		runtime.registerApp(() => {});
		let capturedProps: unknown;

		const W = defineWidget<{}, [label: string], void>({
			name: "A11yWidget",
			defaultState: {},
			a11y: {
				role: "button",
				label: ([lbl]) => lbl,
			},
			render: ({ widgetProps }) => {
				capturedProps = widgetProps;
				return null;
			},
			getReturnValue: () => undefined,
		});

		runtime.beginFrame();
		W("Click me");
		runtime.endFrame();

		const entries = runtime.getFrameBuffer().get("default")!;
		const entry = entries[0]!;
		entry.renderFn({
			id: entry.id,
			state: {},
			setState: () => {},
			args: ["Click me"],
			children: null,
			widgetProps: entry.widgetProps,
		});

		expect(capturedProps).toMatchObject({
			role: "button",
			"aria-label": "Click me",
		});
	});
});
