const core = require("@ispoofermotion/core");
const devtools = require("@ispoofermotion/core/devtools");

if (typeof core.createApp !== "function")
	throw new Error("CJS createApp export is missing.");
if (typeof devtools.getDevToolsProtocol !== "function")
	throw new Error("CJS devtools export is missing.");
