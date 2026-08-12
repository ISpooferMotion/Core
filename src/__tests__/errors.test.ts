import { describe, expect, it } from "vitest";
import * as errors from "../errors";

describe("error messages", () => {
	it("normalizes Error and non-Error values", () => {
		expect(errors.getErrorMessage(new Error("boom"))).toBe("boom");
		expect(errors.getErrorMessage("plain failure")).toBe("plain failure");
	});

	it("formats widget calls with and without labels", () => {
		expect(errors.widgetOutsideDraw("Button", "Save")).toContain(
			'Button("Save")',
		);
		expect(errors.widgetOutsideDraw("Spacer", undefined)).toContain("Spacer()");
	});

	it("formats every runtime invariant error", () => {
		expect(errors.endWithoutScope()).toContain("no open section");
		expect(errors.unclosedScopes(["Panel", "Window"])).toContain(
			"2 unclosed section(s)",
		);
		expect(errors.duplicateId("Button", "Save")).toContain("Save##1");
		expect(errors.duplicateIdStrict("Button", "Save")).toContain("strictIds");
		expect(errors.endOutsideDraw()).toContain("outside of a draw function");
		expect(errors.idStackOutsideDraw("pushId")).toContain("pushId()");
		expect(errors.popIdEmpty()).toContain("ID stack is empty");
		expect(
			errors.invalidWidgetName("Bad Name", "contains whitespace"),
		).toContain("Bad Name");
		expect(errors.invalidDefaultState("Widget")).toContain("defaultState");
		expect(errors.noActiveRuntime()).toContain("no drawing frame is active");
		expect(errors.unbalancedPopContext("theme")).toContain("theme");
		expect(errors.popDefaultLayer()).toContain("default layer");
		expect(errors.defaultStateNotCloneable("Widget", "bad value")).toContain(
			"bad value",
		);
		expect(
			errors.defaultStateCloneFailure("Widget/id", "clone failed"),
		).toContain("clone failed");
		expect(errors.memoBlockUnbalancedState("section")).toContain("section");
		expect(errors.reactContextInsideMemoBlock()).toContain("hook order");
	});
});
