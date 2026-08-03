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
 * median is less affected by a random pause. This test only catches major
 * regressions such as accidentally making the hot path quadratic.
 */
function medianDurationMs(fn: () => void, runs = 5): number {
	// Warm up the JIT before collecting timings.
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

describe("500-widget performance budget", () => {
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
		// The limit is intentionally loose.
		// This catches obvious complexity regressions without making CI flaky.
		// Five hundred simple widgets should stay far below the limit.
		// A real regression will miss it by a large margin.
		expect(median).toBeLessThan(100);
	});

	it("500-widget GC (all appear and disappear) completes well within budget", () => {
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

		const emptyFrameWithGC = () => {
			populate();
			runtime.beginFrame();
			runtime.endFrame();
		};

		const median = medianDurationMs(emptyFrameWithGC);
		expect(median).toBeLessThan(100);
	});
});
