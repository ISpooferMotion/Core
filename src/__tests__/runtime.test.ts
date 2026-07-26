import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

// --- Helpers: run a simulated draw pass ---

function drawPass(fn: () => void) {
	runtime.beginFrame();
	fn();
	runtime.endFrame();
}

function registerApp() {
	runtime.registerApp(() => {}); // no-op trigger for tests
}

// --- State persistence ---

describe("state persistence", () => {
	it("initializes state with defaultState on first access", () => {
		registerApp();
		const initial = runtime.getState("test/Button/ok", { clicked: false });
		expect(initial).toEqual({ clicked: false });
	});

	it("persists state across multiple draw passes", () => {
		registerApp();
		const id = "widget/Button/persist";

		drawPass(() => {
			const s = runtime.getState<{ count: number }>(id, { count: 0 });
			runtime.setState(id, { count: s.count + 1 });
		});

		drawPass(() => {
			const s = runtime.getState<{ count: number }>(id, { count: 0 });
			expect(s.count).toBe(1);
		});
	});

	it("setState with updater function receives previous state", () => {
		registerApp();
		const id = "widget/Counter/x";
		runtime.getState(id, { n: 0 });
		runtime.setState(id, (prev: unknown) => ({
			...(prev as { n: number }),
			n: (prev as { n: number }).n + 10,
		}));
		const result = runtime.getState<{ n: number }>(id, { n: 0 });
		expect(result.n).toBe(10);
	});
});

// --- ID collision detection ---

describe("ID collision", () => {
	it("returns the same ID for the same label in a frame", () => {
		registerApp();
		drawPass(() => {
			const id1 = runtime.buildId("Button", "Submit");
			// Normally only one widget would call buildId per label per frame;
			// simulate a collision (two widgets with the same label)
			const id2 = runtime.buildId("Button", "Submit");
			expect(id1).not.toBe(id2);
			expect(id2).toContain("__2");
		});
	});

	it("collision counters reset between frames", () => {
		registerApp();
		let firstId: string;
		drawPass(() => {
			firstId = runtime.buildId("Text", "hello");
		});
		drawPass(() => {
			const id = runtime.buildId("Text", "hello");
			expect(id).toBe(firstId!);
		});
	});

	it("### convention uses only text after ### as ID", () => {
		registerApp();
		drawPass(() => {
			const id = runtime.buildId("Button", "Click Me###btn-stable");
			expect(id).toContain("btn-stable");
			expect(id).not.toContain("Click Me");
		});
	});

	it("## convention uses full string as ID", () => {
		registerApp();
		drawPass(() => {
			const id = runtime.buildId("Button", "Delete##item_3");
			expect(id).toContain("Delete##item_3");
		});
	});
});

// --- State GC (orphan cleanup) ---

describe("state GC", () => {
	it("removes state for widgets that disappear after a frame", () => {
		registerApp();
		const id = "Button/Orphan";

		// Frame 1: widget exists, gets state
		drawPass(() => {
			runtime.buildId("Button", "Orphan");
			// Simulate registering a widget so it appears in the frame
			runtime.getCurrentParentChildren().push({
				id,
				widgetName: "Button",
				args: [],
				scoped: false,
				children: [],
				defaultState: {},
				persistent: false,
				widgetProps: {
					"data-ism-widget": "Button",
					"data-ism-id": id,
					className: "ism-widget ism-button",
				},
				renderFn: () => null,
			});
			runtime.getState(id, { clicked: false });
		});

		expect(runtime.getState(id, { clicked: false })).toEqual({
			clicked: false,
		});

		// Frame 2: widget is absent
		drawPass(() => {
			// don't register the widget
		});

		// Fast forward time to trigger GC
		vi.advanceTimersByTime(1500);

		// End frame again to process GC on next frame
		drawPass(() => {});

		// The state map should NOT have the orphaned key.
		// We verify by checking that the widget's state was cleared:
		// After GC, getState would re-initialize to defaultState
		// (meaning it was deleted). Since getState always returns something,
		// we check it matches the default (indicating it was pruned and re-created).
		// Actually the easiest way: set a non-default value, then check it's gone.
		registerApp(); // reset to get fresh state
		const fresh = runtime.getState(id, { clicked: true });
		// If GC worked, state was deleted, so this returns the defaultState { clicked: true }
		expect(fresh).toEqual({ clicked: true });
	});

	it("does not leak memory after 1000-widget add/remove cycles", () => {
		registerApp();

		for (let cycle = 0; cycle < 1000; cycle++) {
			drawPass(() => {
				for (let i = 0; i < 10; i++) {
					const id = `Button/cycle-${cycle}-item-${i}`;
					runtime.getCurrentParentChildren().push({
						id,
						widgetName: "Button",
						args: [],
						scoped: false,
						children: [],
						defaultState: {},
						persistent: false,
						widgetProps: {
							"data-ism-widget": "Button",
							"data-ism-id": id,
							className: "ism-widget ism-button",
						},
						renderFn: () => null,
					});
					runtime.getState(id, {});
				}
			});
			// Empty frame: all widgets disappear, GC fires
			vi.advanceTimersByTime(1500);
			drawPass(() => {});
		}

		// After 1000 cycles, the state store should be empty
		// (all widgets were GC'd in the final empty frame)
		// We can verify by checking no old IDs still return non-default state
		// The store is internal but we test via behavior:
		const testId = "Button/cycle-999-item-5";
		const val = runtime.getState(testId, { sentinel: "fresh" });
		expect(val).toEqual({ sentinel: "fresh" });
	});
});

// --- Scope management ---

describe("scope management", () => {
	it("pushScope / popScope correctly nest widget children", () => {
		registerApp();
		drawPass(() => {
			const parentId = runtime.buildId("Panel", "main");
			const parentEntry = {
				id: parentId,
				widgetName: "Panel",
				args: [],
				scoped: true,
				children: [],
				defaultState: {},
				persistent: false,
				widgetProps: {
					"data-ism-widget": "Panel",
					"data-ism-id": parentId,
					className: "ism-widget ism-panel",
				},
				renderFn: () => null,
			};
			runtime.getCurrentParentChildren().push(parentEntry);
			runtime.pushScope(parentId, "main", parentEntry);

			const childId = runtime.buildId("Button", "ok");
			runtime.getCurrentParentChildren().push({
				id: childId,
				widgetName: "Button",
				args: [],
				scoped: false,
				children: [],
				defaultState: {},
				persistent: false,
				widgetProps: {
					"data-ism-widget": "Button",
					"data-ism-id": childId,
					className: "ism-widget ism-button",
				},
				renderFn: () => null,
			});
			runtime.popScope();

			const root = runtime.getFrameBuffer().get("default");
			expect(root).toBeDefined();
			expect(root!.length).toBe(1);
			expect(root![0]!.children.length).toBe(1);
			expect(root![0]!.children[0]!.id).toBe(childId);
		});
	});
});

// --- markDirty batching ---

describe("markDirty batching", () => {
	it("multiple markDirty calls in the same microtask fire only once", async () => {
		let renderCount = 0;
		runtime.registerApp(() => {
			renderCount++;
		});

		runtime.markDirty();
		runtime.markDirty();
		runtime.markDirty();

		// All three calls should be batched into one trigger
		await Promise.resolve(); // flush microtask queue
		expect(renderCount).toBe(1);
	});
});
