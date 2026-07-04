import type { ErrorInfo, ReactNode } from "react";
import { Component, createElement } from "react";

interface Props {
	children: ReactNode;
	/** Optional callback fired when an error is caught. */
	onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
	error: Error | null;
}

/**
 * React error boundary for `@ispoofermotion/core` applications.
 *
 * Wraps the immediate-mode app component and catches any uncaught errors
 * thrown during React's render phase (e.g., from a widget's `render` function).
 * Displays a styled plain-English error message instead of a blank screen.
 *
 * `createApp()` wraps its returned component in this boundary automatically.
 * You can also use it directly to wrap subsections of your UI.
 *
 * @since 1.0.0
 *
 * @example
 * ```tsx
 * import { ISMCoreErrorBoundary } from "@ispoofermotion/core";
 *
 * createRoot(root).render(
 *   createElement(ISMCoreErrorBoundary, { onError: (e) => reportError(e) },
 *     createElement(App)
 *   )
 * );
 * ```
 */
export class ISMCoreErrorBoundary extends Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = { error: null };
	}

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	componentDidCatch(error: Error, info: ErrorInfo): void {
		this.props.onError?.(error, info);
		console.error("[ism] Uncaught error in widget render:", error, info);
	}

	render(): ReactNode {
		if (this.state.error) {
			return createElement(
				"div",
				{
					"data-ism-error": "",
					style: {
						display: "flex",
						flexDirection: "column",
						alignItems: "flex-start",
						padding: "16px",
						fontFamily: "monospace",
						fontSize: "13px",
						lineHeight: 1.6,
						color: "#ff6b6b",
						backgroundColor: "rgba(255, 107, 107, 0.05)",
						border: "1px solid rgba(255, 107, 107, 0.2)",
						borderRadius: "6px",
						margin: "8px",
					},
				},
				createElement(
					"strong",
					{ style: { marginBottom: "8px", fontSize: "14px" } },
					"[ism] Widget render error",
				),
				createElement(
					"pre",
					{
						style: {
							margin: 0,
							whiteSpace: "pre-wrap",
							wordBreak: "break-all",
						},
					},
					this.state.error.message,
				),
			);
		}
		return this.props.children;
	}
}

/**
 * @deprecated Since 3.0.0. Use `ISMCoreErrorBoundary` instead.
 */
export { ISMCoreErrorBoundary as ISMLibErrorBoundary };
