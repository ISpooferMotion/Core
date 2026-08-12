import {
	serializeInspectorState,
	serializeInspectorTree,
} from "./inspectorSerializer";
import { mountedRuntimes, type Runtime } from "./runtime";

export const DEVTOOLS_PROTOCOL_VERSION = 1 as const;
export const DEVTOOLS_PROTOCOL_SYMBOL = Symbol.for(
	"@ispoofermotion/core/devtools/v1",
);

/** Read-only external inspector snapshot. No live Runtime objects are exposed. */
export interface InspectorRuntimeSnapshot {
	instanceId: string;
	storageNamespace: string | null;
	treeRevision: number;
	stateRevision: number;
	elements: string;
	state: string;
}

/** Versioned protocol exposed only when the DevTools entry is loaded. */
export interface InspectorProtocolV1 {
	readonly version: typeof DEVTOOLS_PROTOCOL_VERSION;
	listRuntimes(): readonly InspectorRuntimeSnapshot[];
	getRuntime(instanceId: string): InspectorRuntimeSnapshot | undefined;
}

function snapshotRuntime(runtime: Runtime): InspectorRuntimeSnapshot {
	const elements = Array.from(runtime.getTree().entries())
		.map(
			([layer, entries]) =>
				`[layer: ${layer}]\n${serializeInspectorTree(entries) || "  (empty)"}`,
		)
		.join("\n\n");
	const stateEntries = Array.from(runtime.getStateStore().entries()).map(
		([id, state]) => `${id}:\n${serializeInspectorState(state)}`,
	);
	return {
		instanceId: runtime.getInstanceId(),
		storageNamespace: runtime.getStorageNamespace(),
		treeRevision: runtime.getInspectionRevision("tree"),
		stateRevision: runtime.getInspectionRevision("state"),
		elements: elements || "(no widgets rendered)",
		state: stateEntries.length > 0 ? stateEntries.join("\n---\n") : "(empty)",
	};
}

function createProtocol(): InspectorProtocolV1 {
	return Object.freeze({
		version: DEVTOOLS_PROTOCOL_VERSION,
		listRuntimes: () => Array.from(mountedRuntimes, snapshotRuntime),
		getRuntime: (instanceId: string) => {
			for (const runtime of mountedRuntimes) {
				if (runtime.getInstanceId() === instanceId)
					return snapshotRuntime(runtime);
			}
			return undefined;
		},
	});
}

/** Install or return the v1 global inspector protocol. */
export function installDevToolsProtocol(): InspectorProtocolV1 {
	const target = globalThis as unknown as Record<PropertyKey, unknown>;
	const existing = target[DEVTOOLS_PROTOCOL_SYMBOL];
	if (
		existing &&
		typeof existing === "object" &&
		(existing as { version?: unknown }).version === DEVTOOLS_PROTOCOL_VERSION
	) {
		return existing as InspectorProtocolV1;
	}
	const protocol = createProtocol();
	target[DEVTOOLS_PROTOCOL_SYMBOL] = protocol;
	return protocol;
}

/** Read the protocol without installing it. */
export function getDevToolsProtocol(): InspectorProtocolV1 | undefined {
	const target = globalThis as unknown as Record<PropertyKey, unknown>;
	const value = target[DEVTOOLS_PROTOCOL_SYMBOL];
	return value &&
		typeof value === "object" &&
		(value as { version?: unknown }).version === DEVTOOLS_PROTOCOL_VERSION
		? (value as InspectorProtocolV1)
		: undefined;
}
