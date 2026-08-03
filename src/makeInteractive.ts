import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { getActiveRuntimeOrNull, getRuntimeForId } from "./runtime";

/**
 * Build common keyboard and focus props for a custom interactive element.
 *
 * The returned object adds a tab index, handles Enter and Space, and can add
 * ARIA state. Spread it onto the same element as `widgetProps`.
 *
 * @param onClick Action to run when the element is activated.
 * @param options Optional keyboard, focus, and ARIA settings.
 * @returns Props for the interactive DOM element.
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
 *       ...makeInteractive(() => setState({ clicked: true })),
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
		/** Extra `KeyboardEvent.key` values that should trigger activation. */
		extraKeys?: string[];
		/** Disable click and keyboard activation. */
		disabled?: boolean;
		/** Widget ID used by the runtime focus helpers. */
		id?: string;
		/** Optional ARIA role for the element. */
		role?: string;
		/** Optional `aria-selected` state. */
		selected?: boolean;
		/** Optional `aria-pressed` state. */
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

	// Prefer the runtime that is active while the widget renders.
	// This keeps focus routing correct when separate app roots share an ID.
	// Fall back to finding the runtime by widget ID.
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

	// Leave optional props out completely when they do not have a value.
	// This also keeps exactOptionalPropertyTypes happy.
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
