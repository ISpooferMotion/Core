import { beforeEach, describe, expect, it } from "vitest";
import { defineWidget } from "../defineWidget";
import { Runtime, setActiveRuntime } from "../runtime";

let runtime: Runtime;
beforeEach(() => {
	runtime = new Runtime();
	setActiveRuntime(runtime);
});

/**
 * Run a small sample and return its median duration in milliseconds.
 *
 * Shared CI machines are noisy, so the first run is used for warmup and the
 * median is less affected by a random pause. These tests are catastrophic
 * regression guards; the scalable benchmark job owns trend-oriented budgets.
 */
function medianDurationMs(fn: () => void, runs = 5): number {
	fn();

	const durations: number[] = [];
	for (let i = 0; i < runs; i++) {
		const start = performance.now();
		fn();
		durations.push(performance.now() - start);
	}
	durations.sort((a, b) => a - b);
	const mid = Math.floor(durations.length / 2);
	if (durations.length % 2 === 0) {
		const lower = durations[mid - 1] ?? 0;
		const upper = durations[mid] ?? 0;
		return (lower + upper) / 2;
	}
	return durations[mid] ?? 0;
}

describe("runtime performance guards", () => {
	it("draws 500 widgets in a single frame well within budget", () => {
		runtime.registerApp(() => {});

		const Widget = defineWidget<{}, [n: number], void>({
			name: "PerfWidget",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});

		const drawFrame = () => {
			runtime.beginFrame();
			for (let i = 0; i < 500; i++) {
				runtime.pushIdSegment(`item-${i}`);
				Widget(i);
				runtime.popIdSegment();
			}
			runtime.endFrame();
		};

		const median = medianDurationMs(drawFrame);
		expect(median).toBeLessThan(100);
	});

	it("generation GC removes 500 disappeared widgets well within budget", () => {
		runtime.registerApp(() => {});

		const Widget = defineWidget<{}, [n: number], void>({
			name: "GCWidget",
			defaultState: {},
			render: () => null,
			getReturnValue: () => undefined,
		});

		const populate = () => {
			runtime.beginFrame();
			for (let i = 0; i < 500; i++) {
				runtime.pushIdSegment(`item-${i}`);
				Widget(i);
				runtime.popIdSegment();
			}
			runtime.endFrame();
		};

		const emptyFramesWithGC = () => {
			populate();
			expect(runtime.getStateStore().size).toBe(500);

			// The default policy keeps state for one missing committed frame.
			runtime.beginFrame();
			runtime.endFrame();
			expect(runtime.getStateStore().size).toBe(500);

			// The second missing frame crosses the generation retention boundary.
			runtime.beginFrame();
			runtime.endFrame();
			expect(runtime.getStateStore().size).toBe(0);
		};

		const median = medianDurationMs(emptyFramesWithGC);
		expect(median).toBeLessThan(100);
	});
});
