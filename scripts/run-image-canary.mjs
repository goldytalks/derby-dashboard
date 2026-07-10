#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { performance } from "node:perf_hooks";

const DEADLINE_MS = 42_000;
const REQUEST_TIMEOUT_MS = 45_000;
const VERIFICATION_VALIDITY_MS = 7 * 24 * 60 * 60 * 1_000;
const CLOCK_SKEW_MS = 5 * 60 * 1_000;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const ACTIVE_TEAMS = new Set([
  "FRA", "MAR", "ESP", "BEL", "NOR", "ENG", "ARG", "SUI",
  "USC", "SJSU", "ALA", "ECAR", "UGA", "TSU", "UF", "FAU", "LSU", "CLEM",
]);

function usage() {
  return [
    "Run the protected hosted-image release canary.",
    "",
    "Usage:",
    "  BOOTH_CANARY_SECRET=... node scripts/run-image-canary.mjs --url https://preview.example --team USC",
    "",
    "Options:",
    "  --url <url>       Deployed booth origin (or BOOTH_CANARY_URL)",
    "  --team <code>     Allowlisted team code (default: USC)",
    "  --model <name>    Expected deployed model checked by the protected route",
    "                    (or BOOTH_CANARY_MODEL; defaults to the route model)",
    "  --output <path>   Output image path (default: a private file in the OS temp directory)",
    "  --help            Show this help",
    "",
    "The secret is accepted only through BOOTH_CANARY_SECRET so it does not enter shell history.",
    "The deployment must expose VERCEL_GIT_COMMIT_SHA or a deliberate BOOTH_RELEASE_ARTIFACT_ID.",
    "A passing run prints the server-only verification env values for the same release artifact.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
      continue;
    }
    if (!["--url", "--team", "--model", "--output"].includes(argument)) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${argument}`);
    }
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

function expectedModel(options) {
  if (options.model) return options.model;
  if (process.env.BOOTH_CANARY_MODEL) return process.env.BOOTH_CANARY_MODEL;
  if (process.env.AI_IMAGE_PROVIDER === "gemini") {
    return process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
  }
  return process.env.AI_GATEWAY_IMAGE_MODEL || "google/gemini-3.1-flash-image";
}

function parseImageDataUrl(value) {
  if (typeof value !== "string") return undefined;
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(value);
  if (!match) return undefined;
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.byteLength === 0 || bytes.toString("base64") !== match[2]) return undefined;
  return { mime: match[1].toLowerCase(), bytes };
}

function safeErrorCode(body) {
  return body && typeof body === "object" && typeof body.error === "string"
    ? body.error.replace(/[^a-z0-9_-]/gi, "").slice(0, 80) || "request_failed"
    : "request_failed";
}

function parseVerification(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Canary returned no release verification metadata.");
  }

  const artifactSha256 = value.artifactSha256;
  const configSha256 = value.configSha256;
  const verifiedAt = value.verifiedAt;
  const expiresAt = value.expiresAt;
  if (
    typeof artifactSha256 !== "string"
    || !SHA256_PATTERN.test(artifactSha256)
    || typeof configSha256 !== "string"
    || !SHA256_PATTERN.test(configSha256)
    || !Number.isSafeInteger(verifiedAt)
    || !Number.isSafeInteger(expiresAt)
  ) {
    throw new Error("Canary returned malformed release verification metadata.");
  }

  const now = Date.now();
  const validityMs = expiresAt - verifiedAt;
  if (
    verifiedAt > now + CLOCK_SKEW_MS
    || expiresAt <= now
    || validityMs <= 0
    || validityMs > VERIFICATION_VALIDITY_MS
  ) {
    throw new Error("Canary returned invalid or expired release verification timing.");
  }

  return { artifactSha256, configSha256, verifiedAt, expiresAt };
}

function verificationEnv(metadata, canaryMs) {
  return [
    ["AI_IMAGE_PROVIDER_VERIFIED", "1"],
    ["AI_IMAGE_PROVIDER_CANARY_MS", String(canaryMs)],
    ["AI_IMAGE_PROVIDER_VERIFIED_ARTIFACT_SHA256", metadata.artifactSha256],
    ["AI_IMAGE_PROVIDER_VERIFIED_CONFIG_SHA256", metadata.configSha256],
    ["AI_IMAGE_PROVIDER_VERIFIED_AT", String(metadata.verifiedAt)],
    ["AI_IMAGE_PROVIDER_VERIFIED_EXPIRES_AT", String(metadata.expiresAt)],
  ];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const secret = process.env.BOOTH_CANARY_SECRET;
  if (!secret) throw new Error("BOOTH_CANARY_SECRET is required.");

  const rawUrl = options.url || process.env.BOOTH_CANARY_URL;
  if (!rawUrl) throw new Error("Provide --url or BOOTH_CANARY_URL.");
  const origin = new URL(rawUrl);
  if (origin.username || origin.password) throw new Error("The canary URL cannot contain credentials.");
  const isLocal = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if (origin.protocol !== "https:" && !(isLocal && origin.protocol === "http:")) {
    throw new Error("Use an HTTPS deployed URL (HTTP is accepted only for localhost).");
  }
  origin.pathname = "/api/generate";
  origin.search = "";
  origin.hash = "";

  const team = String(options.team || process.env.BOOTH_CANARY_TEAM || "USC").toUpperCase();
  if (!ACTIVE_TEAMS.has(team)) throw new Error(`Unsupported team code: ${team}`);

  const model = expectedModel(options);
  if (!model || model.length > 200 || /[\r\n]/.test(model)) {
    throw new Error("Provide a valid expected model name.");
  }

  const runId = randomUUID().replaceAll("-", "");
  const jobId = `canary-${runId}`;
  const selectionKey = `canary:${team.toLowerCase()}:${runId}`;
  const requestedOutputPath = options.output ? resolve(options.output) : null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const startedAt = performance.now();
  let response;
  let body;
  try {
    response = await fetch(origin, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-booth-canary-secret": secret,
        "x-booth-canary-model": model,
      },
      body: JSON.stringify({ jobId, selectionKey, teamCode: team }),
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
    });
    try {
      body = await response.json();
    } catch {
      throw new Error(`Canary returned invalid JSON (HTTP ${response.status}).`);
    }
  } finally {
    clearTimeout(timeout);
  }
  const elapsedMs = Math.round(performance.now() - startedAt);

  if (!response.ok || body?.status !== "complete") {
    throw new Error(`Canary failed with HTTP ${response.status} (${safeErrorCode(body)}).`);
  }
  if (body.jobId !== jobId || body.selectionKey !== selectionKey || body.teamCode !== team) {
    throw new Error("Canary response correlation did not match the request.");
  }
  if (!Number.isSafeInteger(body.elapsedMs) || body.elapsedMs <= 0 || body.elapsedMs >= DEADLINE_MS) {
    throw new Error("Canary server timing was missing or exceeded 42 seconds.");
  }
  if (elapsedMs >= DEADLINE_MS) {
    throw new Error(`Canary exceeded 42 seconds (${elapsedMs}ms).`);
  }

  const verification = parseVerification(body.verification);

  const image = parseImageDataUrl(body.imageBase64);
  if (!image) throw new Error("Canary returned no valid generated image.");

  const extension = image.mime === "image/jpeg"
    ? "jpg"
    : image.mime === "image/webp"
      ? "webp"
      : "png";
  const outputPath = requestedOutputPath
    || join(tmpdir(), `novig-booth-canary-${runId}.${extension}`);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, image.bytes, { mode: 0o600 });
  console.log(`Canary passed: elapsed=${elapsedMs}ms team=${team} output=${outputPath}`);
  console.log("Server-only verification env for this exact release artifact:");
  for (const [name, value] of verificationEnv(verification, body.elapsedMs)) {
    console.log(`${name}=${value}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown canary failure.";
  console.error(`Canary failed: ${message}`);
  process.exitCode = 1;
});
