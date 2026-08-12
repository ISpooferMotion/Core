import { createApp, defineConfig } from "@ispoofermotion/core";
import { getDevToolsProtocol } from "@ispoofermotion/core/devtools";

const config = defineConfig({ strictIds: true, strictRuntime: true });
const App = createApp(() => {}, config);

if (typeof App !== "function")
	throw new Error("createApp did not return a component.");
if (getDevToolsProtocol() !== null)
	throw new Error("Node should not expose a browser DevTools protocol.");
