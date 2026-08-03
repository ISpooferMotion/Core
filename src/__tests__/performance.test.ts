import { beforeEach, describe, expect, it } from "vitest";
import { defineWidget } from "../defineWidget";
import { Runtime, setActiveRuntime } from "../runtime";

let runtime: Runtime;
beforeEach(() => {
	runtime = new Runtime();
	setActiveRuntime(runtime);
});

/**
 * Run `fn` a few times and return the median duration in milliseconds.
 *
 * A single wall-clock measurement on a shared CI runner is noisy (GC
 * pauses, CPU contention, and  on the very first call  the JIT hasn't
 * optimized the hot path yet). Discarding a warm-up run and taking the
 * median of several timed runs smooths out that noise without requiring a
 * dedicated benchmarking harness. This is a regression smoke test, not a
 * precise micro-benchmark: it's meant to catch "someone accidentally made
 * the hot path quadratic," not to enforce a strict per-millisecond budget.
 */
function medianDurationMs(fn: () => void, runs = 5): number {
	// Warm-up: let the JIT optimize the hot path before any timed run.
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
		// Generous on purpose  this is a smoke test for gross regressions
		// (e.g. an accidental O(n^2) path), not a tight perf gate. A single
		// frame of 500 trivial widgets should never approach 100ms even on a
		// slow, contended CI runner; a real regression would blow well past it.
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
