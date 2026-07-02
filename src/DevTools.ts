import { createElement } from "react";
import { defineWidget } from "./defineWidget";
import { devLogs } from "./logger";
import { getActiveRuntime } from "./runtime";

type Tab = "Console" | "Elements" | "State";

interface DevToolsState {
	expanded: boolean;
	activeTab: Tab;
}

/**
 * A dockable DevTools widget for the core IMUI.
 * Provides a tabbed interface containing the Console, Elements, and State.
 */
export const DevTools = defineWidget<DevToolsState, [], void>({
	name: "DevTools",
	defaultState: { expanded: false, activeTab: "Console" },
	render: ({ id, state, setState }) => {
		if (!state.expanded) {
			return createElement(
				"button",
				{
					key: id,
					type: "button" as const,
					onClick: () => setState({ ...state, expanded: true }),
					style: {
						position: "fixed",
						bottom: "8px",
						left: "8px",
						backgroundColor: "rgba(0, 0, 0, 0.8)",
						color: "white",
						fontSize: "10px",
						fontFamily: "monospace",
						padding: "6px 12px",
						borderRadius: "4px",
						border: "1px solid rgba(255, 255, 255, 0.2)",
						zIndex: 99999,
						cursor: "pointer",
						boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
					},
				},
				`🛠 DevTools (Logs: ${devLogs.length})`,
			);
		}

		// Rendering the expanded devtools dock
		return createElement(
			"div",
			{
				key: id,
				style: {
					position: "fixed",
					bottom: "0",
					left: "0",
					right: "0",
					height: "35vh", // 35% of viewport height
					backgroundColor: "rgba(30, 30, 30, 0.98)",
					color: "white",
					fontSize: "12px",
					fontFamily: "monospace",
					borderTop: "1px solid rgba(255, 255, 255, 0.2)",
					zIndex: 99999,
					display: "flex",
					flexDirection: "column",
					boxShadow: "0 -4px 20px rgba(0,0,0,0.5)",
				},
			},
			// Header / Tab Bar
			createElement(
				"div",
				{
					style: {
						display: "flex",
						justifyContent: "space-between",
						alignItems: "center",
						backgroundColor: "rgba(20, 20, 20, 1)",
						borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
						padding: "0 8px",
					},
				},
				createElement(
					"div",
					{ style: { display: "flex", gap: "2px" } },
					(["Console", "Elements", "State"] as Tab[]).map((tab) =>
						createElement(
							"div",
							{
								key: tab,
								onClick: () => setState({ ...state, activeTab: tab }),
								style: {
									padding: "6px 12px",
									cursor: "pointer",
									backgroundColor:
										state.activeTab === tab
											? "rgba(255,255,255,0.1)"
											: "transparent",
									borderBottom:
										state.activeTab === tab
											? "2px solid #0078d4"
											: "2px solid transparent",
									userSelect: "none",
								},
							},
							tab,
						),
					),
				),
				createElement(
					"div",
					{
						onClick: () => setState({ ...state, expanded: false }),
						style: {
							cursor: "pointer",
							padding: "4px 8px",
							fontSize: "14px",
							userSelect: "none",
						},
					},
					"✖",
				),
			),
			// Content Area
			createElement(
				"div",
				{
					style: {
						flex: 1,
						overflow: "hidden",
						position: "relative",
						padding: "8px",
					},
				},
				state.activeTab === "Console" &&
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
								height: "100%",
							},
							ref: (el: HTMLDivElement | null) => {
								if (el) el.scrollTop = el.scrollHeight;
							},
						},
						devLogs.length === 0
							? createElement(
									"div",
									{
										style: {
											color: "rgba(255,255,255,0.3)",
											fontStyle: "italic",
										},
									},
									"No logs yet",
								)
							: devLogs.map((log, i) =>
									createElement(
										"div",
										{
											key: i,
											style: {
												wordBreak: "break-word",
												whiteSpace: "pre-wrap",
											},
										},
										log,
									),
								),
					),
				state.activeTab === "Elements" &&
					createElement(
						"div",
						{ style: { overflowY: "auto", height: "100%" } },
						createElement("h3", null, "Widget Tree (Placeholder)"),
						createElement(
							"pre",
							{ style: { color: "#51cf66" } },
							JSON.stringify(
								Array.from(getActiveRuntime().getTree().keys()),
								null,
								2,
							),
						),
					),
				state.activeTab === "State" &&
					createElement(
						"div",
						{ style: { overflowY: "auto", height: "100%" } },
						createElement("h3", null, "State Store (Placeholder)"),
						createElement(
							"pre",
							{ style: { color: "#ff6b6b" } },
							JSON.stringify(
								Array.from(getActiveRuntime().getStateStore().keys()),
								null,
								2,
							),
						),
					),
			),
		);
	},
	getReturnValue: () => undefined,
});
