import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
	inspectReleaseState,
	waitForPublishedRelease,
} from "./check-release-state.mjs";
import {
	selectExactShaPushRun,
	verifyReleaseGates,
} from "./verify-release-gates.mjs";

function jsonResponse(value, status = 200) {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "content-type": "application/json" },
	});
}

function bytesResponse(value, status = 200) {
	return new Response(value, { status });
}

function sha256(value) {
	return createHash("sha256").update(value).digest("hex");
}

function sha512Integrity(value) {
	return `sha512-${createHash("sha512").update(value).digest("base64")}`;
}

async function withFetch(mock, callback) {
	const original = globalThis.fetch;
	globalThis.fetch = mock;
	try {
		return await callback();
	} finally {
		globalThis.fetch = original;
	}
}

test("selectExactShaPushRun ignores other SHAs/events and chooses the newest run", () => {
	const selected = selectExactShaPushRun(
		[
			{ id: 4, head_sha: "wanted", event: "pull_request" },
			{ id: 3, head_sha: "other", event: "push" },
			{ id: 1, head_sha: "wanted", event: "push" },
			{ id: 2, head_sha: "wanted", event: "push" },
		],
		"wanted",
	);
	assert.equal(selected?.id, 2);
});

test("verifyReleaseGates fails closed when an exact-SHA workflow fails", async () => {
	await withFetch(
		async (input) => {
			const url = String(input);
			const workflow = url.includes("security.yml") ? "security" : "ci";
			return jsonResponse({
				workflow_runs: [
					{
						id: workflow === "security" ? 2 : 1,
						head_sha: "release-sha",
						event: "push",
						status: "completed",
						conclusion: workflow === "security" ? "failure" : "success",
						html_url: `https://example.test/${workflow}`,
					},
				],
			});
		},
		async () => {
			await assert.rejects(
				verifyReleaseGates({
					repo: "owner/repo",
					sha: "release-sha",
					token: "token",
					attempts: 1,
					delayMs: 0,
				}),
				/security\.yml failed/,
			);
		},
	);
});

test("inspectReleaseState permits a release only when npm and GitHub are both absent", async () => {
	await withFetch(
		async () => new Response("not found", { status: 404 }),
		async () => {
			const result = await inspectReleaseState({
				packageName: "@ispoofermotion/core",
				version: "4.2.0",
				repo: "owner/repo",
				expectedSha: "release-sha",
				token: "token",
			});
			assert.deepEqual(result, { needed: true, artifactSha256: null });
		},
	);
});

test("inspectReleaseState rejects partial publication instead of reconstructing it", async () => {
	await withFetch(
		async (input) => {
			const url = String(input);
			if (url.startsWith("https://registry.npmjs.org/")) {
				return jsonResponse({
					name: "@ispoofermotion/core",
					version: "4.2.0",
					dist: { tarball: "https://npm.test/package.tgz" },
				});
			}
			return new Response("not found", { status: 404 });
		},
		async () => {
			await assert.rejects(
				inspectReleaseState({
					packageName: "@ispoofermotion/core",
					version: "4.2.0",
					repo: "owner/repo",
					expectedSha: "release-sha",
					token: "token",
				}),
				/Refusing to reconstruct a partial release automatically/,
			);
		},
	);
});

test("inspectReleaseState verifies tag, npm integrity, GitHub digests, checksum, and SPDX asset", async () => {
	const packageBytes = Buffer.from("release artifact bytes");
	const packageDigest = sha256(packageBytes);
	const checksumBytes = Buffer.from(`${packageDigest}  package.tgz\n`);
	const sbomBytes = Buffer.from(
		JSON.stringify({ spdxVersion: "SPDX-2.3", SPDXID: "SPDXRef-DOCUMENT" }),
	);
	const release = {
		tag_name: "v4.2.0",
		draft: false,
		prerelease: false,
		assets: [
			{
				name: "package.tgz",
				state: "uploaded",
				url: "https://api.github.test/assets/package",
				digest: `sha256:${packageDigest}`,
			},
			{
				name: "package.sha256",
				state: "uploaded",
				url: "https://api.github.test/assets/checksum",
				digest: `sha256:${sha256(checksumBytes)}`,
			},
			{
				name: "sbom.spdx.json",
				state: "uploaded",
				url: "https://api.github.test/assets/sbom",
				digest: `sha256:${sha256(sbomBytes)}`,
			},
		],
	};

	await withFetch(
		async (input) => {
			const url = String(input);
			if (url.startsWith("https://registry.npmjs.org/")) {
				return jsonResponse({
					name: "@ispoofermotion/core",
					version: "4.2.0",
					dist: {
						tarball: "https://npm.test/package.tgz",
						integrity: sha512Integrity(packageBytes),
					},
				});
			}
			if (url.includes("/releases/tags/")) return jsonResponse(release);
			if (url.includes("/git/ref/tags/")) {
				return jsonResponse({ object: { type: "commit", sha: "release-sha" } });
			}
			if (url === "https://npm.test/package.tgz")
				return bytesResponse(packageBytes);
			if (url === "https://api.github.test/assets/package") {
				return bytesResponse(packageBytes);
			}
			if (url === "https://api.github.test/assets/checksum") {
				return bytesResponse(checksumBytes);
			}
			if (url === "https://api.github.test/assets/sbom")
				return bytesResponse(sbomBytes);
			throw new Error(`Unexpected fetch: ${url}`);
		},
		async () => {
			const result = await inspectReleaseState({
				packageName: "@ispoofermotion/core",
				version: "4.2.0",
				repo: "owner/repo",
				expectedSha: "release-sha",
				token: "token",
			});
			assert.deepEqual(result, {
				needed: false,
				artifactSha256: packageDigest,
			});
		},
	);
});

test("waitForPublishedRelease tolerates short registry/release visibility delay", async () => {
	let npmChecks = 0;
	const packageBytes = Buffer.from("artifact");
	const digest = sha256(packageBytes);
	const checksumBytes = Buffer.from(`${digest}  package.tgz\n`);
	const sbomBytes = Buffer.from(JSON.stringify({ spdxVersion: "SPDX-2.3" }));

	await withFetch(
		async (input) => {
			const url = String(input);
			if (url.startsWith("https://registry.npmjs.org/")) {
				npmChecks++;
				if (npmChecks === 1) return new Response("not found", { status: 404 });
				return jsonResponse({
					name: "@ispoofermotion/core",
					version: "4.2.0",
					dist: {
						tarball: "https://npm.test/retry.tgz",
						integrity: sha512Integrity(packageBytes),
					},
				});
			}
			if (url.includes("/releases/tags/")) {
				if (npmChecks === 1) return new Response("not found", { status: 404 });
				return jsonResponse({
					tag_name: "v4.2.0",
					draft: false,
					prerelease: false,
					assets: [
						{
							name: "package.tgz",
							state: "uploaded",
							url: "https://asset/p",
							digest: `sha256:${digest}`,
						},
						{
							name: "package.sha256",
							state: "uploaded",
							url: "https://asset/c",
							digest: `sha256:${sha256(checksumBytes)}`,
						},
						{
							name: "sbom.spdx.json",
							state: "uploaded",
							url: "https://asset/s",
							digest: `sha256:${sha256(sbomBytes)}`,
						},
					],
				});
			}
			if (url.includes("/git/ref/tags/")) {
				return jsonResponse({ object: { type: "commit", sha: "release-sha" } });
			}
			if (url === "https://npm.test/retry.tgz" || url === "https://asset/p") {
				return bytesResponse(packageBytes);
			}
			if (url === "https://asset/c") return bytesResponse(checksumBytes);
			if (url === "https://asset/s") return bytesResponse(sbomBytes);
			throw new Error(`Unexpected fetch: ${url}`);
		},
		async () => {
			const result = await waitForPublishedRelease(
				{
					packageName: "@ispoofermotion/core",
					version: "4.2.0",
					repo: "owner/repo",
					expectedSha: "release-sha",
					token: "token",
				},
				{ attempts: 2, delayMs: 0 },
			);
			assert.equal(result.artifactSha256, digest);
			assert.equal(npmChecks, 2);
		},
	);
});
