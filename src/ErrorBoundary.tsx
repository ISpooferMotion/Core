import type { ErrorInfo, ReactNode } from "react";
import { Component, createElement } from "react";
import * as errors from "./errors";

export interface ErrorFallbackContext {
	title: string;
	error: Error;
	info?: ErrorInfo;
	kind: "render" | "draw";
	errorCode: errors.ISMErrorCode;
	showErrorDetails: boolean;
	retryFailed?: boolean;
	onRetry?: () => void | Promise<void>;
}

export interface ISMCoreErrorBoundaryProps {
	children?: ReactNode;
	onError?: (error: Error, info: ErrorInfo) => void;
	renderFallback?: (context: ErrorFallbackContext) => ReactNode;
	showErrorDetails?: boolean;
	onDiagnostic?: errors.DiagnosticSink;
}

interface State {
	error: Error | null;
	info: ErrorInfo | null;
	retrying: boolean;
	retryFailed: boolean;
}

export function shouldShowErrorDetailsByDefault(): boolean {
	return (
		typeof process !== "undefined" &&
		typeof process.env.NODE_ENV === "string" &&
		process.env.NODE_ENV !== "production"
	);
}

export interface ErrorFallbackProps {
	title: string;
	error: Error | string;
	info?: ErrorInfo;
	kind?: "render" | "draw";
	errorCode?: errors.ISMErrorCode;
	showErrorDetails?: boolean;
	retryFailed?: boolean;
	onRetry?: () => void | Promise<void>;
}

export function ErrorFallback({
	title,
	error,
	info,
	kind = "render",
	errorCode = kind === "draw" ? "ISM_DRAW_ERROR" : "ISM_WIDGET_RENDER_ERROR",
	showErrorDetails = shouldShowErrorDetailsByDefault(),
}: ErrorFallbackProps): ReactNode {
	const originalMessage =
		error instanceof Error ? error.message : String(error);
	const message = showErrorDetails
		? originalMessage
		: kind === "draw"
			? "Core could not complete the current draw frame."
			: "Core could not render the current widget tree.";
	const label = `[ism] ${title} (${errorCode}): ${message}`;
	if (showErrorDetails) {
		console.error(label, error, info?.componentStack ?? "");
	} else {
		console.error(label);
	}
	return null;
}

interface SafeErrorFallbackProps {
	context: ErrorFallbackContext;
	renderFallback?: (context: ErrorFallbackContext) => ReactNode;
	onDiagnostic?: errors.DiagnosticSink;
}

interface FallbackSafetyBoundaryProps {
	children?: ReactNode;
	fallback: ReactNode;
	context: ErrorFallbackContext;
	onDiagnostic?: errors.DiagnosticSink;
}

class FallbackSafetyBoundary extends Component<
	FallbackSafetyBoundaryProps,
	{ failed: boolean }
> {
	state = { failed: false };

	static getDerivedStateFromError(): { failed: true } {
		return { failed: true };
	}

	componentDidCatch(error: Error): void {
		errors.emitDiagnostic(
			this.props.onDiagnostic,
			errors.createDiagnostic(
				this.props.context.errorCode,
				"error",
				"[ism] Custom error fallback threw while handling an existing failure. The built-in fallback was restored.",
				this.props.context.showErrorDetails ? { cause: error } : {},
			),
		);
	}

	render(): ReactNode {
		return this.state.failed ? this.props.fallback : this.props.children;
	}
}

function CustomFallbackRenderer({
	renderFallback,
	context,
}: Required<Pick<SafeErrorFallbackProps, "renderFallback" | "context">>) {
	return renderFallback(context);
}

export function SafeErrorFallback({
	context,
	renderFallback,
	onDiagnostic,
}: SafeErrorFallbackProps): ReactNode {
	const builtin = createElement(ErrorFallback, context);
	if (!renderFallback) return builtin;
	return createElement(
		FallbackSafetyBoundary,
		{ fallback: builtin, context, ...(onDiagnostic ? { onDiagnostic } : {}) },
		createElement(CustomFallbackRenderer, { renderFallback, context }),
	);
}

export class ISMCoreErrorBoundary extends Component<
	ISMCoreErrorBoundaryProps,
	State
> {
	state: State = {
		error: null,
		info: null,
		retrying: false,
		retryFailed: false,
	};

	static getDerivedStateFromError(error: Error): Pick<State, "error"> {
		return { error };
	}

	componentDidCatch = (error: Error, info: ErrorInfo): void => {
		const retryFailed = this.state.retrying;
		this.setState({ info, retrying: false, retryFailed });
		try {
			this.props.onError?.(error, info);
		} catch (hookError) {
			errors.emitDiagnostic(
				this.props.onDiagnostic,
				errors.createDiagnostic(
					errors.getErrorCode(error, "ISM_WIDGET_RENDER_ERROR"),
					"error",
					"[ism] onError hook threw while handling a widget render failure.",
					this.props.showErrorDetails ? { cause: hookError } : {},
				),
			);
		}
		errors.emitDiagnostic(
			this.props.onDiagnostic,
			errors.createDiagnostic(
				errors.getErrorCode(error, "ISM_WIDGET_RENDER_ERROR"),
				"error",
				"[ism] Uncaught error in widget render.",
				this.props.showErrorDetails
					? {
							cause: error,
							details: { componentStack: info.componentStack },
						}
					: {},
			),
		);
	};

	componentDidUpdate(
		_previousProps: ISMCoreErrorBoundaryProps,
		previousState: State,
	) {
		if (
			previousState.error !== null &&
			this.state.error === null &&
			this.state.retrying
		) {
			this.setState({ retrying: false, retryFailed: false });
		}
	}

	private resetError = (): void => {
		this.setState({
			error: null,
			info: null,
			retrying: true,
			retryFailed: false,
		});
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
				retryFailed: this.state.retryFailed,
				onRetry: this.resetError,
			};
			return createElement(SafeErrorFallback, {
				context,
				...(this.props.renderFallback
					? { renderFallback: this.props.renderFallback }
					: {}),
				...(this.props.onDiagnostic
					? { onDiagnostic: this.props.onDiagnostic }
					: {}),
			});
		}
		return this.props.children ?? null;
	}
}
