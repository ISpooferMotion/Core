import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { createElement, useEffect, useRef, useState } from "react";
import { installDevToolsProtocol } from "./devtoolsProtocol";
import {
	serializeInspectorState,
	serializeInspectorTree,
} from "./inspectorSerializer";
import type { Runtime } from "./runtime";

if (typeof window !== "undefined") {
	installDevToolsProtocol();
}

type Tab = "Elements" | "State";
const TABS: readonly Tab[] = ["Elements", "State"];

interface InspectorCache {
	elementsRevision: number;
	stateRevision: number;
	elements: string;
	state: string;
}

const snapshotCache = new WeakMap<Runtime, InspectorCache>();

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
						`[layer: ${layer}]\n${serializeInspectorTree(entries) || "  (empty)"}`,
				)
				.join("\n\n");
			cache.elementsRevision = revision;
		}
		return cache.elements || "(no widgets rendered)";
	}

	const revision = runtime.getInspectionRevision("state");
	if (cache.stateRevision !== revision) {
		const stateEntries = Array.from(runtime.getStateStore().entries()).map(
			([entryId, value]) => `${entryId}:\n${serializeInspectorState(value)}`,
		);
		cache.state =
			stateEntries.length > 0 ? stateEntries.join("\n---\n") : "(empty)";
		cache.stateRevision = revision;
	}
	return cache.state || "(empty)";
}

export interface DevToolsOverlayProps {
	runtime: Runtime;
	/** Stacking level supplied by the app rather than hard-coded by DevTools. */
	zIndex: number;
}

/** Lazily loaded React inspector used by `createApp({ showDevTools: true })`. */
export function DevToolsOverlay({
	runtime,
	zIndex,
}: DevToolsOverlayProps): ReturnType<typeof createElement> {
	const [expanded, setExpanded] = useState(false);
	const [activeTab, setActiveTab] = useState<Tab>("Elements");
	const openButtonRef = useRef<HTMLButtonElement | null>(null);
	const restoreOpenerFocus = useRef(false);
	const runtimeId = runtime.getInstanceId();
	const panelId = `${runtimeId}-devtools-panel`;
	const tabId = (tab: Tab) => `${runtimeId}-devtools-tab-${tab}`;
	const inspectorText = expanded ? getInspectorText(runtime, activeTab) : "";

	useEffect(() => {
		if (!expanded && restoreOpenerFocus.current) {
			restoreOpenerFocus.current = false;
			openButtonRef.current?.focus();
		}
	}, [expanded]);

	useEffect(() => {
		if (!expanded) return;
		return runtime.attachInspector();
	}, [expanded, runtime]);

	const close = () => {
		restoreOpenerFocus.current = true;
		setExpanded(false);
	};

	if (!expanded) {
		return createElement(
			"button",
			{
				ref: openButtonRef,
				type: "button" as const,
				"aria-label": "Open DevTools",
				onClick: () => setExpanded(true),
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
					zIndex,
					cursor: "pointer",
					boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
				},
			},
			"🛠 DevTools",
		);
	}

	const handleTabKeyDown = (
		event: ReactKeyboardEvent<HTMLButtonElement>,
		tab: Tab,
	) => {
		const current = TABS.indexOf(tab);
		let next = current;
		if (event.key === "ArrowRight") next = (current + 1) % TABS.length;
		else if (event.key === "ArrowLeft")
			next = (current - 1 + TABS.length) % TABS.length;
		else if (event.key === "Home") next = 0;
		else if (event.key === "End") next = TABS.length - 1;
		else return;
		event.preventDefault();
		const nextTab = TABS[next];
		if (!nextTab) return;
		setActiveTab(nextTab);
		const tablist = event.currentTarget.closest('[role="tablist"]');
		tablist?.querySelector<HTMLElement>(`#${tabId(nextTab)}`)?.focus();
	};

	return createElement(
		"div",
		{
			role: "region",
			"aria-label": "ISM DevTools",
			"data-ism-devtools-runtime": runtimeId,
			onKeyDown: (event: ReactKeyboardEvent<HTMLDivElement>) => {
				if (event.key === "Escape") {
					event.preventDefault();
					close();
				}
			},
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
				zIndex,
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
				{
					role: "tablist",
					"aria-label": "DevTools views",
					style: { display: "flex", gap: "2px" },
				},
				TABS.map((tab) =>
					createElement(
						"button",
						{
							type: "button",
							key: tab,
							id: tabId(tab),
							role: "tab",
							tabIndex: activeTab === tab ? 0 : -1,
							"aria-selected": activeTab === tab,
							"aria-controls": panelId,
							onClick: () => setActiveTab(tab),
							onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) =>
								handleTabKeyDown(event, tab),
							style: {
								color: "inherit",
								padding: "6px 12px",
								cursor: "pointer",
								backgroundColor:
									activeTab === tab ? "rgba(255,255,255,0.1)" : "transparent",
								borderBottom:
									activeTab === tab
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
					onClick: close,
					"aria-label": "Close DevTools",
					style: {
						color: "inherit",
						backgroundColor: "transparent",
						border: "1px solid rgba(255, 255, 255, 0.35)",
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
				"aria-labelledby": tabId(activeTab),
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
							color: activeTab === "Elements" ? "#51cf66" : "#ff6b6b",
							margin: 0,
						},
					},
					inspectorText,
				),
			),
		),
	);
}
