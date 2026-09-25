import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_VERSION = "2026-03-10";
const DEFAULT_ATTEMPTS = 180;
const DEFAULT_DELAY_MS = 10_000;

function required(value, name) {
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function githubJson(url, token) {
	const response = await fetch(url, {
		headers: {
			Accept: "application/vnd.github+json",
			Authorization: `Bearer ${token}`,
			"X-GitHub-Api-Version": API_VERSION,
		},
	});
	if (!response.ok) {
		throw new Error(
			`GitHub API request failed (${response.status} ${response.statusText}) for ${url}.`,
		);
	}
	return response.json();
}

export function selectExactShaPushRun(runs, sha) {
	return (
		runs
			.filter((run) => run.head_sha === sha && run.event === "push")
			.sort((left, right) => right.id - left.id)[0] ?? null
	);
}

export async function getWorkflowGateState({ repo, workflow, sha, token }) {
	const url = new URL(
		`https://api.github.com/repos/${repo}/actions/workflows/${workflow}/runs`,
	);
	url.searchParams.set("head_sha", sha);
	url.searchParams.set("event", "push");
	url.searchParams.set("per_page", "20");
	const payload = await githubJson(url, token);
	const run = selectExactShaPushRun(payload.workflow_runs ?? [], sha);
	if (!run) return { state: "pending", detail: "no exact-SHA push run yet" };
	if (run.status !== "completed") {
		return { state: "pending", detail: `${run.status} (${run.html_url})` };
	}
	if (run.conclusion !== "success") {
		return {
			state: "failed",
			detail: `${run.conclusion ?? "unknown"} (${run.html_url})`,
		};
	}
	return { state: "success", detail: run.html_url };
}

export async function verifyReleaseGates({
	repo,
	sha,
	token,
	workflows = ["ci.yml", "security.yml"],
	attempts = DEFAULT_ATTEMPTS,
	delayMs = DEFAULT_DELAY_MS,
}) {
	for (let attempt = 1; attempt <= attempts; attempt++) {
		const states = await Promise.all(
			workflows.map(async (workflow) => [
				workflow,
				await getWorkflowGateState({ repo, workflow, sha, token }),
			]),
		);

		const failed = states.find(([, result]) => result.state === "failed");
		if (failed) {
			throw new Error(
				`Release gate ${failed[0]} failed for ${sha}: ${failed[1].detail}`,
			);
		}

		if (states.every(([, result]) => result.state === "success")) {
			for (const [workflow, result] of states) {
				console.log(`Verified ${workflow} for ${sha}: ${result.detail}`);
			}
			return;
		}

		if (attempt === attempts) {
			const detail = states
				.map(([workflow, result]) => `${workflow}: ${result.detail}`)
				.join("; ");
			throw new Error(
				`Timed out waiting for exact-SHA release gates for ${sha}: ${detail}`,
			);
		}

		console.log(
			`Waiting for exact-SHA release gates (${attempt}/${attempts}): ${states
				.map(([workflow, result]) => `${workflow}=${result.detail}`)
				.join(", ")}`,
		);
		await sleep(delayMs);
	}
}

if (
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
	const repo = required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
	const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
	const sha = required(
		process.argv[2] ?? process.env.RELEASE_SHA,
		"release SHA argument or RELEASE_SHA",
	);
	await verifyReleaseGates({ repo, sha, token });
}
