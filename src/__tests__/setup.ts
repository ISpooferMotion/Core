import { afterEach } from "vitest";
import { mountedRuntimes } from "../runtime";

declare global {
	// React uses this flag to check whether act can flush updates correctly.
	// happy-dom does not set it for Vitest automatically.
	// Tests that trigger React updates depend on it.
	// Setting it here matches the usual testing library setup.
	// Global ambient declarations require var here.
	// let and const are not allowed in this declaration block.
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	// Clear mounted runtimes after each test to prevent state leaks.
	mountedRuntimes.clear();
});
