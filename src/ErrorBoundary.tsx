import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import { Component, createElement } from "react";

interface Props {
	children: ReactNode;
	/** Called after the boundary catches a render error. */
	onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
	error: Error | null;
	info: ErrorInfo | null;
}

/**
 * React error boundary used by `@ispoofermotion/core` apps.
 *
 * It catches errors thrown while React renders widgets and replaces the broken
 * tree with {@link ErrorFallback}. `createApp` adds this boundary automatically,
 * but it can also wrap a smaller part of an app.
 *
 * @since 1.0.0
 *
 * @example
 * ```tsx
 * createRoot(root).render(
 *   createElement(
 *     ISMCoreErrorBoundary,
 *     { onError: (error) => reportError(error) },
 *     createElement(App),
 *   ),
 * );
 * ```
 */

/** Shared styles for {@link ErrorFallback}. */
const fallbackStyles = {
	container: {
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
	header: {
		display: "flex",
		alignItems: "center",
		marginBottom: "16px",
		color: "#fa5252",
	},
	icon: {
		width: "24px",
		height: "24px",
		marginRight: "12px",
		flexShrink: 0,
	},
	title: { margin: 0, fontSize: "18px", fontWeight: 600 },
	messageBox: {
		backgroundColor: "rgba(250, 82, 82, 0.1)",
		padding: "12px",
		borderRadius: "6px",
		marginBottom: "16px",
		borderLeft: "2px solid rgba(250, 82, 82, 0.5)",
	},
	messageCode: {
		fontFamily: "monospace",
		fontSize: "14px",
		color: "#ffc9c9",
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
	},
	tipsSection: { marginBottom: "16px" },
	tipsHeading: {
		display: "block",
		marginBottom: "8px",
		fontSize: "14px",
		color: "#adb5bd",
	},
	tipsList: {
		margin: 0,
		paddingLeft: "24px",
		fontSize: "14px",
		color: "#ced4da",
		lineHeight: 1.5,
	},
	stackSection: {
		marginTop: "8px",
		paddingTop: "16px",
		borderTop: "1px solid #495057",
	},
	stackHeading: {
		display: "block",
		marginBottom: "12px",
		fontSize: "14px",
		color: "#adb5bd",
	},
	stackBox: {
		backgroundColor: "#181b1e",
		padding: "16px",
		borderRadius: "6px",
		overflowX: "auto",
	},
	stackPre: {
		margin: 0,
		fontFamily: "monospace",
		fontSize: "12px",
		color: "#868e96",
		whiteSpace: "pre",
	},
	retryButton: {
		marginTop: "16px",
		alignSelf: "flex-start",
		backgroundColor: "#fa5252",
		color: "#212529",
		border: "none",
		borderRadius: "6px",
		padding: "8px 16px",
		fontSize: "14px",
		fontWeight: 600,
		cursor: "pointer",
	},
} satisfies Record<string, CSSProperties>;

/**
 * Render the error panel used for draw and widget render failures.
 *
 * @since 3.2.0
 */
export function ErrorFallback({
	title,
	error,
	info,
	kind = "render",
	onRetry,
}: {
	title: string;
	error: Error | string;
	info?: ErrorInfo;
	/** Select the tips shown for this error source. */
	kind?: "render" | "draw";
	/** Show a retry button when a recovery callback is available. */
	onRetry?: () => void;
}): ReactNode {
	const errorMessage = error instanceof Error ? error.message : String(error);
	const stackTrace = error instanceof Error ? error.stack : undefined;

	return createElement(
		"div",
		{
			"data-ism-error": "",
			role: "alert",
			style: fallbackStyles.container,
		},
		createElement(
			"div",
			{ style: fallbackStyles.header },
			createElement(
				"svg",
				{
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					"aria-hidden": "true",
					style: fallbackStyles.icon,
				},
				createElement("circle", { cx: "12", cy: "12", r: "10" }),
				createElement("line", { x1: "12", y1: "8", x2: "12", y2: "12" }),
				createElement("line", { x1: "12", y1: "16", x2: "12.01", y2: "16" }),
			),
			createElement("h2", { style: fallbackStyles.title }, title),
		),
		createElement(
			"div",
			{ style: fallbackStyles.messageBox },
			createElement(
				"code",
				{ style: fallbackStyles.messageCode },
				errorMessage,
			),
		),
		createElement(
			"div",
			{ style: fallbackStyles.tipsSection },
			createElement(
				"strong",
				{ style: fallbackStyles.tipsHeading },
				"How to fix:",
			),
			createElement(
				"ul",
				{ style: fallbackStyles.tipsList },
				createElement(
					"li",
					null,
					"Check the stack trace below to identify the exact file and line number causing the issue.",
				),
				kind === "render"
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
					{ style: fallbackStyles.stackSection },
					createElement(
						"strong",
						{ style: fallbackStyles.stackHeading },
						"Stack Trace:",
					),
					createElement(
						"div",
						{ style: fallbackStyles.stackBox },
						createElement(
							"pre",
							{ style: fallbackStyles.stackPre },
							stackTrace,
							info?.componentStack
								? `\n\nComponent Stack:\n${info.componentStack}`
								: "",
						),
					),
				)
			: null,
		onRetry
			? createElement(
					"button",
					{
						type: "button" as const,
						onClick: onRetry,
						style: fallbackStyles.retryButton,
					},
					"Try again",
				)
			: null,
	);
}

export class ISMCoreErrorBoundary extends Component<Props, State> {
	state: State = { error: null, info: null };

	static getDerivedStateFromError(error: Error): Pick<State, "error"> {
		return { error };
	}

	componentDidCatch = (error: Error, info: ErrorInfo): void => {
		this.setState({ info });
		this.props.onError?.(error, info);
		console.error("[ism] Uncaught error in widget render:", error, info);
	};

	/**
	 * Clear the saved error so React can try rendering the children again.
	 * This is an instance field so it can be passed as a callback directly.
	 */
	private resetError = (): void => {
		this.setState({ error: null, info: null });
	};

	render(): ReactNode {
		if (this.state.error) {
			return createElement(ErrorFallback, {
				title: "Widget render error",
				error: this.state.error,
				...(this.state.info ? { info: this.state.info } : {}),
				kind: "render",
				onRetry: this.resetError,
			});
		}
		return this.props.children;
	}
}

/** @deprecated Since 3.0.0. Use `ISMCoreErrorBoundary`. */
export { ISMCoreErrorBoundary as ISMLibErrorBoundary };
