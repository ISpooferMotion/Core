import { describe, expect, it, vi } from "vitest";
import { type ISMDiagnostic, ISMError } from "../errors";
import { Runtime } from "../runtime";

describe("structured diagnostics", () => {
	it("emits stable duplicate-id codes through the configured sink", () => {
		const diagnostics: ISMDiagnostic[] = [];
		const runtime = new Runtime(
			undefined,
			undefined,
			undefined,
			false,
			false,
			(diagnostic) => diagnostics.push(diagnostic),
		);
		runtime.beginFrame();
		runtime.buildId("Button", "Save");
		runtime.buildId("Button", "Save");
		runtime.endFrame();

		expect(diagnostics).toHaveLength(1);
		expect(diagnostics[0]?.code).toBe("ISM_DUPLICATE_ID");
		expect(diagnostics[0]?.level).toBe("warning");
		expect(diagnostics[0]?.runtimeId).toBe(runtime.getInstanceId());
	});

	it("strictRuntime converts invariant diagnostics into coded errors", () => {
		const runtime = new Runtime(undefined, undefined, undefined, false, true);
		runtime.beginFrame();
		runtime.pushIdSegment("row");

		let caught: unknown;
		try {
			runtime.prepareFrame();
		} catch (error) {
			caught = error;
		}
		expect(caught).toBeInstanceOf(ISMError);
		expect((caught as ISMError).code).toBe("ISM_UNBALANCED_ID_STACK");
		runtime.abortFrame();
	});

	it("non-strict invariant failures report and recover", () => {
		const diagnostics: ISMDiagnostic[] = [];
		const runtime = new Runtime(
			undefined,
			undefined,
			undefined,
			false,
			false,
			(diagnostic) => diagnostics.push(diagnostic),
		);
		runtime.beginFrame();
		runtime.popIdSegment();
		runtime.endFrame();
		expect(diagnostics.some((item) => item.code === "ISM_POP_ID_EMPTY")).toBe(
			true,
		);
	});

	it("falls back safely when the diagnostic sink itself throws", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const runtime = new Runtime(
			undefined,
			undefined,
			undefined,
			false,
			false,
			() => {
				throw new Error("sink failed");
			},
		);
		runtime.beginFrame();
		runtime.popIdSegment();
		runtime.endFrame();
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});
});
