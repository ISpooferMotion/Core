import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { getActiveRuntimeOrNull, getRuntimeForId } from "./runtime";

/**
 * `makeInteractive`  accessibility helper for widget authors.
 *
 * Returns props that make any DOM element fully keyboard-accessible:
 * - `tabIndex` for focus reachability
 * - `onKeyDown` handler that fires `onClick` on Enter and Space
 * - `role` if provided
 *
 * Spread these onto the same element as `widgetProps` to get keyboard
 * accessibility without implementing it per-widget.
 *
 * @param onClick - The action to perform when the user activates the element
 * @param options - Optional overrides
 * @returns Props to spread onto the root DOM element
 *
 * @since 1.0.0
 *
 * @example
 * ```ts
 * import { makeInteractive } from "@ispoofermotion/core";
 *
 * render: ({ id, state, setState, widgetProps }) => {
 *   const interactive = makeInteractive(() => setState({ clicked: true }));
 *   return createElement("div", {
 *     key: id,
 *     ...widgetProps,
 *     ...interactive,
 *   }, "Click me");
 * }
 * ```
 */

export function makeInteractive(
	onClick: () => void,
	options: {
		/**
		 * Override the default tabIndex (0 = in natural tab order).
		 * Pass -1 to remove from tab order (e.g., a disabled element).
		 */
		tabIndex?: number;
		/**
		 * Keys that trigger onClick in addition to Enter and Space.
		 * Values are KeyboardEvent.key strings.
		 *
		 */
		extraKeys?: string[];
		/** Whether the element is disabled. Disabled elements are not interactive. */
		disabled?: boolean;
		/** The widget ID to track for focus management */
		id?: string;
		/** ARIA role to apply (e.g. "button", "tab"). Not set if omitted. */
		role?: string;
		/** For role="tab"/role="option"-style widgets: sets aria-selected. Not set if omitted. */
		selected?: boolean;
		/** For toggle-button-style widgets: sets aria-pressed. Not set if omitted. */
		pressed?: boolean;
	} = {},
): {
	tabIndex: number;
	onKeyDown: (e: ReactKeyboardEvent) => void;
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

	const handleKeyDown = (e: ReactKeyboardEvent) => {
		if (disabled) return;
		if (e.key === "Enter" || e.key === " " || extraKeys.includes(e.key)) {
			e.preventDefault();
			onClick();
		}
	};

	// Widget render functions execute with their owning runtime active, so
	// capture that exact instance when possible. This keeps focus routing
	// correct even when two createApp roots produce the same composite ID.
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

	const handleBlur =
		id && owningRuntime
			? () => {
					if (owningRuntime.isFocused(id)) owningRuntime.setFocus(null);
				}
			: undefined;

	// Use conditional spreading so optional properties are absent (not undefined)
	// when they have no value. This satisfies exactOptionalPropertyTypes.
	return {
		tabIndex: disabled ? -1 : tabIndex,
		onKeyDown: handleKeyDown,
		onClick: disabled ? () => {} : onClick,
		...(handleFocus !== undefined ? { onFocus: handleFocus } : {}),
		...(handleBlur !== undefined ? { onBlur: handleBlur } : {}),
		...(disabled ? { "aria-disabled": true } : {}),
		...(selected !== undefined ? { "aria-selected": selected } : {}),
		...(pressed !== undefined ? { "aria-pressed": pressed } : {}),
		...(role !== undefined ? { role } : {}),
	};
}
