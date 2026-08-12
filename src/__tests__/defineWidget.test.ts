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

// Widget name validation

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

	it("rejects a null-prototype default object", () => {
		expect(() =>
			defineWidget({
				name: "NullPrototype",
				defaultState: Object.create(null) as Record<string, unknown>,
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("unsupported custom prototype");
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

	it.each([
		"Widget.Name",
		"Widget:Name",
		"Widget[Name]",
		'Widget"Name',
		"💥Widget",
		"1Widget",
	])("rejects CSS-unsafe widget name %s", (name: string) => {
		expect(() =>
			defineWidget({
				name,
				defaultState: {},
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("^[A-Za-z]");
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

	it("rejects persistence hooks unless persistent is enabled", () => {
		expect(() =>
			defineWidget({
				name: "PersistenceHooksNeedPersistence",
				defaultState: { value: 0 },
				storageVersion: 2,
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("persistent is not true");
	});

	it("rejects invalid persistent storage versions", () => {
		expect(() =>
			defineWidget({
				name: "InvalidStorageVersion",
				defaultState: { value: 0 },
				persistent: true,
				storageVersion: 0,
				render: () => null,
				getReturnValue: () => undefined,
			}),
		).toThrow("positive safe integer");
	});
});

// Calls outside a draw pass

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

// Conditional widgets

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

		// Frame 1 records the widget before its render callback updates state.
		runtime.beginFrame();
		Counter();
		runtime.endFrame();

		// Set the value directly to match a later render update.
		runtime.setState("Counter/Counter", { n: 42 });

		// Frame 2 omits the widget.
		runtime.beginFrame();
		runtime.endFrame();

		// Frame 3 adds the widget again.
		runtime.beginFrame();
		const val = Counter();
		runtime.endFrame();

		runtime.beginFrame();
		runtime.endFrame();

		// One missing frame is within the default generation retention.
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

		// Frame 2 keeps the widget alive.
		runtime.beginFrame();
		const val = Counter();
		runtime.endFrame();

		expect(val).toBe(7);
	});
});

// Temporary state consumption

describe("consumeState", () => {
	it("preserves an explicit undefined consumed value", () => {
		runtime.registerApp(() => {});
		const OneShot = defineWidget<boolean | undefined, [], boolean | undefined>({
			name: "UndefinedOneShot",
			defaultState: true,
			render: () => null,
			getReturnValue: (state) => state,
			consumeState: () => undefined,
		});

		runtime.beginFrame();
		expect(OneShot()).toBe(true);
		runtime.endFrame();

		runtime.beginFrame();
		expect(OneShot()).toBeUndefined();
		runtime.endFrame();

		expect(
			runtime.getStateStore().has("UndefinedOneShot/UndefinedOneShot"),
		).toBe(true);
	});
});

// Widgets created in loops

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

		// Every loop item needs a different ID.
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

		// Frame 1 has three items.
		runtime.beginFrame();
		for (let i = 0; i < 3; i++) {
			runtime.pushIdSegment(`row-${i}`);
			Widget(i);
			runtime.popIdSegment();
		}
		runtime.endFrame();

		// Frame 2 removes one item.
		runtime.beginFrame();
		const results: number[] = [];
		for (let i = 0; i < 2; i++) {
			runtime.pushIdSegment(`row-${i}`);
			results.push(Widget(i));
			runtime.popIdSegment();
		}
		runtime.endFrame();

		// Reused slots must still start with the default state.
		expect(results).toEqual([0, 0]);
	});
});

// widgetProps

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

		// Call the saved render function to inspect the generated props.
		const entries = runtime.getFrameBuffer().get("default")!;
		const entry = entries[0]!;
		entry.renderFn({
			id: entry.id,
			state: {},
			runtimeId: runtime.getInstanceId(),
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

	it("injects pointer-event recovery only for named-layer widget roots", () => {
		runtime.registerApp(() => {});
		const W = defineWidget<{}, [label: string], void>({
			name: "LayerWidget",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});

		runtime.beginFrame();
		W("default");
		runtime.pushLayer("modal");
		W("modal");
		runtime.popLayer();
		runtime.endFrame();

		const defaultEntry = runtime.getFrameBuffer().get("default")?.[0];
		const modalEntry = runtime.getFrameBuffer().get("modal")?.[0];
		expect(defaultEntry?.widgetProps.style).toBeUndefined();
		expect(modalEntry?.widgetProps.style).toEqual({ pointerEvents: "auto" });
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
			runtimeId: runtime.getInstanceId(),
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
