import type { CSSProperties, ErrorInfo, ReactNode } from "react";
import { Component, createElement } from "react";
import * as errors from "./errors";

/** Context passed to a custom application error fallback. */
export interface ErrorFallbackContext {
	title: string;
	error: Error;
	info?: ErrorInfo;
	kind: "render" | "draw";
	errorCode: errors.ISMErrorCode;
	showErrorDetails: boolean;
	onRetry?: () => void;
}

export interface ISMCoreErrorBoundaryProps {
	children: ReactNode;
	/** Called after the boundary catches a render error. */
	onError?: (error: Error, info: ErrorInfo) => void;
	/** Render a consumer-defined replacement instead of the built-in fallback. */
	renderFallback?: (context: ErrorFallbackContext) => ReactNode;
	/** Include message/stack/component details in the built-in fallback. */
	showErrorDetails?: boolean;
	/** Receive the structured render failure diagnostic. */
	onDiagnostic?: errors.DiagnosticSink;
}

interface State {
	error: Error | null;
	info: ErrorInfo | null;
}

/** Default detailed-error policy: enabled outside production. */
export function shouldShowErrorDetailsByDefault(): boolean {
	return (
		typeof process === "undefined" || process.env.NODE_ENV !== "production"
	);
}

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
		boxSizing: "border-box",
		maxHeight: "calc(100vh - 32px)",
		overflowX: "hidden",
		overflowY: "auto",
		overscrollBehavior: "contain",
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
	errorId: {
		fontFamily: "monospace",
		fontSize: "12px",
		color: "#adb5bd",
		marginBottom: "12px",
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

export interface ErrorFallbackProps {
	title: string;
	error: Error | string;
	info?: ErrorInfo;
	/** Select the tips shown for this error source. */
	kind?: "render" | "draw";
	/** Stable code displayed even when sensitive details are hidden. */
	errorCode?: errors.ISMErrorCode;
	/** Hide messages/stacks in production-safe mode. */
	showErrorDetails?: boolean;
	/** Show a retry button when a recovery callback is available. */
	onRetry?: () => void;
}

/** Render the error panel used for draw and widget render failures. */
export function ErrorFallback({
	title,
	error,
	info,
	kind = "render",
	errorCode = kind === "draw" ? "ISM_DRAW_ERROR" : "ISM_WIDGET_RENDER_ERROR",
	showErrorDetails = shouldShowErrorDetailsByDefault(),
	onRetry,
}: ErrorFallbackProps): ReactNode {
	const originalMessage =
		error instanceof Error ? error.message : String(error);
	const errorMessage = showErrorDetails
		? originalMessage
		: "Something went wrong.";
	const stackTrace =
		showErrorDetails && error instanceof Error ? error.stack : undefined;

	return createElement(
		"div",
		{
			"data-ism-error": "",
			"data-ism-error-code": errorCode,
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
			{ style: fallbackStyles.errorId },
			`Error ID: ${errorCode}`,
		),
		showErrorDetails
			? createElement(
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
									"Check the draw loop for exceptions, invalid state, or undefined values.",
								),
						createElement(
							"li",
							null,
							"Look for mismatched pushId/popId or pushLayer/popLayer calls.",
						),
					),
				)
			: null,
		showErrorDetails && (stackTrace || info?.componentStack)
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

/** React error boundary used by `@ispoofermotion/core` apps. */
export class ISMCoreErrorBoundary extends Component<
	ISMCoreErrorBoundaryProps,
	State
> {
	state: State = { error: null, info: null };

	static getDerivedStateFromError(error: Error): Pick<State, "error"> {
		return { error };
	}

	componentDidCatch = (error: Error, info: ErrorInfo): void => {
		this.setState({ info });
		this.props.onError?.(error, info);
		errors.emitDiagnostic(
			this.props.onDiagnostic,
			errors.createDiagnostic(
				"ISM_WIDGET_RENDER_ERROR",
				"error",
				"[ism] Uncaught error in widget render.",
				{
					cause: error,
					details: { componentStack: info.componentStack },
				},
			),
		);
	};

	private resetError = (): void => {
		this.setState({ error: null, info: null });
	};

	render(): ReactNode {
		if (this.state.error) {
			const context: ErrorFallbackContext = {
				title: "Widget render error",
				error: this.state.error,
				...(this.state.info ? { info: this.state.info } : {}),
				kind: "render",
				errorCode: errors.getErrorCode(
					this.state.error,
					"ISM_WIDGET_RENDER_ERROR",
				),
				showErrorDetails:
					this.props.showErrorDetails ?? shouldShowErrorDetailsByDefault(),
				onRetry: this.resetError,
			};
			return this.props.renderFallback
				? this.props.renderFallback(context)
				: createElement(ErrorFallback, context);
		}
		return this.props.children;
	}
}

/** @deprecated Since 3.0.0. Use `ISMCoreErrorBoundary`. */
export { ISMCoreErrorBoundary as ISMLibErrorBoundary };
