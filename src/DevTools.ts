import { createElement } from "react";
import { defineWidget } from "./defineWidget";
import { getErrorMessage } from "./errors";
import { makeInteractive } from "./makeInteractive";
import { getRuntimeForId, mountedRuntimes } from "./runtime";
import type { FrameEntry } from "./types";

type Tab = "Elements" | "State";

/** Stable tuple of tabs, hoisted so it isn't reallocated on every render. */
const TABS: readonly Tab[] = ["Elements", "State"];

interface DevToolsState {
	expanded: boolean;
	activeTab: Tab;
}

/**
 * Minimum time between full re-serializations of the tree/state snapshot,
 * in milliseconds. DevTools re-renders on every host app frame while
 * expanded, and `serializeWidgetTree`/`serializeState` do a full
 * JSON.stringify pass over the live tree -- fine for the small apps this
 * ships with, but unbounded for a host app with thousands of widgets.
 * Snapshots refresh at most this often; the panel still shows the most
 * recent snapshot in between, which is more than sufficient for a
 * debugging tool (nobody needs sub-100ms fidelity on a state inspector).
 */
const SNAPSHOT_THROTTLE_MS = 250;

interface SnapshotCacheEntry {
	elementsLastSnapshotAt: number;
	stateLastSnapshotAt: number;
	elementsText: string;
	stateText: string;
}

/**
 * Snapshot cache, keyed by widget instance `id`.
 *
 * Deliberately *not* a single module-level cache: two separate `createApp()`
 * roots (two mounted apps on the same page, each with its own `DevTools()`
 * call) are two distinct widget instances with distinct composite ids, and
 * must not share a throttle window or overwrite each other's cached text.
 *
 * Each tab tracks its own throttle timestamp so switching tabs always shows
 * that tab's most recent snapshot instead of inheriting whichever tab was
 * viewed last.
 *
 * This map is keyed by composite id, not tied into the runtime's own
 * stateStore/TTL bookkeeping, so it has no automatic GC of its own. Entries
 * are swept opportunistically on every render (see `pruneStaleCacheEntries`)
 * by checking each cached id against `getRuntimeForId`, which is deleted
 * once the runtime that owns it has garbage-collected it. In practice this
 * cache holds at most one entry per mounted DevTools instance, so it stays
 * small regardless.
 */
const snapshotCache = new Map<string, SnapshotCacheEntry>();

/**
 * Drop cache entries for ids no longer owned by any runtime, i.e. DevTools
 * instances that have stopped being drawn and were already garbage-collected
 * from the owning runtime's own state store.
 */
function pruneStaleCacheEntries(): void {
	for (const cachedId of snapshotCache.keys()) {
		if (!getRuntimeForId(cachedId)) {
			snapshotCache.delete(cachedId);
		}
	}
}

/**
 * JSON.stringify replacer that renders Maps, Sets, and functions as
 * readable placeholders instead of throwing or silently dropping them.
 */
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

/**
 * Serialize a widget's state for display, tolerating values JSON can't
 * normally express (functions, Map, Set) instead of collapsing to an
 * unhelpful "[object Object]" fallback.
 */
function serializeState(state: unknown): string {
	try {
		return JSON.stringify(state, devToolsReplacer, 2);
	} catch (err) {
		return `<unserializable: ${getErrorMessage(err)}>`;
	}
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

		// Snapshot live data from all mounted runtimes, but only for the tab
		// that's actually visible -- serializing the whole tree and state
		// store on every render regardless of which tab is open is wasted
		// work for apps with a large widget tree. Additionally throttled
		// (see SNAPSHOT_THROTTLE_MS): re-serializing on every single host-app
		// frame is unnecessary for a debugging panel.
		// mountedRuntimes is safe to read outside of a draw pass.
		pruneStaleCacheEntries();

		// The tab/close sub-ids below (`${id}/tab/${tab}`, `${id}/close`) are
		// hand-constructed rather than produced by buildId(), so they never
		// went through the normal id-ownership registration -- makeInteractive's
		// onFocus/onBlur handlers call getRuntimeForId() on them and silently
		// no-op when it returns undefined. `id` itself *is* a real widget id
		// (DevTools is drawn like any other widget), so we can look up its
		// owning runtime and explicitly register the sub-ids against it.
		const owningRuntime = getRuntimeForId(id);
		if (owningRuntime) {
			for (const tab of TABS) {
				owningRuntime.registerExternalId(`${id}/tab/${tab}`);
			}
			owningRuntime.registerExternalId(`${id}/close`);
		}

		let cache = snapshotCache.get(id);
		if (!cache) {
			cache = {
				elementsLastSnapshotAt: Number.NEGATIVE_INFINITY,
				stateLastSnapshotAt: Number.NEGATIVE_INFINITY,
				elementsText: "",
				stateText: "",
			};
			snapshotCache.set(id, cache);
		}

		const now = Date.now();

		if (
			state.activeTab === "Elements" &&
			now - cache.elementsLastSnapshotAt >= SNAPSHOT_THROTTLE_MS
		) {
			cache.elementsText = Array.from(mountedRuntimes)
				.flatMap((r) =>
					Array.from(r.getTree().entries()).map(
						([layer, entries]) =>
							`[layer: ${layer}]\n${serializeWidgetTree(entries) || "  (empty)"}`,
					),
				)
				.join("\n\n");
			cache.elementsLastSnapshotAt = now;
		} else if (
			state.activeTab === "State" &&
			now - cache.stateLastSnapshotAt >= SNAPSHOT_THROTTLE_MS
		) {
			const stateEntries = Array.from(mountedRuntimes).flatMap((r) =>
				Array.from(r.getStateStore().entries()).map(
					([entryId, s]) => `${entryId}:\n${serializeState(s)}`,
				),
			);
			cache.stateText =
				stateEntries.length > 0 ? stateEntries.join("\n---\n") : "(empty)";
			cache.stateLastSnapshotAt = now;
		}

		const elementsText =
			state.activeTab === "Elements" ? cache.elementsText : "";
		const stateText = state.activeTab === "State" ? cache.stateText : "";

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
					{ role: "tablist", style: { display: "flex", gap: "2px" } },
					TABS.map((tab) =>
						createElement(
							"div",
							{
								key: tab,
								id: `${id}/tab/${tab}`,
								"aria-controls": `${id}/tabpanel`,
								...makeInteractive(
									() => setState({ ...state, activeTab: tab }),
									{
										role: "tab",
										id: `${id}/tab/${tab}`,
										selected: state.activeTab === tab,
									},
								),
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
						...makeInteractive(() => setState({ ...state, expanded: false }), {
							role: "button",
							id: `${id}/close`,
						}),
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
			// Content Area
			createElement(
				"div",
				{
					role: "tabpanel",
					id: `${id}/tabpanel`,
					"aria-labelledby": `${id}/tab/${state.activeTab}`,
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
							stateText || "(no state)",
						),
					),
			),
		);
	},
	getReturnValue: () => undefined,
});
