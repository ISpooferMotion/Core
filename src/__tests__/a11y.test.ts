import { describe, expect, it } from "vitest";
import { makeInteractive } from "../makeInteractive";

function keyboardEvent(
	key: string,
	options: { repeat?: boolean; preventDefault?: () => void } = {},
): import("react").KeyboardEvent {
	return {
		key,
		repeat: options.repeat ?? false,
		preventDefault: options.preventDefault ?? (() => {}),
	} as unknown as import("react").KeyboardEvent;
}

describe("makeInteractive", () => {
	it("returns tabIndex 0 by default", () => {
		const props = makeInteractive(() => {});
		expect(props.tabIndex).toBe(0);
	});

	it("returns tabIndex -1 when disabled", () => {
		const props = makeInteractive(() => {}, { disabled: true });
		expect(props.tabIndex).toBe(-1);
	});

	it("fires on Enter keydown", () => {
		let called = 0;
		const props = makeInteractive(() => {
			called++;
		});
		props.onKeyDown(keyboardEvent("Enter"));
		expect(called).toBe(1);
	});

	it("prevents Space scrolling on keydown and activates on keyup", () => {
		let called = 0;
		let prevented = 0;
		const props = makeInteractive(() => {
			called++;
		});
		props.onKeyDown(
			keyboardEvent(" ", {
				preventDefault: () => {
					prevented++;
				},
			}),
		);
		expect(called).toBe(0);
		props.onKeyUp(
			keyboardEvent(" ", {
				preventDefault: () => {
					prevented++;
				},
			}),
		);
		expect(called).toBe(1);
		expect(prevented).toBe(2);
	});

	it("does not activate Space keyup without a matching keydown", () => {
		let called = 0;
		const props = makeInteractive(() => {
			called++;
		});
		props.onKeyUp(keyboardEvent(" "));
		expect(called).toBe(0);
	});

	it("ignores repeated keydown activation", () => {
		let called = 0;
		const props = makeInteractive(() => {
			called++;
		});
		props.onKeyDown(keyboardEvent("Enter", { repeat: true }));
		props.onKeyDown(keyboardEvent("ArrowRight", { repeat: true }));
		expect(called).toBe(0);
	});

	it("does not fire on unrelated key", () => {
		let called = 0;
		const props = makeInteractive(() => {
			called++;
		});
		props.onKeyDown(keyboardEvent("Tab"));
		props.onKeyUp(keyboardEvent("Tab"));
		expect(called).toBe(0);
	});

	it("does not fire when disabled", () => {
		let called = 0;
		const props = makeInteractive(
			() => {
				called++;
			},
			{ disabled: true },
		);
		props.onKeyDown(keyboardEvent("Enter"));
		props.onKeyUp(keyboardEvent(" "));
		props.onClick();
		expect(called).toBe(0);
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

	it("fires extra keys on keydown", () => {
		let called = 0;
		const props = makeInteractive(
			() => {
				called++;
			},
			{ extraKeys: ["ArrowRight"] },
		);
		props.onKeyDown(keyboardEvent("ArrowRight"));
		expect(called).toBe(1);
	});
});
