import { describe, expect, it } from "vitest";
import { makeInteractive } from "../makeInteractive";

describe("makeInteractive", () => {
	it("returns tabIndex 0 by default", () => {
		const props = makeInteractive(() => {});
		expect(props.tabIndex).toBe(0);
	});

	it("returns tabIndex -1 when disabled", () => {
		const props = makeInteractive(() => {}, { disabled: true });
		expect(props.tabIndex).toBe(-1);
	});

	it("fires onClick on Enter key", () => {
		let called = false;
		const props = makeInteractive(() => {
			called = true;
		});
		props.onKeyDown({
			key: "Enter",
			preventDefault: () => {},
		} as unknown as import("react").KeyboardEvent);
		expect(called).toBe(true);
	});

	it("fires onClick on Space key", () => {
		let called = false;
		const props = makeInteractive(() => {
			called = true;
		});
		props.onKeyDown({
			key: " ",
			preventDefault: () => {},
		} as unknown as import("react").KeyboardEvent);
		expect(called).toBe(true);
	});

	it("does not fire onClick on unrelated key", () => {
		let called = false;
		const props = makeInteractive(() => {
			called = true;
		});
		props.onKeyDown({
			key: "Tab",
			preventDefault: () => {},
		} as unknown as import("react").KeyboardEvent);
		expect(called).toBe(false);
	});

	it("does not fire onClick when disabled", () => {
		let called = false;
		const props = makeInteractive(
			() => {
				called = true;
			},
			{ disabled: true },
		);
		props.onKeyDown({
			key: "Enter",
			preventDefault: () => {},
		} as unknown as import("react").KeyboardEvent);
		props.onClick();
		expect(called).toBe(false);
	});

	it("includes aria-disabled when disabled", () => {
		const props = makeInteractive(() => {}, { disabled: true });
		expect(props["aria-disabled"]).toBe(true);
	});

	it("omits aria-selected and aria-pressed when not provided", () => {
		const props = makeInteractive(() => {});
		expect(props["aria-selected"]).toBeUndefined();
		expect(props["aria-pressed"]).toBeUndefined();
		expect("aria-selected" in props).toBe(false);
		expect("aria-pressed" in props).toBe(false);
	});

	it("includes aria-selected when selected is provided", () => {
		const selectedProps = makeInteractive(() => {}, { selected: true });
		const unselectedProps = makeInteractive(() => {}, { selected: false });
		expect(selectedProps["aria-selected"]).toBe(true);
		expect(unselectedProps["aria-selected"]).toBe(false);
	});

	it("includes aria-pressed when pressed is provided", () => {
		const pressedProps = makeInteractive(() => {}, { pressed: true });
		expect(pressedProps["aria-pressed"]).toBe(true);
	});

	it("fires onClick on extra keys", () => {
		let called = false;
		const props = makeInteractive(
			() => {
				called = true;
			},
			{ extraKeys: ["ArrowRight"] },
		);
		props.onKeyDown({
			key: "ArrowRight",
			preventDefault: () => {},
		} as unknown as import("react").KeyboardEvent);
		expect(called).toBe(true);
	});
});
