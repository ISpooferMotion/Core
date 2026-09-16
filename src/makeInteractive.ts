import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { getActiveRuntimeOrNull, getRuntimeForId } from "./runtime";

const spacePressedTargets = new WeakSet<object>();

export function makeInteractive(
	onClick: () => void,
	options: {
		tabIndex?: number;
		extraKeys?: string[];
		disabled?: boolean;
		id?: string;
		role?: string;
		selected?: boolean;
		pressed?: boolean;
	} = {},
): {
	tabIndex: number;
	onKeyDown: (e: ReactKeyboardEvent) => void;
	onKeyUp: (e: ReactKeyboardEvent) => void;
	onClick: () => void;
	onFocus?: () => void;
	onBlur?: (e?: { currentTarget?: EventTarget | null }) => void;
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
			if (event.currentTarget) spacePressedTargets.add(event.currentTarget);
			return;
		}
		if (event.key === "Enter" || extraKeys.includes(event.key)) {
			event.preventDefault();
			onClick();
		}
	};

	const handleKeyUp = (event: ReactKeyboardEvent) => {
		const targetPressed = event.currentTarget
			? spacePressedTargets.has(event.currentTarget)
			: false;
		if (disabled || event.key !== " " || (!spacePressed && !targetPressed))
			return;
		event.preventDefault();
		spacePressed = false;
		if (event.currentTarget) spacePressedTargets.delete(event.currentTarget);
		onClick();
	};

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
	const handleBlur = (event?: { currentTarget?: EventTarget | null }) => {
		spacePressed = false;
		if (event?.currentTarget) spacePressedTargets.delete(event.currentTarget);
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
