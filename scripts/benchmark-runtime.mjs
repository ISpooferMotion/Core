import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const root = process.cwd();
const budgets = JSON.parse(
	await readFile(resolve(root, "performance-budgets.json"), "utf8"),
).runtime;
const temp = await mkdtemp(resolve(tmpdir(), "ism-runtime-bench-"));
const entry = resolve(temp, "entry.ts");
const output = resolve(temp, "entry.mjs");

const source = `
import { performance } from "node:perf_hooks";
import { Runtime, setActiveRuntime } from ${JSON.stringify(resolve(root, "src/runtime.ts"))};
import { defineWidget } from ${JSON.stringify(resolve(root, "src/defineWidget.ts"))};

function median(fn, runs = 5) {
  fn();
  const values = [];
  for (let index = 0; index < runs; index++) {
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] ?? 0;
}

function createWidget(name) {
  return defineWidget({
    name,
    defaultState: { value: 0 },
    render: () => null,
    getReturnValue: () => undefined,
  });
}

function benchmarkFrames() {
  const runtime = new Runtime();
  runtime.registerApp(() => {});
  setActiveRuntime(runtime);
  const Widget = createWidget("BenchmarkWidget");
  const draw = (count) => {
    runtime.beginFrame();
    for (let index = 0; index < count; index++) {
      runtime.pushIdSegment(String(index));
      Widget(index);
      runtime.popIdSegment();
    }
    runtime.endFrame();
  };
  const sizes = [500, 1000, 5000, 10000];
  const results = Object.fromEntries(
    sizes.map((size) => [size, median(() => draw(size), size >= 5000 ? 3 : 5)]),
  );
  runtime.unregisterApp();
  return results;
}

function benchmarkGc() {
  const runtime = new Runtime(undefined, undefined, undefined, false, false, undefined, 0);
  runtime.registerApp(() => {});
  setActiveRuntime(runtime);
  const Widget = createWidget("BenchmarkGcWidget");
  const populate = () => {
    runtime.beginFrame();
    for (let index = 0; index < 10000; index++) {
      runtime.pushIdSegment(String(index));
      Widget(index);
      runtime.popIdSegment();
    }
    runtime.endFrame();
  };
  const sample = () => {
    populate();
    const start = performance.now();
    runtime.beginFrame();
    runtime.endFrame();
    const duration = performance.now() - start;
    if (runtime.getStateStore().size !== 0) throw new Error("GC benchmark did not collect all state.");
    return duration;
  };
  sample();
  const values = [sample(), sample(), sample()].sort((a, b) => a - b);
  runtime.unregisterApp();
  return values[1] ?? 0;
}

function benchmarkMemoHit() {
  const runtime = new Runtime();
  runtime.registerApp(() => {});
  setActiveRuntime(runtime);
  const Widget = createWidget("BenchmarkMemoWidget");
  runtime.beginFrame();
  const subtree = runtime.captureSubtree("benchmark", () => {
    for (let index = 0; index < 1000; index++) {
      runtime.pushIdSegment(String(index));
      Widget(index);
      runtime.popIdSegment();
    }
  });
  runtime.appendCapturedSubtree(subtree);
  runtime.endFrame();

  const sample = () => {
    runtime.beginFrame();
    if (!runtime.pushCachedSubtree(subtree)) throw new Error("Memo benchmark subtree collided unexpectedly.");
    runtime.endFrame();
  };
  const result = median(sample, 5);
  runtime.unregisterApp();
  return result;
}

export const results = {
  frames: benchmarkFrames(),
  gc10000Ms: benchmarkGc(),
  memoHit1000Ms: benchmarkMemoHit(),
};
`;

try {
	await writeFile(entry, source);
	await build({
		entryPoints: [entry],
		outfile: output,
		bundle: true,
		platform: "node",
		format: "esm",
		target: "node22",
		logLevel: "silent",
	});
	const { results } = await import(`${pathToFileURL(output).href}?t=${Date.now()}`);
	console.log(JSON.stringify(results, null, 2));

	const frame1000 = results.frames[1000];
	const largest = results.frames[budgets.largestFrameWidgets];
	const perWidget1000 = frame1000 / 1000;
	const perWidgetLargest = largest / budgets.largestFrameWidgets;
	const slowdown = perWidgetLargest / Math.max(perWidget1000, 0.000001);

	const failures = [];
	if (largest > budgets.largestFrameMaxMs) {
		failures.push(`largest frame ${largest.toFixed(2)}ms > ${budgets.largestFrameMaxMs}ms`);
	}
	if (slowdown > budgets.maxPerWidgetSlowdownFrom1000To10000) {
		failures.push(
			`per-widget slowdown ${slowdown.toFixed(2)}x > ${budgets.maxPerWidgetSlowdownFrom1000To10000}x`,
		);
	}
	if (results.gc10000Ms > budgets.gc10000MaxMs) {
		failures.push(`10k GC ${results.gc10000Ms.toFixed(2)}ms > ${budgets.gc10000MaxMs}ms`);
	}
	if (results.memoHit1000Ms > budgets.memoHit1000MaxMs) {
		failures.push(
			`1k memo hit ${results.memoHit1000Ms.toFixed(2)}ms > ${budgets.memoHit1000MaxMs}ms`,
		);
	}
	if (failures.length > 0) {
		console.error(`Runtime performance budget failed:\n- ${failures.join("\n- ")}`);
		process.exit(1);
	}
} finally {
	await rm(temp, { recursive: true, force: true });
}
