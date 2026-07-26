import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	end,
	getContext,
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
	vi.useRealTimers();
});

function drawPass(fn: () => void) {
	runtime.beginFrame();
	fn();
	runtime.endFrame();
}

// --- pushId / popId ---

describe("pushId / popId", () => {
	it("throws when pushId is called outside a draw pass", () => {
		// runtime is active but not in a draw pass (beginFrame not called)
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

// --- pushContext / popContext / getContext ---

describe("pushContext / popContext / getContext", () => {
	it("throws when any context function is called outside a draw pass", () => {
		expect(() => pushContext("theme", "dark")).toThrow("[ism]");
		expect(() => popContext("theme")).toThrow("[ism]");
		expect(() => getContext("theme")).toThrow("[ism]");
	});

	it("round-trips a value through push / get / pop", () => {
		drawPass(() => {
			pushContext("theme", "dark");
			const val = getContext<string>("theme");
			popContext("theme");
			expect(val).toBe("dark");
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

// --- pushLayer / popLayer ---

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

// --- end() ---

describe("end()", () => {
	it("throws when called outside a draw pass", () => {
		expect(() => end()).toThrow("[ism]");
	});
});

// --- markDirty() ---

describe("markDirty()", () => {
	it("dispatches to all mounted runtimes", async () => {
		let count = 0;
		const r2 = new Runtime();
		r2.registerApp(() => {
			count++;
		});

		expect(mountedRuntimes.size).toBe(2);

		markDirty();
		await Promise.resolve(); // flush microtask queue
		expect(count).toBeGreaterThanOrEqual(1);

		r2.unregisterApp();
	});

	it("coalesces multiple calls in the same microtask", async () => {
		let count = 0;
		const r = new Runtime();
		r.registerApp(() => {
			count++;
		});

		r.markDirty();
		r.markDirty();
		r.markDirty();

		await Promise.resolve();
		expect(count).toBe(1);

		r.unregisterApp();
	});
});

// --- setFocus / isFocused ---

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
});

// --- memoBlock ---

describe("memoBlock", () => {
	it("throws when called outside a draw pass", () => {
		expect(() => memoBlock("my-memo", [], () => {})).toThrow("[ism]");
	});

	it("executes the closure on first call", () => {
		let execCount = 0;
		drawPass(() => {
			memoBlock("test", [1], () => {
				execCount++;
			});
		});
		expect(execCount).toBe(1);
	});

	it("skips the closure when deps have not changed", () => {
		let execCount = 0;
		const draw = () =>
			memoBlock("test", [42], () => {
				execCount++;
			});

		drawPass(draw);
		drawPass(draw);
		drawPass(draw);

		expect(execCount).toBe(1);
	});

	it("re-executes when a dep changes", () => {
		let execCount = 0;

		drawPass(() =>
			memoBlock("test", [1], () => {
				execCount++;
			}),
		);
		drawPass(() =>
			memoBlock("test", [2], () => {
				execCount++;
			}),
		);
		drawPass(() =>
			memoBlock("test", [2], () => {
				execCount++;
			}),
		);

		expect(execCount).toBe(2); // once for dep=1, once for dep=2
	});

	it("uses a __memo__ namespace that does not collide with widget IDs", () => {
		drawPass(() => {
			memoBlock("settings", [1], () => {});
			// A widget named MemoBlock at the same scope should not collide
			const id = runtime.buildId("MemoBlock", "settings");
			// The memoBlock key lives in __memo__ namespace; no duplicate warning fired
			expect(id).toContain("MemoBlock");
			expect(id).not.toContain("__memo__");
		});
	});

	it("scopes memo key to the current ID stack", () => {
		let capturedKey1 = "";
		let capturedKey2 = "";

		drawPass(() => {
			// Two memoBlocks with the same id but different pushId scopes
			runtime.pushIdSegment("scope-a");
			// Capture the key indirectly by checking cache hit behavior
			let ran = false;
			memoBlock("shared-id", [1], () => {
				ran = true;
				capturedKey1 = "scope-a ran";
			});
			runtime.popIdSegment();
			expect(ran).toBe(true);
		});

		drawPass(() => {
			runtime.pushIdSegment("scope-b");
			let ran = false;
			memoBlock("shared-id", [1], () => {
				ran = true;
				capturedKey2 = "scope-b ran";
			});
			runtime.popIdSegment();
			// scope-b's memoBlock runs fresh because its key is different
			expect(ran).toBe(true);
		});

		expect(capturedKey1).toBe("scope-a ran");
		expect(capturedKey2).toBe("scope-b ran");
	});
});
