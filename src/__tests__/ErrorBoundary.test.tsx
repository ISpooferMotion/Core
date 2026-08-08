import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorFallback, ISMCoreErrorBoundary } from "../ErrorBoundary";

let container: HTMLDivElement;
beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
});
afterEach(() => {
	document.body.removeChild(container);
});

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
	if (shouldThrow) {
		throw new Error("kaboom");
	}
	return createElement("div", { "data-testid": "ok" }, "fine");
}

describe("ISMCoreErrorBoundary", () => {
	it("renders children normally when nothing throws", () => {
		const root = createRoot(container);
		act(() => {
			root.render(
				createElement(
					ISMCoreErrorBoundary,
					null,
					createElement(Bomb, { shouldThrow: false }),
				),
			);
		});
		expect(container.textContent).toContain("fine");
	});

	it("catches a thrown error and renders the fallback instead of crashing", () => {
		// React logs caught boundary errors to the console.
		// Silence that expected noise so assertion failures stay visible.
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		const root = createRoot(container);
		act(() => {
			root.render(
				createElement(
					ISMCoreErrorBoundary,
					null,
					createElement(Bomb, { shouldThrow: true }),
				),
			);
		});

		expect(container.querySelector("[data-ism-error]")).not.toBeNull();
		expect(container.textContent).toContain("kaboom");
		consoleError.mockRestore();
	});

	it("calls onError with the caught error and component stack", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const onError = vi.fn();

		const root = createRoot(container);
		act(() => {
			root.render(
				<ISMCoreErrorBoundary onError={onError}>
					<Bomb shouldThrow={true} />
				</ISMCoreErrorBoundary>,
			);
		});

		expect(onError).toHaveBeenCalledTimes(1);
		const [error, info] = onError.mock.calls[0] as [
			Error,
			{ componentStack?: string },
		];
		expect(error.message).toBe("kaboom");
		expect(typeof info.componentStack).toBe("string");
		consoleError.mockRestore();
	});

	it("recovers when the retry button is clicked and children stop throwing", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		let shouldThrow = true;

		function Wrapper() {
			return createElement(
				ISMCoreErrorBoundary,
				null,
				createElement(Bomb, { shouldThrow }),
			);
		}

		const root = createRoot(container);
		act(() => {
			root.render(createElement(Wrapper));
		});
		expect(container.querySelector("[data-ism-error]")).not.toBeNull();

		// Update the parent first so the boundary receives safe children.
		// Retry only clears the boundary state.
		// It does not replace props.children on its own.
		// Retrying with the old throwing child would immediately fail again.
		// The second retry should render the fixed child.
		shouldThrow = false;
		act(() => {
			root.render(createElement(Wrapper));
		});
		expect(container.querySelector("[data-ism-error]")).not.toBeNull();

		const retryButton = container.querySelector("button");
		expect(retryButton).not.toBeNull();
		act(() => {
			retryButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(container.querySelector("[data-ism-error]")).toBeNull();
		expect(container.textContent).toContain("fine");
		consoleError.mockRestore();
	});
});

describe("ErrorFallback", () => {
	it("announces itself to assistive technology and hides the decorative icon", () => {
		const root = createRoot(container);
		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "Something broke",
					error: "oops",
				}),
			);
		});

		const alertEl = container.querySelector('[role="alert"]');
		expect(alertEl).not.toBeNull();
		expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
			"true",
		);
	});

	it("keeps long error content accessible with viewport-bounded scrolling", () => {
		const root = createRoot(container);
		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "Long error",
					error: new Error("x".repeat(10_000)),
				}),
			);
		});

		const alertEl = container.querySelector<HTMLElement>('[role="alert"]');
		expect(alertEl?.style.maxHeight).toBe("calc(100vh - 32px)");
		expect(alertEl?.style.overflowY).toBe("auto");
		expect(alertEl?.style.overflowX).toBe("hidden");
	});

	it("accepts a string error as well as an Error instance", () => {
		const root = createRoot(container);
		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "Oops",
					error: "plain string error",
				}),
			);
		});
		expect(container.textContent).toContain("plain string error");
	});

	it("shows render-specific tips for kind='render' and draw-specific tips for kind='draw'", () => {
		const root = createRoot(container);
		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "Render error",
					error: "x",
					kind: "render",
				}),
			);
		});
		expect(container.textContent).toContain("widget render functions");

		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "Draw error",
					error: "x",
					kind: "draw",
				}),
			);
		});
		expect(container.textContent).toContain("draw loop");
	});

	it("shows a stack trace section when a stack or component stack is present, and omits it otherwise", () => {
		const root = createRoot(container);
		act(() => {
			root.render(
				createElement(ErrorFallback, { title: "t", error: "no stack here" }),
			);
		});
		expect(container.textContent).not.toContain("Stack Trace:");

		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "t",
					error: new Error("with stack"),
				}),
			);
		});
		expect(container.textContent).toContain("Stack Trace:");
	});

	it("shows a Try again button only when onRetry is provided, and calls it on click", () => {
		const onRetry = vi.fn();
		const root = createRoot(container);

		act(() => {
			root.render(createElement(ErrorFallback, { title: "t", error: "x" }));
		});
		expect(container.querySelector("button")).toBeNull();

		act(() => {
			root.render(
				createElement(ErrorFallback, { title: "t", error: "x", onRetry }),
			);
		});
		const button = container.querySelector("button");
		expect(button).not.toBeNull();
		act(() => {
			button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(onRetry).toHaveBeenCalledTimes(1);
	});
});
