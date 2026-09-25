import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_VERSION = "2026-03-10";
const REQUIRED_RELEASE_ASSETS = [
	"package.tgz",
	"package.sha256",
	"sbom.spdx.json",
];
const POST_PUBLISH_ATTEMPTS = 20;
const POST_PUBLISH_DELAY_MS = 3_000;

function sleep(ms) {
	return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function required(value, name) {
	if (!value) throw new Error(`${name} is required.`);
	return value;
}

function hash(algorithm, bytes, encoding = "hex") {
	return createHash(algorithm).update(bytes).digest(encoding);
}

async function writeOutput(name, value) {
	if (!process.env.GITHUB_OUTPUT) return;
	await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function fetchOptionalJson(url, init = {}) {
	const response = await fetch(url, init);
	if (response.status === 404) return null;
	if (!response.ok) {
		throw new Error(
			`Request failed (${response.status} ${response.statusText}) for ${url}.`,
		);
	}
	return response.json();
}

function githubHeaders(token, accept = "application/vnd.github+json") {
	return {
		Accept: accept,
		Authorization: `Bearer ${token}`,
		"X-GitHub-Api-Version": API_VERSION,
	};
}

async function githubOptionalJson(url, token) {
	return fetchOptionalJson(url, { headers: githubHeaders(token) });
}

async function fetchBytes(url, init = {}) {
	const response = await fetch(url, init);
	if (!response.ok) {
		throw new Error(
			`Download failed (${response.status} ${response.statusText}) for ${url}.`,
		);
	}
	return Buffer.from(await response.arrayBuffer());
}

async function downloadReleaseAsset(asset, token) {
	return fetchBytes(asset.url, {
		headers: githubHeaders(token, "application/octet-stream"),
	});
}

async function resolveReleaseTagSha(repo, tag, token) {
	const ref = await githubOptionalJson(
		`https://api.github.com/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`,
		token,
	);
	if (!ref) throw new Error(`Git tag ${tag} is missing.`);

	let object = ref.object;
	for (let depth = 0; depth < 8; depth++) {
		if (object.type === "commit") return object.sha;
		if (object.type !== "tag") {
			throw new Error(
				`Git tag ${tag} resolves to unsupported type ${object.type}.`,
			);
		}
		const tagObject = await githubOptionalJson(
			`https://api.github.com/repos/${repo}/git/tags/${object.sha}`,
			token,
		);
		if (!tagObject) {
			throw new Error(
				`Annotated tag object ${object.sha} for ${tag} is missing.`,
			);
		}
		object = tagObject.object;
	}

	throw new Error(`Git tag ${tag} has too many nested annotated tags.`);
}

function getReleaseAsset(release, name) {
	const matches = (release.assets ?? []).filter((asset) => asset.name === name);
	if (matches.length !== 1) {
		throw new Error(
			`GitHub release ${release.tag_name} must contain exactly one ${name} asset; found ${matches.length}.`,
		);
	}
	if (matches[0].state !== "uploaded") {
		throw new Error(
			`GitHub release asset ${name} is not fully uploaded (state=${matches[0].state}).`,
		);
	}
	return matches[0];
}

function verifyAssetDigest(asset, bytes) {
	if (!asset.digest) return;
	const [algorithm, expected] = asset.digest.split(":", 2);
	if (algorithm !== "sha256" || !expected) {
		throw new Error(
			`Unsupported GitHub asset digest for ${asset.name}: ${asset.digest}`,
		);
	}
	const actual = hash("sha256", bytes);
	if (actual !== expected) {
		throw new Error(
			`GitHub reported digest mismatch for ${asset.name}: expected ${expected}, got ${actual}.`,
		);
	}
}

function verifyNpmIntegrity(metadata, bytes) {
	const integrity = metadata.dist?.integrity;
	if (typeof integrity === "string") {
		const candidate = integrity
			.split(/\s+/)
			.find((entry) => entry.startsWith("sha512-"));
		if (candidate) {
			const actual = `sha512-${hash("sha512", bytes, "base64")}`;
			if (actual !== candidate) {
				throw new Error(
					`npm registry integrity mismatch: expected ${candidate}, got ${actual}.`,
				);
			}
			return;
		}
	}

	const shasum = metadata.dist?.shasum;
	if (typeof shasum !== "string" || hash("sha1", bytes) !== shasum) {
		throw new Error(
			"npm registry did not provide a verifiable package integrity value.",
		);
	}
}

export async function inspectReleaseState({
	packageName,
	version,
	repo,
	expectedSha,
	token,
}) {
	const tag = `v${version}`;
	const npmMetadata = await fetchOptionalJson(
		`https://registry.npmjs.org/${encodeURIComponent(packageName)}/${encodeURIComponent(version)}`,
	);
	const release = await githubOptionalJson(
		`https://api.github.com/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`,
		token,
	);

	if ((npmMetadata === null) !== (release === null)) {
		throw new Error(
			`Release invariant violation for ${packageName}@${version}: npm publication and GitHub release must either both exist or both be absent. Refusing to reconstruct a partial release automatically.`,
		);
	}

	if (!npmMetadata && !release) return { needed: true, artifactSha256: null };
	if (!npmMetadata || !release)
		throw new Error("Unreachable partial release state.");
	if (npmMetadata.name !== packageName || npmMetadata.version !== version) {
		throw new Error(
			`npm registry metadata mismatch for ${packageName}@${version}: received ${String(npmMetadata.name)}@${String(npmMetadata.version)}.`,
		);
	}
	if (release.tag_name !== tag) {
		throw new Error(
			`GitHub release tag mismatch: expected ${tag}, received ${String(release.tag_name)}.`,
		);
	}
	if (release.draft || release.prerelease) {
		throw new Error(`Existing GitHub release ${tag} is draft or prerelease.`);
	}

	const tagSha = await resolveReleaseTagSha(repo, tag, token);
	if (tagSha !== expectedSha) {
		throw new Error(
			`Existing release tag ${tag} points to ${tagSha}, not the validated release commit ${expectedSha}.`,
		);
	}

	for (const assetName of REQUIRED_RELEASE_ASSETS)
		getReleaseAsset(release, assetName);
	const packageAsset = getReleaseAsset(release, "package.tgz");
	const checksumAsset = getReleaseAsset(release, "package.sha256");
	const sbomAsset = getReleaseAsset(release, "sbom.spdx.json");

	const npmTarballUrl = required(npmMetadata.dist?.tarball, "npm dist.tarball");
	const [npmBytes, githubBytes, checksumBytes, sbomBytes] = await Promise.all([
		fetchBytes(npmTarballUrl),
		downloadReleaseAsset(packageAsset, token),
		downloadReleaseAsset(checksumAsset, token),
		downloadReleaseAsset(sbomAsset, token),
	]);
	verifyNpmIntegrity(npmMetadata, npmBytes);
	verifyAssetDigest(packageAsset, githubBytes);
	verifyAssetDigest(checksumAsset, checksumBytes);
	verifyAssetDigest(sbomAsset, sbomBytes);

	let sbom;
	try {
		sbom = JSON.parse(sbomBytes.toString("utf8"));
	} catch (error) {
		throw new Error("GitHub sbom.spdx.json is not valid JSON.", {
			cause: error,
		});
	}
	if (
		typeof sbom.spdxVersion !== "string" ||
		!sbom.spdxVersion.startsWith("SPDX-")
	) {
		throw new Error("GitHub sbom.spdx.json is not a valid SPDX JSON document.");
	}

	const npmSha256 = hash("sha256", npmBytes);
	const githubSha256 = hash("sha256", githubBytes);
	if (npmSha256 !== githubSha256) {
		throw new Error(
			`Published npm tarball and GitHub package.tgz differ for ${packageName}@${version}: npm=${npmSha256}, GitHub=${githubSha256}.`,
		);
	}

	const checksumText = checksumBytes.toString("utf8").trim();
	const match = checksumText.match(/^([a-f0-9]{64})\s+\*?package\.tgz$/i);
	if (!match || match[1].toLowerCase() !== githubSha256) {
		throw new Error(
			`GitHub package.sha256 does not describe the released package.tgz (expected ${githubSha256}).`,
		);
	}

	return { needed: false, artifactSha256: githubSha256 };
}

function isTransientPublicationVisibilityError(error) {
	return (
		error instanceof Error &&
		error.message.includes(
			"npm publication and GitHub release must either both exist or both be absent",
		)
	);
}

export async function waitForPublishedRelease(
	options,
	{ attempts = POST_PUBLISH_ATTEMPTS, delayMs = POST_PUBLISH_DELAY_MS } = {},
) {
	let lastError = null;
	for (let attempt = 1; attempt <= attempts; attempt++) {
		try {
			const result = await inspectReleaseState(options);
			if (!result.needed) return result;
			lastError = new Error(
				`Expected ${options.packageName}@${options.version} to exist on npm and GitHub after publication, but it is absent.`,
			);
		} catch (error) {
			if (!isTransientPublicationVisibilityError(error)) throw error;
			lastError = error;
		}

		if (attempt < attempts) {
			console.log(
				`Waiting for published release visibility (${attempt}/${attempts})...`,
			);
			await sleep(delayMs);
		}
	}
	throw (
		lastError ??
		new Error("Published release verification failed without an error.")
	);
}

if (
	process.argv[1] &&
	fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
	const [packageNameArg, versionArg, expectedShaArg] = process.argv.slice(2);
	const packageName = required(packageNameArg, "package name argument");
	const version = required(versionArg, "version argument");
	const expectedSha = required(
		expectedShaArg ?? process.env.RELEASE_SHA,
		"release SHA argument or RELEASE_SHA",
	);
	const repo = required(process.env.GITHUB_REPOSITORY, "GITHUB_REPOSITORY");
	const token = required(process.env.GITHUB_TOKEN, "GITHUB_TOKEN");
	const requireExisting = process.argv.includes("--require-existing");

	const options = { packageName, version, repo, expectedSha, token };
	const result = requireExisting
		? await waitForPublishedRelease(options)
		: await inspectReleaseState(options);
	await writeOutput("needed", result.needed ? "true" : "false");
	if (result.artifactSha256) {
		await writeOutput("artifact_sha256", result.artifactSha256);
	}
	console.log(
		result.needed
			? `Release ${packageName}@${version} is fresh and may be published.`
			: `Release ${packageName}@${version} already exists and is internally consistent (${result.artifactSha256}).`,
	);
}
