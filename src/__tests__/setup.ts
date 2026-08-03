import { afterEach } from "vitest";
import { mountedRuntimes } from "../runtime";

declare global {
	// React checks this flag to decide whether the current environment
	// reliably supports act()'s synchronous-flush behavior. Vitest's
	// happy-dom environment doesn't set it automatically the way
	// Jest + jsdom + @testing-library/react's setup usually does.
	// `var` is required here TS's `declare global` ambient blocks don't
	// permit `let`/`const` for global variable declarations.
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	// Reset the mounted runtimes between every test so state doesn't leak
	mountedRuntimes.clear();
});
