import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { getRuntimeForId } from "./runtime";

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

/**
 * Cache of activation-key Sets keyed by a joined extraKeys signature, so
 * repeated calls with the same extraKeys (the common case -- most widgets
 * pass a stable array) don't allocate a new Set every frame. Unbounded by
 * design: the number of distinct extraKeys combinations in an app is
 * effectively fixed at author-time, not per-instance or per-frame.
 */
const activationKeySetCache = new Map<string, Set<string>>();

function getActivationKeys(extraKeys: string[]): Set<string> {
	if (extraKeys.length === 0) return DEFAULT_ACTIVATION_KEYS;
	const cacheKey = extraKeys.join("\u0000");
	let keys = activationKeySetCache.get(cacheKey);
	if (!keys) {
		keys = new Set(["Enter", " ", ...extraKeys]);
		activationKeySetCache.set(cacheKey, keys);
	}
	return keys;
}

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
		 * Pass a stable, author-time-fixed array (e.g. a module-level
		 * constant), not one built dynamically per widget instance or per
		 * render. Distinct `extraKeys` combinations are cached in an
		 * unbounded, never-evicted module-level map (see
		 * `activationKeySetCache`) on the assumption that the set of distinct
		 * combinations an app uses is small and fixed; per-instance or
		 * per-render arrays would grow that cache without bound.
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

	const activationKeys = getActivationKeys(extraKeys);

	const handleKeyDown = (e: ReactKeyboardEvent) => {
		if (disabled) return;
		if (activationKeys.has(e.key)) {
			e.preventDefault();
			onClick();
		}
	};

	// Route focus/blur only to the runtime that actually owns this id,
	// rather than every mounted runtime on the page. Two separate createApp()
	// roots can legally produce the same composite id (ids are only unique
	// within one runtime's own id-stack namespace), so broadcasting would
	// both do unnecessary work and risk marking an unrelated widget in a
	// different app as focused.
	const handleFocus = id
		? () => {
				getRuntimeForId(id)?.setFocus(id);
			}
		: undefined;

	const handleBlur = id
		? () => {
				const runtime = getRuntimeForId(id);
				if (runtime?.isFocused(id)) runtime.setFocus(null);
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
