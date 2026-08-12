/// <reference types="node" />

import { defineConfig } from "@playwright/test";

const isCi = Boolean(process.env.CI);

export default defineConfig({
	testDir: "./tests/browser",
	fullyParallel: true,
	timeout: 30_000,
	expect: { timeout: 5_000 },
	...(isCi ? { retries: 1, workers: 3 } : {}),
	reporter: isCi ? [["line"], ["html", { open: "never" }]] : [["list"]],
	use: {
		baseURL: "http://127.0.0.1:4173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		viewport: { width: 800, height: 600 },
	},
	webServer: {
		command: "node tests/browser/server.mjs",
		url: "http://127.0.0.1:4173/health",
		reuseExistingServer: !isCi,
		timeout: 30_000,
	},
	projects: [
		{ name: "chromium", use: { browserName: "chromium" } },
		{ name: "firefox", use: { browserName: "firefox" } },
		{ name: "webkit", use: { browserName: "webkit" } },
	],
});
