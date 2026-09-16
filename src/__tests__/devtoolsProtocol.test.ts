import { afterEach, describe, expect, it } from "vitest";
import {
	DEVTOOLS_PROTOCOL_SYMBOL,
	DEVTOOLS_PROTOCOL_VERSION,
	getDevToolsProtocol,
	installDevToolsProtocol,
} from "../devtoolsProtocol";
import { mountedRuntimes, Runtime } from "../runtime";

const globalRegistry = globalThis as unknown as Record<PropertyKey, unknown>;

afterEach(() => {
	for (const runtime of mountedRuntimes) runtime.unregisterApp();
	delete globalRegistry[DEVTOOLS_PROTOCOL_SYMBOL];
});

describe("DevTools protocol v1", () => {
	it("is explicit, versioned, and exposes snapshots instead of live runtimes", () => {
		delete globalRegistry[DEVTOOLS_PROTOCOL_SYMBOL];
		expect(getDevToolsProtocol()).toBeUndefined();

		const runtime = new Runtime();
		runtime.registerApp(() => {});
		runtime.beginFrame();
		runtime.getState("Counter/main", { count: 7 });
		runtime.endFrame();

		const protocol = installDevToolsProtocol();
		expect(protocol.version).toBe(DEVTOOLS_PROTOCOL_VERSION);
		expect(getDevToolsProtocol()).toBe(protocol);

		const snapshots = protocol.listRuntimes();
		expect(snapshots).toHaveLength(1);
		expect(snapshots[0]?.instanceId).toBe(runtime.getInstanceId());
		expect(snapshots[0]?.state).toContain('"count": 7');
		expect(snapshots[0]).not.toHaveProperty("markDirty");
		expect(snapshots[0]).not.toHaveProperty("getStateStore");
	});

	it("shares mounted runtimes across independent registrations via global protocol", () => {
		const runtimeA = new Runtime();
		runtimeA.registerApp(() => {});
		runtimeA.beginFrame();
		runtimeA.getState("AppA/widget", { id: "a" });
		runtimeA.endFrame();

		const runtimeB = new Runtime();
		runtimeB.registerApp(() => {});
		runtimeB.beginFrame();
		runtimeB.getState("AppB/widget", { id: "b" });
		runtimeB.endFrame();

		const protocol = installDevToolsProtocol();
		const snapshots = protocol.listRuntimes();
		expect(snapshots).toHaveLength(2);
		expect(protocol.getRuntime(runtimeA.getInstanceId())).toBeDefined();
		expect(protocol.getRuntime(runtimeB.getInstanceId())).toBeDefined();
	});
});
