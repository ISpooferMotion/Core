import { act, createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	ErrorFallback,
	ISMCoreErrorBoundary,
	shouldShowErrorDetailsByDefault,
} from "../ErrorBoundary";
import { ISMError } from "../errors";
import {
	cleanupTestRoots,
	createTestRoot,
	waitForCondition,
} from "./reactTestUtils";

let container: HTMLDivElement;
beforeEach(() => {
	container = document.createElement("div");
	document.body.appendChild(container);
});
afterEach(() => {
	cleanupTestRoots();
	vi.unstubAllGlobals();
	document.body.replaceChildren();
});

function Bomb({ shouldThrow }: { shouldThrow: boolean }) {
	if (shouldThrow) throw new Error("kaboom");
	return createElement("div", { "data-testid": "ok" }, "fine");
}

describe("ISMCoreErrorBoundary", () => {
	it("renders children normally when nothing throws", () => {
		const root = createTestRoot(container);
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

	it("catches a thrown error and renders null instead of crashing", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const root = createTestRoot(container);
		act(() => {
			root.render(
				createElement(
					ISMCoreErrorBoundary,
					null,
					createElement(Bomb, { shouldThrow: true }),
				),
			);
		});

		expect(container.innerHTML).toBe("");
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("[ism] Widget render error"),
			expect.any(Error),
			expect.any(String),
		);
		consoleError.mockRestore();
	});

	it("calls onError with the caught error and component stack", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const onError = vi.fn();
		const root = createTestRoot(container);
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

	it("contains a consumer onError hook that throws", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const onDiagnostic = vi.fn();
		const root = createTestRoot(container);
		act(() => {
			root.render(
				<ISMCoreErrorBoundary
					onError={() => {
						throw new Error("logging failed");
					}}
					onDiagnostic={onDiagnostic}
				>
					<Bomb shouldThrow={true} />
				</ISMCoreErrorBoundary>,
			);
		});

		expect(container.innerHTML).toBe("");
		expect(onDiagnostic).toHaveBeenCalledWith(
			expect.objectContaining({
				code: "ISM_WIDGET_RENDER_ERROR",
				message: expect.stringContaining("onError hook threw"),
			}),
		);
		consoleError.mockRestore();
	});

	it("falls back to console logging when a custom fallback throws", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const onDiagnostic = vi.fn();
		const root = createTestRoot(container);
		act(() => {
			root.render(
				<ISMCoreErrorBoundary
					onDiagnostic={onDiagnostic}
					renderFallback={() => {
						throw new Error("fallback exploded");
					}}
				>
					<Bomb shouldThrow={true} />
				</ISMCoreErrorBoundary>,
			);
		});

		expect(container.innerHTML).toBe("");
		expect(onDiagnostic).toHaveBeenCalledWith(
			expect.objectContaining({
				message: expect.stringContaining("Custom error fallback threw"),
			}),
		);
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it("supports custom fallback with retry capability", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		let shouldThrow = true;

		function Wrapper() {
			return createElement(
				ISMCoreErrorBoundary,
				{
					renderFallback: ({ onRetry }) =>
						createElement(
							"button",
							{ type: "button", onClick: onRetry },
							"Try again",
						),
				},
				createElement(Bomb, { shouldThrow }),
			);
		}

		const root = createTestRoot(container);
		act(() => root.render(createElement(Wrapper)));
		expect(container.textContent).toContain("Try again");

		shouldThrow = false;
		act(() => root.render(createElement(Wrapper)));
		await act(async () => {
			container
				.querySelector("button")
				?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
		});

		await waitForCondition(
			() => container.textContent?.includes("fine") ?? false,
		);
		expect(container.textContent).toContain("fine");
		consoleError.mockRestore();
	});
});

describe("ErrorFallback", () => {
	it("logs the error to console and renders nothing", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const root = createTestRoot(container);
		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "Something broke",
					error: new Error("oops"),
					errorCode: "ISM_WIDGET_RENDER_ERROR",
				}),
			);
		});

		expect(container.innerHTML).toBe("");
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining(
				"[ism] Something broke (ISM_WIDGET_RENDER_ERROR)",
			),
			expect.any(Error),
			expect.any(String),
		);
		consoleError.mockRestore();
	});

	it("hides detailed message in console when showErrorDetails is false", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const root = createTestRoot(container);
		act(() => {
			root.render(
				createElement(ErrorFallback, {
					title: "Production error",
					error: new Error("secret filesystem path C:/private/source.ts"),
					errorCode: "ISM_WIDGET_RENDER_ERROR",
					showErrorDetails: false,
				}),
			);
		});

		expect(container.innerHTML).toBe("");
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining("Core could not render the current widget tree."),
			expect.any(Error),
			expect.any(String),
		);
		consoleError.mockRestore();
	});
});

describe("production-safe error disclosure", () => {
	it("uses the explicit NODE_ENV value for the default disclosure policy", () => {
		vi.stubGlobal("process", { env: { NODE_ENV: "development" } });
		expect(shouldShowErrorDetailsByDefault()).toBe(true);

		vi.stubGlobal("process", { env: { NODE_ENV: "production" } });
		expect(shouldShowErrorDetailsByDefault()).toBe(false);
	});

	it("fails closed when process is unavailable", () => {
		vi.stubGlobal("process", undefined);
		expect(shouldShowErrorDetailsByDefault()).toBe(false);
	});

	it("fails closed when NODE_ENV is unknown", () => {
		vi.stubGlobal("process", { env: {} });
		expect(shouldShowErrorDetailsByDefault()).toBe(false);
	});

	it("emits the stable code carried by an ISMError", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const onDiagnostic = vi.fn();
		const root = createTestRoot(container);
		function ThrowsCoded(): never {
			throw new ISMError("ISM_DUPLICATE_ID_STRICT", "coded");
		}
		act(() => {
			root.render(
				<ISMCoreErrorBoundary onDiagnostic={onDiagnostic}>
					<ThrowsCoded />
				</ISMCoreErrorBoundary>,
			);
		});
		expect(onDiagnostic).toHaveBeenCalledWith(
			expect.objectContaining({
				code: "ISM_DUPLICATE_ID_STRICT",
				level: "error",
			}),
		);
		consoleError.mockRestore();
	});
});
