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

/**
 * A styled fallback UI for displaying errors caught by `ISMCoreErrorBoundary`
 * or `createApp`'s internal draw pass.
 *
 * @since 3.2.0
 */
export function ErrorFallback({
	title,
	error,
	info,
}: {
	title: string;
	error: Error | string;
	info?: ErrorInfo;
}): ReactNode {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const stackTrace = error instanceof Error ? error.stack : undefined;

	return createElement(
		"div",
		{
			"data-ism-error": "",
			style: {
				display: "flex",
				flexDirection: "column",
				padding: "24px",
				fontFamily: "system-ui, -apple-system, sans-serif",
				color: "#f8f9fa",
				backgroundColor: "#212529",
				border: "1px solid #fa5252",
				borderLeft: "4px solid #fa5252",
				borderRadius: "8px",
				margin: "16px",
				boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
				maxWidth: "100%",
				overflow: "hidden",
			},
		},
		createElement(
			"div",
			{
				style: {
					display: "flex",
					alignItems: "center",
					marginBottom: "16px",
					color: "#fa5252",
				},
			},
			createElement(
				"svg",
				{
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					style: {
						width: "24px",
						height: "24px",
						marginRight: "12px",
						flexShrink: 0,
					},
				},
				createElement("circle", { cx: "12", cy: "12", r: "10" }),
				createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
				createElement("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" }),
			),
			createElement(
				"h2",
				{ style: { margin: 0, fontSize: "18px", fontWeight: 600 } },
				title,
			),
		),
		createElement(
			"div",
			{
				style: {
					backgroundColor: "rgba(250, 82, 82, 0.1)",
					padding: "12px",
					borderRadius: "6px",
					marginBottom: "16px",
					borderLeft: "2px solid rgba(250, 82, 82, 0.5)",
				},
			},
			createElement(
				"code",
				{
					style: {
						fontFamily: "monospace",
						fontSize: "14px",
						color: "#ffc9c9",
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
					},
				},
				errorMessage,
			),
		),
		createElement(
			"div",
			{ style: { marginBottom: "16px" } },
			createElement(
				"strong",
				{
					style: {
						display: "block",
						marginBottom: "8px",
						fontSize: "14px",
						color: "#adb5bd",
					},
				},
				"How to fix:",
			),
			createElement(
				"ul",
				{
					style: {
						margin: 0,
						paddingLeft: "24px",
						fontSize: "14px",
						color: "#ced4da",
						lineHeight: 1.5,
					},
				},
				createElement(
					"li",
					null,
					"Check the stack trace below to identify the exact file and line number causing the issue.",
				),
				title.includes("render")
					? createElement(
							"li",
							null,
							"Ensure your widget render functions return valid React elements and don't throw synchronous errors.",
						)
					: createElement(
							"li",
							null,
							"Ensure your draw loop does not have syntax errors or reference undefined variables.",
						),
				createElement(
					"li",
					null,
					"Look for any mismatched pushId/popId or pushLayer/popLayer calls.",
				),
			),
		),
		stackTrace || info?.componentStack
			? createElement(
					"div",
					{
						style: {
							marginTop: "8px",
							paddingTop: "16px",
							borderTop: "1px solid #495057",
						},
					},
					createElement(
						"strong",
						{
							style: {
								display: "block",
								marginBottom: "12px",
								fontSize: "14px",
								color: "#adb5bd",
							},
						},
						"Stack Trace:",
					),
					createElement(
						"div",
						{
							style: {
								backgroundColor: "#181b1e",
								padding: "16px",
								borderRadius: "6px",
								overflowX: "auto",
							},
						},
						createElement(
							"pre",
							{
								style: {
									margin: 0,
									fontFamily: "monospace",
									fontSize: "12px",
									color: "#868e96",
									whiteSpace: "pre",
								},
							},
							stackTrace,
							info?.componentStack
								? `\n\nComponent Stack:\n${info.componentStack}`
								: "",
						),
					),
				)
			: null,
	);
}

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
			return createElement(ErrorFallback, {
				title: "Widget render error",
				error: this.state.error,
			});
		}
		return this.props.children;
	}
}

/**
 * @deprecated Since 3.0.0. Use `ISMCoreErrorBoundary` instead.
 */
export { ISMCoreErrorBoundary as ISMLibErrorBoundary };
