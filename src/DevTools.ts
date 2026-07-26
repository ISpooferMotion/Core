import { createElement } from "react";
import { defineWidget } from "./defineWidget";
import { mountedRuntimes } from "./runtime";
import type { FrameEntry } from "./types";

type Tab = "Elements" | "State";

interface DevToolsState {
	expanded: boolean;
	activeTab: Tab;
}

/**
 * Serializes a widget subtree to an indented text representation.
 * Used by the Elements tab to display the live widget tree.
 */
function serializeWidgetTree(entries: FrameEntry[], depth = 0): string {
	const indent = "  ".repeat(depth);
	return entries
		.map((e) => {
			const children =
				e.children.length > 0
					? `\n${serializeWidgetTree(e.children, depth + 1)}`
					: "";
			return `${indent}${e.widgetName} (${e.id})${children}`;
		})
		.join("\n");
}

/**
 * A dockable DevTools widget for the core IMUI.
 * Provides a tabbed interface containing the Console, Elements, and State.
 */
export const DevTools = defineWidget<DevToolsState, [], void>({
	name: "DevTools",
	defaultState: { expanded: false, activeTab: "Elements" },
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
				"🛠 DevTools",
			);
		}

		// Snapshot live data from all mounted runtimes.
		// mountedRuntimes is safe to read outside of a draw pass.
		const elementsText = Array.from(mountedRuntimes)
			.flatMap((r) =>
				Array.from(r.getTree().entries()).map(
					([layer, entries]) =>
						`[layer: ${layer}]\n${serializeWidgetTree(entries) || "  (empty)"}`,
				),
			)
			.join("\n\n");

		const stateEntries = Array.from(mountedRuntimes).flatMap((r) =>
			Array.from(r.getStateStore().entries()).map(([entryId, s]) => {
				let serialized: string;
				try {
					serialized = JSON.stringify(s, null, 2);
				} catch {
					serialized = String(s);
				}
				return `${entryId}:\n${serialized}`;
			}),
		);
		const stateText =
			stateEntries.length > 0 ? stateEntries.join("\n---\n") : "(empty)";

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
					(["Elements", "State"] as Tab[]).map((tab) =>
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
				state.activeTab === "Elements" &&
					createElement(
						"div",
						{ style: { overflowY: "auto", height: "100%" } },
						createElement(
							"pre",
							{ style: { color: "#51cf66", margin: 0 } },
							elementsText || "(no widgets rendered)",
						),
					),
				state.activeTab === "State" &&
					createElement(
						"div",
						{ style: { overflowY: "auto", height: "100%" } },
						createElement(
							"pre",
							{ style: { color: "#ff6b6b", margin: 0 } },
							stateText,
						),
					),
			),
		);
	},
	getReturnValue: () => undefined,
});
