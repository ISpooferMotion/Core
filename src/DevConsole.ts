import { createElement } from "react";
import { defineWidget } from "./defineWidget";
import { getDevLogs } from "./logger";

/**
 * A widget that displays the captured terminal logs.
 * Ensure you have called `attachDevConsole()` or used `__ismdev_tools__.log()` to capture logs.
 * This widget dynamically sizes to fill its container.
 */
export const DevConsole = defineWidget<void, [], void>({
	name: "DevConsole",
	defaultState: undefined,
	render: ({ id }) => {
		return createElement(
			"div",
			{
				key: id,
				style: {
					width: "100%",
					height: "100%",
					backgroundColor: "rgba(0, 0, 0, 0.95)",
					color: "white",
					fontSize: "11px",
					fontFamily: "monospace",
					borderRadius: "6px",
					border: "1px solid rgba(255, 255, 255, 0.2)",
					display: "flex",
					flexDirection: "column",
					overflow: "hidden",
				},
			},
			createElement(
				"div",
				{
					style: {
						flex: 1,
						overflowY: "auto",
						padding: "8px",
						display: "flex",
						flexDirection: "column",
						gap: "4px",
					},
					ref: (el: HTMLDivElement | null) => {
						if (el) el.scrollTop = el.scrollHeight;
					},
				},
				getDevLogs().length === 0
					? createElement(
							"div",
							{
								style: { color: "rgba(255,255,255,0.3)", fontStyle: "italic" },
							},
							"No logs yet",
						)
					: getDevLogs().map((log, i) =>
							createElement(
								"div",
								{
									key: i,
									style: { wordBreak: "break-word", whiteSpace: "pre-wrap" },
								},
								log,
							),
						),
			),
		);
	},
	getReturnValue: () => undefined,
});
