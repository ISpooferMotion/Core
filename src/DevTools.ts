import { createElement } from "react";
import { defineWidget } from "./defineWidget";
import { getErrorMessage } from "./errors";
import { getRuntimeByInstanceId, type Runtime } from "./runtime";
import type { FrameEntry } from "./types";

type Tab = "Elements" | "State";
const TABS: readonly Tab[] = ["Elements", "State"];

interface DevToolsState {
	expanded: boolean;
	activeTab: Tab;
}

interface InspectorCache {
	elementsRevision: number;
	stateRevision: number;
	elements: string;
	state: string;
}

const snapshotCache = new WeakMap<Runtime, InspectorCache>();

function devToolsReplacer(_key: string, value: unknown): unknown {
	if (value instanceof Map) {
		return { __type: "Map", entries: Array.from(value.entries()) };
	}
	if (value instanceof Set) {
		return { __type: "Set", values: Array.from(value.values()) };
	}
	if (typeof value === "function") {
		return `[Function: ${value.name || "anonymous"}]`;
	}
	return value;
}

function serializeState(state: unknown): string {
	try {
		return JSON.stringify(state, devToolsReplacer, 2);
	} catch (error) {
		return `<unserializable: ${getErrorMessage(error)}>`;
	}
}

function serializeWidgetTree(entries: FrameEntry[], depth = 0): string {
	const indent = "  ".repeat(depth);
	return entries
		.map((entry) => {
			const children =
				entry.children.length > 0
					? `\n${serializeWidgetTree(entry.children, depth + 1)}`
					: "";
			return `${indent}${entry.widgetName} (${entry.id})${children}`;
		})
		.join("\n");
}

function getInspectorText(runtime: Runtime, tab: Tab): string {
	let cache = snapshotCache.get(runtime);
	if (!cache) {
		cache = {
			elementsRevision: -1,
			stateRevision: -1,
			elements: "",
			state: "",
		};
		snapshotCache.set(runtime, cache);
	}

	if (tab === "Elements") {
		const revision = runtime.getInspectionRevision("tree");
		if (cache.elementsRevision !== revision) {
			cache.elements = Array.from(runtime.getTree().entries())
				.map(
					([layer, entries]) =>
						`[layer: ${layer}]\n${serializeWidgetTree(entries) || "  (empty)"}`,
				)
				.join("\n\n");
			cache.elementsRevision = revision;
		}
		return cache.elements || "(no widgets rendered)";
	}

	const revision = runtime.getInspectionRevision("state");
	if (cache.stateRevision !== revision) {
		const stateEntries = Array.from(runtime.getStateStore().entries()).map(
			([entryId, value]) => `${entryId}:\n${serializeState(value)}`,
		);
		cache.state =
			stateEntries.length > 0 ? stateEntries.join("\n---\n") : "(empty)";
		cache.stateRevision = revision;
	}
	return cache.state || "(empty)";
}

export const DevTools = defineWidget<DevToolsState, [], void>({
	name: "DevTools",
	defaultState: { expanded: false, activeTab: "Elements" },
	render: ({ id, runtimeId, state, setState }) => {
		if (!state.expanded) {
			return createElement(
				"button",
				{
					key: id,
					type: "button" as const,
					"aria-label": "Open DevTools",
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

		const runtime = runtimeId ? getRuntimeByInstanceId(runtimeId) : undefined;
		const inspectorText = runtime
			? getInspectorText(runtime, state.activeTab)
			: "(runtime unavailable)";
		const domNamespace = runtimeId ?? id.replaceAll("/", "-");
		const panelId = `${domNamespace}-devtools-panel`;
		const tabId = (tab: Tab) => `${domNamespace}-devtools-tab-${tab}`;

		return createElement(
			"div",
			{
				key: id,
				"data-ism-devtools-runtime": runtimeId ?? "unknown",
				style: {
					position: "fixed",
					bottom: 0,
					left: 0,
					right: 0,
					height: "35vh",
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
					{ role: "tablist", style: { display: "flex", gap: "2px" } },
					TABS.map((tab) =>
						createElement(
							"button",
							{
								type: "button",
								key: tab,
								id: tabId(tab),
								role: "tab",
								tabIndex: state.activeTab === tab ? 0 : -1,
								"aria-selected": state.activeTab === tab,
								"aria-controls": panelId,
								onClick: () => setState({ ...state, activeTab: tab }),
								onKeyDown: (
									event: import("react").KeyboardEvent<HTMLButtonElement>,
								) => {
									const current = TABS.indexOf(tab);
									let next = current;
									if (event.key === "ArrowRight")
										next = (current + 1) % TABS.length;
									else if (event.key === "ArrowLeft")
										next = (current - 1 + TABS.length) % TABS.length;
									else if (event.key === "Home") next = 0;
									else if (event.key === "End") next = TABS.length - 1;
									else return;
									event.preventDefault();
									const nextTab = TABS[next];
									if (!nextTab) return;
									setState({ ...state, activeTab: nextTab });
									const tablist =
										event.currentTarget.closest('[role="tablist"]');
									tablist
										?.querySelector<HTMLElement>(`#${tabId(nextTab)}`)
										?.focus();
								},
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
					"button",
					{
						type: "button",
						onClick: () => setState({ ...state, expanded: false }),
						"aria-label": "Close DevTools",
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
			createElement(
				"div",
				{
					role: "tabpanel",
					id: panelId,
					"aria-labelledby": tabId(state.activeTab),
					style: {
						flex: 1,
						overflow: "hidden",
						position: "relative",
						padding: "8px",
					},
				},
				createElement(
					"div",
					{ style: { overflowY: "auto", height: "100%" } },
					createElement(
						"pre",
						{
							style: {
								color: state.activeTab === "Elements" ? "#51cf66" : "#ff6b6b",
								margin: 0,
							},
						},
						inspectorText,
					),
				),
			),
		);
	},
	getReturnValue: () => undefined,
});
