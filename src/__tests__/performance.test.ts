import { beforeEach, describe, expect, it } from "vitest";
import { defineWidget } from "../defineWidget";
import { Runtime, setActiveRuntime } from "../runtime";

let runtime: Runtime;
beforeEach(() => {
	runtime = new Runtime();
	setActiveRuntime(runtime);
});

describe("500-widget performance budget", () => {
	it("draws 500 widgets in a single frame in under 16ms", () => {
		runtime.registerApp(() => {});

		const Widget = defineWidget<{}, [n: number], void>({
			name: "PerfWidget",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});

		const start = performance.now();

		runtime.beginFrame();
		for (let i = 0; i < 500; i++) {
			runtime.pushIdSegment(`item-${i}`);
			Widget(i);
			runtime.popIdSegment();
		}
		runtime.endFrame();

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(16);
	});

	it("500-widget GC (all appear and disappear) completes in under 16ms", () => {
		runtime.registerApp(() => {});

		const Widget = defineWidget<{}, [n: number], void>({
			name: "GCWidget",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});

		// Frame 1: populate 500 widgets
		runtime.beginFrame();
		for (let i = 0; i < 500; i++) {
			runtime.pushIdSegment(`item-${i}`);
			Widget(i);
			runtime.popIdSegment();
		}
		runtime.endFrame();

		const start = performance.now();

		// Frame 2: empty; GC prunes all 500 orphans
		runtime.beginFrame();
		runtime.endFrame();

		const elapsed = performance.now() - start;
		expect(elapsed).toBeLessThan(16);
	});
});
