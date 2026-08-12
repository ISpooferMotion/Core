import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineWidget } from "../defineWidget";
import {
	end,
	getContext,
	getFocusedId,
	isFocused,
	markDirty,
	memoBlock,
	popContext,
	popId,
	popLayer,
	pushContext,
	pushId,
	pushLayer,
	setFocus,
	withContext,
	withId,
	withLayer,
} from "../index";
import { mountedRuntimes, Runtime, setActiveRuntime } from "../runtime";

let runtime: Runtime;

beforeEach(() => {
	vi.useFakeTimers();

	runtime = new Runtime();
	runtime.registerApp(() => {});
	setActiveRuntime(runtime);
});

afterEach(() => {
	if (runtime.isAppMounted()) {
		runtime.unregisterApp();
	}

	mountedRuntimes.clear();
	setActiveRuntime(null);
	vi.useRealTimers();
});

function drawPass(callback: () => void): void {
	runtime.beginFrame();
	callback();
	runtime.endFrame();
}

describe("pushId / popId", () => {
	it("throws when pushId is called outside a draw pass", () => {
		expect(() => pushId("scope-1")).toThrow("[ism]");
	});

	it("throws when popId is called outside a draw pass", () => {
		expect(() => popId()).toThrow("[ism]");
	});

	it("applies the pushed segment as a prefix to subsequent widget IDs", () => {
		drawPass(() => {
			pushId("row-1");

			const id = runtime.buildId("Button", "ok");

			popId();

			expect(id).toContain("row-1");
			expect(id).not.toContain("row-2");
		});
	});

	it("pops correctly and restores the outer prefix", () => {
		drawPass(() => {
			const outerIdBefore = runtime.buildId("Label", "outer");

			pushId("inner");

			const innerId = runtime.buildId("Label", "inner-label");

			popId();

			expect(outerIdBefore).not.toContain("inner/");
			expect(innerId).toContain("inner/");
		});
	});
});

describe("withId", () => {
	it("restores the ID stack after success", () => {
		drawPass(() => {
			const nested = withId("row-1", () => runtime.buildId("Button", "save"));
			const outer = runtime.buildId("Button", "save");
			expect(nested).toContain("row-1/");
			expect(outer).not.toContain("row-1/");
		});
	});

	it("restores the ID stack when the closure throws", () => {
		drawPass(() => {
			expect(() =>
				withId("temporary", () => {
					throw new Error("boom");
				}),
			).toThrow("boom");
			expect(runtime.buildId("Button", "save")).not.toContain("temporary/");
		});
	});
});

describe("pushContext / popContext / getContext", () => {
	it("throws when any context function is called outside a draw pass", () => {
		expect(() => pushContext("theme", "dark")).toThrow("[ism]");
		expect(() => popContext("theme")).toThrow("[ism]");
		expect(() => getContext("theme")).toThrow("[ism]");
	});

	it("round-trips a value through push, get, and pop", () => {
		drawPass(() => {
			pushContext("theme", "dark");

			const value = getContext<string>("theme");

			popContext("theme");

			expect(value).toBe("dark");
		});
	});

	it("returns undefined for a key that was never pushed", () => {
		drawPass(() => {
			expect(getContext("nonexistent")).toBeUndefined();
		});
	});

	it("stacks correctly for the same key", () => {
		drawPass(() => {
			pushContext("size", "sm");
			pushContext("size", "lg");

			expect(getContext<string>("size")).toBe("lg");

			popContext("size");

			expect(getContext<string>("size")).toBe("sm");

			popContext("size");

			expect(getContext<string>("size")).toBeUndefined();
		});
	});

	it("isolates different context keys", () => {
		drawPass(() => {
			pushContext("disabled", true);
			pushContext("theme", "dark");

			expect(getContext<boolean>("disabled")).toBe(true);
			expect(getContext<string>("theme")).toBe("dark");

			popContext("theme");
			popContext("disabled");
		});
	});
});

describe("withContext", () => {
	it("restores context after success and failure", () => {
		drawPass(() => {
			expect(withContext("theme", "dark", () => getContext("theme"))).toBe(
				"dark",
			);
			expect(getContext("theme")).toBeUndefined();
			expect(() =>
				withContext("theme", "light", () => {
					throw new Error("boom");
				}),
			).toThrow("boom");
			expect(getContext("theme")).toBeUndefined();
		});
	});
});

describe("pushLayer / popLayer", () => {
	it("throws when called outside a draw pass", () => {
		expect(() => pushLayer("modal")).toThrow("[ism]");
		expect(() => popLayer()).toThrow("[ism]");
	});

	it("routes subsequent registrations to the named layer", () => {
		drawPass(() => {
			pushLayer("modal");

			expect(runtime.getActiveLayer()).toBe("modal");

			popLayer();

			expect(runtime.getActiveLayer()).toBe("default");
		});
	});

	it("restores default layer after pop", () => {
		drawPass(() => {
			pushLayer("tooltip");
			popLayer();

			expect(runtime.getActiveLayer()).toBe("default");
		});
	});
});

describe("withLayer", () => {
	it("restores the layer after success and failure", () => {
		drawPass(() => {
			expect(withLayer("modal", () => runtime.getActiveLayer())).toBe("modal");
			expect(runtime.getActiveLayer()).toBe("default");
			expect(() =>
				withLayer("tooltip", () => {
					throw new Error("boom");
				}),
			).toThrow("boom");
			expect(runtime.getActiveLayer()).toBe("default");
		});
	});
});

describe("end()", () => {
	it("throws when called outside a draw pass", () => {
		expect(() => end()).toThrow("[ism]");
	});
});

describe("markDirty()", () => {
	it("dispatches to all mounted runtimes", async () => {
		let count = 0;

		const secondRuntime = new Runtime();

		secondRuntime.registerApp(() => {
			count++;
		});

		expect(mountedRuntimes.size).toBe(2);

		markDirty();
		await Promise.resolve();

		expect(count).toBeGreaterThanOrEqual(1);

		secondRuntime.unregisterApp();
	});

	it("coalesces multiple calls in the same microtask", async () => {
		let count = 0;

		const secondRuntime = new Runtime();

		secondRuntime.registerApp(() => {
			count++;
		});

		secondRuntime.markDirty();
		secondRuntime.markDirty();
		secondRuntime.markDirty();

		await Promise.resolve();

		expect(count).toBe(1);

		secondRuntime.unregisterApp();
	});
});

describe("setFocus / isFocused", () => {
	it("tracks focus state", () => {
		setFocus("widget-1");

		expect(isFocused("widget-1")).toBe(true);
		expect(isFocused("widget-2")).toBe(false);
	});

	it("clears focus with null", () => {
		setFocus("widget-1");
		setFocus(null);

		expect(isFocused("widget-1")).toBe(false);
	});

	it("transfers focus between widgets", () => {
		setFocus("widget-1");
		setFocus("widget-2");

		expect(isFocused("widget-1")).toBe(false);
		expect(isFocused("widget-2")).toBe(true);
	});

	it("does not throw with no active runtime", () => {
		setActiveRuntime(null);

		expect(() => setFocus("widget-1")).not.toThrow();
		expect(() => isFocused("widget-1")).not.toThrow();
	});

	it("routes to the ID's owning runtime when no runtime is active", () => {
		let id = "";

		drawPass(() => {
			id = runtime.buildId("Button", "save");
		});

		const otherRuntime = new Runtime();
		otherRuntime.registerApp(() => {});

		setActiveRuntime(null);
		setFocus(id);

		expect(isFocused(id)).toBe(true);
		expect(otherRuntime.isFocused(id)).toBe(false);

		otherRuntime.unregisterApp();
	});

	it("does not broadcast an unowned ID across unrelated runtimes", () => {
		const otherRuntime = new Runtime();
		otherRuntime.registerApp(() => {});

		setActiveRuntime(null);
		setFocus("not-yet-drawn");

		expect(runtime.isFocused("not-yet-drawn")).toBe(false);
		expect(otherRuntime.isFocused("not-yet-drawn")).toBe(false);
		expect(isFocused("not-yet-drawn")).toBe(false);

		otherRuntime.unregisterApp();
	});
});

describe("getFocusedId", () => {
	it("returns null when nothing is focused", () => {
		expect(getFocusedId()).toBeNull();
	});

	it("returns the currently focused ID", () => {
		setFocus("widget-1");

		expect(getFocusedId()).toBe("widget-1");
	});

	it("throws when called with no active runtime", () => {
		setActiveRuntime(null);

		expect(() => getFocusedId()).toThrow("[ism]");
	});
});

describe("memoBlock", () => {
	it("throws when called outside a draw pass", () => {
		expect(() => memoBlock("my-memo", [], () => {})).toThrow("[ism]");
	});

	it("executes the closure on first call", () => {
		let executionCount = 0;

		drawPass(() => {
			memoBlock("test", [1], () => {
				executionCount++;
			});
		});

		expect(executionCount).toBe(1);
	});

	it("skips the closure when dependencies have not changed", () => {
		let executionCount = 0;

		const draw = () => {
			memoBlock("test", [42], () => {
				executionCount++;
			});
		};

		drawPass(draw);
		drawPass(draw);
		drawPass(draw);

		expect(executionCount).toBe(1);
	});

	it("re-executes when a dependency changes", () => {
		let executionCount = 0;

		drawPass(() => {
			memoBlock("test", [1], () => {
				executionCount++;
			});
		});

		drawPass(() => {
			memoBlock("test", [2], () => {
				executionCount++;
			});
		});

		drawPass(() => {
			memoBlock("test", [2], () => {
				executionCount++;
			});
		});

		expect(executionCount).toBe(2);
	});

	it("snapshots a mutable dependency array", () => {
		let executions = 0;
		const dependencies = [1];

		const draw = () => {
			memoBlock("mutable-deps", dependencies, () => {
				executions++;
			});
		};

		drawPass(draw);

		dependencies[0] = 2;

		drawPass(draw);

		expect(executions).toBe(2);
	});

	it("uses a memo namespace that does not collide with widget IDs", () => {
		drawPass(() => {
			memoBlock("settings", [1], () => {});

			const id = runtime.buildId("MemoBlock", "settings");

			expect(id).toContain("MemoBlock");
			expect(id).not.toContain("__memo__");
		});
	});

	it("gives repeated memo blocks distinct stable widget IDs", () => {
		const Widget = defineWidget<Record<string, never>, [label: string], void>({
			name: "MemoItem",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});

		const draw = () => {
			memoBlock("same", [], () => Widget("item"));
			memoBlock("same", [], () => Widget("item"));
		};

		drawPass(draw);

		const firstIds = runtime
			.getFrameBuffer()
			.get("default")
			?.map((entry) => entry.id);

		drawPass(draw);

		const secondIds = runtime
			.getFrameBuffer()
			.get("default")
			?.map((entry) => entry.id);

		expect(firstIds).toEqual(secondIds);
		expect(new Set(firstIds).size).toBe(2);
	});

	it("rebuilds a cached subtree when one of its widget IDs is already used", () => {
		const Widget = defineWidget<Record<string, never>, [label: string], void>({
			name: "MemoCollision",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});

		drawPass(() => {
			memoBlock("block", [], () => Widget("item"));
		});

		drawPass(() => {
			pushId("block");
			Widget("item");
			popId();

			memoBlock("block", [], () => Widget("item"));
		});

		const ids =
			runtime
				.getFrameBuffer()
				.get("default")
				?.map((entry) => entry.id) ?? [];

		expect(new Set(ids).size).toBe(ids.length);
	});

	it("invalidates a memo block when contained widget state changes", () => {
		let executions = 0;
		let observed = false;

		const Event = defineWidget<{ clicked: boolean }, [label: string], boolean>({
			name: "MemoEvent",
			defaultState: { clicked: false },
			render: () => null,
			getReturnValue: (state) => state.clicked,
			consumeState: (state) => ({ ...state, clicked: false }),
		});

		drawPass(() => {
			memoBlock("events", [], () => {
				executions++;
				Event("open");
			});
		});

		runtime.setState("events/MemoEvent/open", { clicked: true });

		drawPass(() => {
			memoBlock("events", [], () => {
				executions++;
				observed = Event("open");
			});
		});

		expect(executions).toBe(2);
		expect(observed).toBe(true);
	});

	it("restores runtime stacks when capture throws", () => {
		drawPass(() => {
			pushId("outer");
			pushContext("theme", "dark");
			pushLayer("overlay");

			const stateRevision = runtime.getInspectionRevision("state");

			expect(() => {
				memoBlock("broken", [], () => {
					popId();
					popContext("theme");
					popLayer();
					throw new Error("boom");
				});
			}).toThrow("boom");

			expect(runtime.getInspectionRevision("state")).toBe(stateRevision);
			expect(getContext("theme")).toBe("dark");
			expect(runtime.getActiveLayer()).toBe("overlay");

			popLayer();
			popContext("theme");
			popId();
		});
	});

	it("rejects and restores unbalanced runtime stacks", () => {
		drawPass(() => {
			pushId("outer");
			pushContext("theme", "dark");
			pushLayer("overlay");

			expect(() => {
				memoBlock("unbalanced", [], () => {
					pushId("leaked-id");
					pushContext("leaked-context", true);
					pushLayer("leaked-layer");
				});
			}).toThrow("runtime stacks unbalanced");

			expect(getContext("theme")).toBe("dark");
			expect(getContext("leaked-context")).toBeUndefined();
			expect(runtime.getActiveLayer()).toBe("overlay");

			popLayer();
			popContext("theme");
			popId();
		});
	});

	it("scopes memo keys to the current ID stack", () => {
		let capturedKeyOne = "";
		let capturedKeyTwo = "";

		drawPass(() => {
			runtime.pushIdSegment("scope-a");

			let ran = false;

			memoBlock("shared-id", [1], () => {
				ran = true;
				capturedKeyOne = "scope-a ran";
			});

			runtime.popIdSegment();

			expect(ran).toBe(true);
		});

		drawPass(() => {
			runtime.pushIdSegment("scope-b");

			let ran = false;

			memoBlock("shared-id", [1], () => {
				ran = true;
				capturedKeyTwo = "scope-b ran";
			});

			runtime.popIdSegment();

			expect(ran).toBe(true);
		});

		expect(capturedKeyOne).toBe("scope-a ran");
		expect(capturedKeyTwo).toBe("scope-b ran");
	});
});
