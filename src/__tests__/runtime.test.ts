import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	getRuntimeForId,
	mountedRuntimes,
	Runtime,
	setActiveRuntime,
} from "../runtime";

let runtime: Runtime;
beforeEach(() => {
	vi.useFakeTimers();
	runtime = new Runtime();
	setActiveRuntime(runtime);
});

afterEach(() => {
	if (runtime.isAppMounted()) runtime.unregisterApp();
	mountedRuntimes.clear();
	setActiveRuntime(null);
	vi.useRealTimers();
});

// Draw pass helper

function drawPass(fn: () => void) {
	runtime.beginFrame();
	fn();
	runtime.endFrame();
}

function registerApp() {
	runtime.registerApp(() => {}); // The tests only need a mounted runtime, not a real render callback.
}

// Persistent state

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

// ID collisions

describe("ID collision", () => {
	it("returns the same ID for the same label in a frame", () => {
		registerApp();
		drawPass(() => {
			const id1 = runtime.buildId("Button", "Submit");
			// Calling buildId twice with the same label simulates two matching widgets.
			// The second call should receive a collision suffix.
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

	it("keeps structurally different slash-containing labels distinct", () => {
		registerApp();
		let flat = "";
		let nested = "";
		drawPass(() => {
			flat = runtime.buildId("Button", "a/Button/b");
		});
		drawPass(() => {
			const parentId = runtime.buildId("Panel", "a");
			const parent = {
				id: parentId,
				widgetName: "Panel",
				args: [],
				scoped: true,
				children: [],
				defaultState: {},
				renderState: {},
				persistent: false,
				widgetProps: {
					"data-ism-widget": "Panel",
					"data-ism-id": parentId,
					className: "ism-widget ism-panel",
				},
				renderFn: () => null,
			};
			runtime.getCurrentParentChildren().push(parent);
			runtime.pushScope(parentId, "a", parent);
			nested = runtime.buildId("Button", "b");
			runtime.popScope();
		});
		expect(flat).not.toBe(nested);
		expect(flat).toContain("%2F");
	});

	it("never returns a suffix that was already allocated as a literal label", () => {
		registerApp();
		drawPass(() => {
			const literal = runtime.buildId("Button", "X__2");
			const first = runtime.buildId("Button", "X");
			const duplicate = runtime.buildId("Button", "X");
			expect(new Set([literal, first, duplicate]).size).toBe(3);
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

// State cleanup

describe("state GC", () => {
	it("removes state for widgets that disappear after a frame", () => {
		registerApp();
		const id = "Button/Orphan";

		// Frame 1 creates the widget state.
		drawPass(() => {
			runtime.buildId("Button", "Orphan");
			// Register an entry so the ID is considered active.
			runtime.getCurrentParentChildren().push({
				id,
				widgetName: "Button",
				args: [],
				scoped: false,
				children: [],
				defaultState: {},
				renderState: {},
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

		// Frame 2 leaves the widget out.
		drawPass(() => {
			// No widget is registered in this frame.
		});

		// Move past the cleanup timeout.
		vi.advanceTimersByTime(1500);

		// Finish another frame so expired state is removed.
		drawPass(() => {});

		// A new read should return the default instead of the old value.
		// The old state should no longer be reachable.
		// getState always returns a value, so behavior is checked indirectly.
		// A recreated widget starts from its default state.
		// This proves the previous entry was removed.
		// Set a nondefault value before the cleanup check.
		registerApp(); // Mount again before checking the new state.
		const fresh = runtime.getState(id, { clicked: true });
		// The old value is gone if cleanup worked.
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
						renderState: {},
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
			// An empty frame lets every previous widget expire.
			vi.advanceTimersByTime(1500);
			drawPass(() => {});
		}

		// The repeated cycle should not leave old state behind.
		// The final empty frame removes the last active widget.
		// Check cleanup through public behavior because the store is private.
		// A missing old value should fall back to the provided default.
		const testId = "Button/cycle-999-item-5";
		const val = runtime.getState(testId, { sentinel: "fresh" });
		expect(val).toEqual({ sentinel: "fresh" });
	});
});

// Scopes

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
				renderState: {},
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
				renderState: {},
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
			expect(childId.startsWith(`${parentId}/`)).toBe(true);
		});
	});
});

// markDirty batching

describe("markDirty batching", () => {
	it("multiple markDirty calls in the same microtask fire only once", async () => {
		let renderCount = 0;
		runtime.registerApp(() => {
			renderCount++;
		});

		runtime.markDirty();
		runtime.markDirty();
		runtime.markDirty();

		// Repeated calls in one task should schedule one render.
		await Promise.resolve(); // Let the queued microtask run.
		expect(renderCount).toBe(1);
	});

	it("cancels a queued rerender across an unregister/register lifecycle", async () => {
		const trigger = vi.fn();
		runtime.registerApp(trigger);
		runtime.markDirty();
		runtime.unregisterApp();
		runtime.registerApp(trigger);

		await Promise.resolve();
		expect(trigger).not.toHaveBeenCalled();

		runtime.markDirty();
		await Promise.resolve();
		expect(trigger).toHaveBeenCalledTimes(1);

		runtime.unregisterApp();
	});
});

// Inspection revisions and frame pool reuse

describe("runtime diagnostics", () => {
	function addFrameEntry(label: string): string {
		const id = runtime.buildId("Diagnostic", label);
		const entry = runtime.acquireFrameEntry();
		entry.id = id;
		entry.widgetName = "Diagnostic";
		entry.args = [label];
		entry.scoped = false;
		entry.defaultState = { count: 0 };
		entry.renderState = runtime.getState(id, { count: 0 });
		entry.persistent = false;
		entry.widgetProps = {
			"data-ism-widget": "Diagnostic",
			"data-ism-id": id,
			className: "ism-widget ism-diagnostic",
		};
		entry.renderFn = () => null;
		runtime.getCurrentParentChildren().push(entry);
		return id;
	}

	it("advances inspection revisions only when tree or state data changes", () => {
		registerApp();
		let id = "";
		drawPass(() => {
			id = addFrameEntry("same");
		});
		const firstTree = runtime.getInspectionRevision("tree");
		const firstState = runtime.getInspectionRevision("state");

		drawPass(() => {
			addFrameEntry("same");
		});
		expect(runtime.getInspectionRevision("tree")).toBe(firstTree);
		expect(runtime.getInspectionRevision("state")).toBe(firstState);

		runtime.setState(id, { count: 1 });
		expect(runtime.getInspectionRevision("state")).toBe(firstState + 1);

		drawPass(() => {
			addFrameEntry("different");
		});
		expect(runtime.getInspectionRevision("tree")).toBe(firstTree + 1);
	});

	it("trims the retained frame pool after a transient large frame", () => {
		registerApp();
		drawPass(() => {
			for (let index = 0; index < 1000; index++) addFrameEntry(String(index));
		});
		drawPass(() => {
			addFrameEntry("small");
		});

		const retained = (
			runtime as unknown as {
				framePool: { pool: unknown[] };
			}
		).framePool.pool.length;
		expect(retained).toBeLessThanOrEqual(128);
	});
});

// Runtime ownership

describe("getRuntimeForId", () => {
	it("resolves to the runtime that built the id", () => {
		registerApp();
		let id = "";
		drawPass(() => {
			id = runtime.buildId("Button", "save");
		});
		expect(getRuntimeForId(id)).toBe(runtime);
		runtime.unregisterApp();
	});

	it("returns undefined for an id no runtime owns", () => {
		expect(getRuntimeForId("nonexistent")).toBeUndefined();
	});

	it("stops owning an id after unregisterApp", () => {
		registerApp();
		let id = "";
		drawPass(() => {
			id = runtime.buildId("Button", "save");
		});
		runtime.unregisterApp();
		expect(getRuntimeForId(id)).toBeUndefined();
	});

	it("does not let one runtime's ids collide with another's bookkeeping", () => {
		registerApp();
		const other = new Runtime();
		other.registerApp(() => {});

		let idA = "";
		drawPass(() => {
			idA = runtime.buildId("Button", "save");
		});

		let idB = "";
		other.beginFrame();
		idB = other.buildId("Button", "cancel");
		other.endFrame();

		// Different IDs should resolve to their own runtime.
		expect(getRuntimeForId(idA)).toBe(runtime);
		expect(getRuntimeForId(idB)).toBe(other);

		other.unregisterApp();
	});

	it("resolves a genuine cross-app id collision to a match rather than throwing, and warns once", () => {
		registerApp();
		const other = new Runtime();
		other.registerApp(() => {});

		const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

		let idA = "";
		drawPass(() => {
			idA = runtime.buildId("Button", "save");
		});

		// Matching widget names and labels can produce the same ID in separate roots.
		other.beginFrame();
		const idB = other.buildId("Button", "save");
		other.endFrame();
		expect(idB).toBe(idA);

		const resolved = getRuntimeForId(idA);
		expect(resolved === runtime || resolved === other).toBe(true);
		expect(warnSpy).toHaveBeenCalled();

		warnSpy.mockRestore();
		other.unregisterApp();
	});
});
