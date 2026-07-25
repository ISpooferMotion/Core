import { mountedRuntimes } from "./runtime";

function triggerRedraw() {
	for (const runtime of mountedRuntimes) {
		runtime.markDirty();
	}
}

const devLogs: string[] = [];
let maxLogs = 100;

export function pushLog(type: string, ...args: unknown[]) {
	const msg = args
		.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a)))
		.join(" ");
	devLogs.push(`[${type}] ${msg}`);
	if (devLogs.length > maxLogs) devLogs.shift();
	triggerRedraw(); // Trigger immediate mode UI re-draw
}

/**
 * Attaches to console.log, console.warn, console.error to capture output.
 * Call this once at the start of your application if you want to use DevConsole.
 */
export function attachDevConsole(limit = 100) {
	if (typeof window === "undefined") return;
	maxLogs = limit;
	const win = window as unknown as Record<string, unknown>;
	if (win.__ism_console_attached) return;
	win.__ism_console_attached = true;

	const originalLog = console.log;
	const originalWarn = console.warn;
	const originalError = console.error;

	console.log = (...args) => {
		originalLog(...args);
		pushLog("log", ...args);
	};
	console.warn = (...args) => {
		originalWarn(...args);
		pushLog("warn", ...args);
	};
	console.error = (...args) => {
		originalError(...args);
		pushLog("error", ...args);
	};
}

/**
 * Get the current captured dev logs as a read-only snapshot.
 */
export function getDevLogs(): readonly string[] {
	return devLogs;
}
