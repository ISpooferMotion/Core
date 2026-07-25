import { mountedRuntimes } from "./runtime";

/**
 * `makeInteractive` -- accessibility helper for widget authors.
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

/**
 * Default activation keys cached at module load time.
 * Re-using this set avoids a new Set allocation per makeInteractive call per frame.
 */
const DEFAULT_ACTIVATION_KEYS = new Set(["Enter", " "]);

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
		 */
		extraKeys?: string[];
		/** Whether the element is disabled. Disabled elements are not interactive. */
		disabled?: boolean;
		/** The widget ID to track for focus management */
		id?: string;
	} = {},
): {
	tabIndex: number;
	onKeyDown: (e: KeyboardEvent) => void;
	onClick: () => void;
	onFocus?: () => void;
	onBlur?: () => void;
	"aria-disabled"?: boolean;
} {
	const { tabIndex = 0, extraKeys = [], disabled = false, id } = options;

	// Reuse the cached default set when no extra keys are provided.
	const activationKeys =
		extraKeys.length > 0
			? new Set(["Enter", " ", ...extraKeys])
			: DEFAULT_ACTIVATION_KEYS;

	const handleKeyDown = (e: KeyboardEvent) => {
		if (disabled) return;
		if (activationKeys.has(e.key)) {
			e.preventDefault();
			onClick();
		}
	};

	// Use mountedRuntimes directly instead of getActiveRuntime() to avoid
	// throwing when focus events fire outside of a draw pass (which is normal).
	const handleFocus = id
		? () => {
				for (const runtime of mountedRuntimes) {
					runtime.setFocus(id);
				}
			}
		: undefined;

	const handleBlur = id
		? () => {
				for (const runtime of mountedRuntimes) {
					if (runtime.isFocused(id)) runtime.setFocus(null);
				}
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
	};
}
