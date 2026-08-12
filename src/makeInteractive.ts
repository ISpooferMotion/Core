import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { getActiveRuntimeOrNull, getRuntimeForId } from "./runtime";

/**
 * Build keyboard, focus, and ARIA props for a custom interactive element.
 *
 * Use this helper for non-native controls such as `<div role="button">`.
 * Do not spread it onto `<button>`, `<input>`, `<select>`, `<textarea>`, or
 * another native interactive element; native controls already implement their
 * own keyboard activation and disabled semantics.
 *
 * Enter activates on keydown. Space prevents scrolling on keydown and activates
 * on keyup, matching native button timing more closely. Repeated keydown events
 * are ignored for one-shot activation.
 *
 * @param onClick Action to run when the custom element is activated.
 * @param options Optional keyboard, focus, and ARIA settings.
 * @returns Props for the custom interactive DOM element.
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * render: ({ id, setState, widgetProps }) =>
 *   createElement(
 *     "div",
 *     {
 *       key: id,
 *       ...widgetProps,
 *       ...makeInteractive(() => setState({ clicked: true }), {
 *         id,
 *         role: "button",
 *       }),
 *     },
 *     "Click me",
 *   )
 * ```
 */
export function makeInteractive(
	onClick: () => void,
	options: {
		/**
		 * Tab index applied to the element. The default is `0`.
		 * Use `-1` when the element should only receive programmatic focus.
		 */
		tabIndex?: number;
		/** Extra `KeyboardEvent.key` values that should trigger on keydown. */
		extraKeys?: string[];
		/** Disable custom click and keyboard activation. This is not native `disabled`. */
		disabled?: boolean;
		/** Widget ID used by the runtime focus helpers. */
		id?: string;
		/** Optional ARIA role for the custom element. */
		role?: string;
		/** Optional `aria-selected` state. */
		selected?: boolean;
		/** Optional `aria-pressed` state. */
		pressed?: boolean;
	} = {},
): {
	tabIndex: number;
	onKeyDown: (e: ReactKeyboardEvent) => void;
	onKeyUp: (e: ReactKeyboardEvent) => void;
	onClick: () => void;
	onFocus?: () => void;
	onBlur?: () => void;
	"aria-disabled"?: boolean;
	"aria-selected"?: boolean;
	"aria-pressed"?: boolean;
	role?: string;
} {
	const {
		tabIndex = 0,
		extraKeys = [],
		disabled = false,
		id,
		role,
		selected,
		pressed,
	} = options;

	let spacePressed = false;
	const handleKeyDown = (event: ReactKeyboardEvent) => {
		if (disabled || event.repeat) return;
		if (event.key === " ") {
			event.preventDefault();
			spacePressed = true;
			return;
		}
		if (event.key === "Enter" || extraKeys.includes(event.key)) {
			event.preventDefault();
			onClick();
		}
	};

	const handleKeyUp = (event: ReactKeyboardEvent) => {
		if (disabled || event.key !== " " || !spacePressed) return;
		event.preventDefault();
		spacePressed = false;
		onClick();
	};

	// Widget render functions execute with their owning runtime active. The ID
	// lookup fallback is retained for compatibility with helpers created later.
	const activeRuntime = id ? getActiveRuntimeOrNull() : null;
	const owningRuntime = id
		? activeRuntime?.ownsId(id)
			? activeRuntime
			: getRuntimeForId(id)
		: undefined;
	const handleFocus =
		id && owningRuntime
			? () => {
					owningRuntime.setFocus(id);
				}
			: undefined;
	const handleBlur = () => {
		spacePressed = false;
		if (id && owningRuntime?.isFocused(id)) owningRuntime.setFocus(null);
	};

	return {
		tabIndex: disabled ? -1 : tabIndex,
		onKeyDown: handleKeyDown,
		onKeyUp: handleKeyUp,
		onClick: disabled ? () => {} : onClick,
		...(handleFocus !== undefined ? { onFocus: handleFocus } : {}),
		onBlur: handleBlur,
		...(disabled ? { "aria-disabled": true } : {}),
		...(selected !== undefined ? { "aria-selected": selected } : {}),
		...(pressed !== undefined ? { "aria-pressed": pressed } : {}),
		...(role !== undefined ? { role } : {}),
	};
}
