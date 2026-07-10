import { createHash, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  ACTIVE_TEAM_CODES,
  buildCohesivePortraitPrompt,
  parseActiveTeamCode,
  type ActiveTeamCode,
} from "@/lib/server/team-prompts";

export const runtime = "nodejs";
export const maxDuration = 60;

const GENERATION_TIMEOUT_MS = 42_000;
const PREFLIGHT_TIMEOUT_MS = 4_000;
const MAX_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 2_750_000;
const MAX_JSON_BYTES = 3 * 1024 * 1024;
const RATE_WINDOW_MS = 60_000;
const PREFLIGHTS_PER_WINDOW = 20;
const GENERATIONS_PER_WINDOW = 6;
const PERCEPTUAL_SAMPLE_SIZE = 32;
const MIN_PERCEPTUAL_DIFFERENCE = 0.08;
const MAX_DECODED_PIXELS = 4_096 * 4_096;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_PAYLOAD_KEYS = new Set(["jobId", "selectionKey", "imageBase64", "teamCode"]);
const CANARY_SECRET_HEADER = "x-booth-canary-secret";
const CANARY_MODEL_HEADER = "x-booth-canary-model";
const CANARY_VERIFICATION_SCHEMA = "novig-booth-image-canary-v2";
const CANARY_VALIDITY_MS = 7 * 24 * 60 * 60 * 1_000;
const CANARY_CLOCK_SKEW_MS = 5 * 60 * 1_000;
const CANARY_INPUT_PATH = join(
  process.cwd(),
  "public",
  "templates",
  "ai",
  "arg.webp"
);
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";
const GATEWAY_MODEL = process.env.AI_GATEWAY_IMAGE_MODEL || "google/gemini-3.1-flash-image";
const GATEWAY_PREFLIGHT_MODEL = process.env.AI_GATEWAY_PREFLIGHT_MODEL || "google/gemini-3.1-flash-lite";
const GATEWAY_URL = "https://ai-gateway.vercel.sh/v1/chat/completions";
const GEMINI_INTERACTIONS_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";

type Provider = "gateway" | "gemini";

interface GeneratePayload {
  jobId?: unknown;
  selectionKey?: unknown;
  imageBase64?: unknown;
  teamCode?: unknown;
}

interface ParsedImage {
  mime: string;
  data: string;
  bytes: Buffer;
}

interface GeneratedPortrait {
  data: string;
  mime: string;
}

interface Correlation {
  jobId: string;
  selectionKey: string;
  teamCode: ActiveTeamCode;
}

interface ProviderConfiguration {
  provider?: Provider;
  gatewayToken?: string;
}

interface CanaryVerificationBinding {
  artifactSha256: string;
  configSha256: string;
}

interface CanaryVerificationMetadata extends CanaryVerificationBinding {
  verifiedAt: number;
  expiresAt: number;
}

interface RateBucket {
  startedAt: number;
  preflights: number;
  generations: number;
}

const rateBuckets = new Map<string, RateBucket>();

interface GatewayImageUrl {
  url?: unknown;
}

class GenerationError extends Error {
  constructor(
    readonly code: string,
    readonly upstreamStatus?: number
  ) {
    super(code);
  }
}

function responseJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asString(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return undefined;
  return trimmed;
}

function parseJobId(value: unknown): string | undefined {
  const jobId = asString(value, 128);
  return jobId && /^[a-z0-9][a-z0-9_-]{7,127}$/i.test(jobId) ? jobId : undefined;
}

function parseSelectionKey(value: unknown): string | undefined {
  const selectionKey = asString(value, 256);
  return selectionKey && /^[a-z0-9][a-z0-9._:~-]{2,255}$/i.test(selectionKey)
    ? selectionKey
    : undefined;
}

function parseDataUrl(input: string): ParsedImage | null {
  const match = /^data:([a-z0-9/+.-]+);base64,([a-z0-9+/]+={0,2})$/i.exec(input);
  if (!match) return null;

  const mime = match[1].toLowerCase();
  if (!ALLOWED_MIMES.has(mime)) return null;

  const data = match[2];
  const bytes = Buffer.from(data, "base64");
  if (bytes.byteLength === 0 || bytes.toString("base64") !== data) return null;
  return { mime, data, bytes };
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function gatewayTokenFor(request: Request): string | undefined {
  return asString(process.env.AI_GATEWAY_API_KEY, 16_384)
    || asString(request.headers.get("x-vercel-oidc-token"), 16_384)
    || asString(process.env.VERCEL_OIDC_TOKEN, 16_384);
}

function configuredProvider(request: Request): ProviderConfiguration {
  const gatewayToken = gatewayTokenFor(request);
  const preferred = process.env.AI_IMAGE_PROVIDER;

  if (preferred === "gateway") {
    return { provider: gatewayToken ? "gateway" : undefined, gatewayToken };
  }
  if (preferred === "gemini") {
    return {
      provider: process.env.GEMINI_API_KEY ? "gemini" : undefined,
      gatewayToken,
    };
  }

  if (gatewayToken) return { provider: "gateway", gatewayToken };
  if (process.env.GEMINI_API_KEY) return { provider: "gemini", gatewayToken };
  return { gatewayToken };
}

function modelForProvider(provider: Provider): string {
  return provider === "gateway"
    ? GATEWAY_MODEL
    : GEMINI_MODEL.replace(/^google\//, "");
}

function deployedArtifactSha256(): string | undefined {
  const gitCommit = asString(process.env.VERCEL_GIT_COMMIT_SHA, 200);
  const releaseArtifact = asString(process.env.BOOTH_RELEASE_ARTIFACT_ID, 512);
  if (!gitCommit && !releaseArtifact) return undefined;

  return sha256Text(JSON.stringify({
    schema: CANARY_VERIFICATION_SCHEMA,
    gitCommit: gitCommit || null,
    releaseArtifact: releaseArtifact || null,
  }));
}

function promptSuiteSha256(): string {
  return sha256Text(JSON.stringify(
    ACTIVE_TEAM_CODES.map((teamCode) => [
      teamCode,
      buildCohesivePortraitPrompt(teamCode),
    ])
  ));
}

function verificationBinding(
  provider: Provider,
  canaryInput: ParsedImage
): CanaryVerificationBinding | undefined {
  const artifactSha256 = deployedArtifactSha256();
  if (!artifactSha256) return undefined;

  const generationConfig = provider === "gateway"
    ? {
        endpoint: GATEWAY_URL,
        model: modelForProvider(provider),
        modalities: ["text", "image"],
        imageDetail: "high",
        providerOrder: ["vertex", "google"],
        disallowPromptTraining: true,
        responseModalities: ["TEXT", "IMAGE"],
        aspectRatio: "1:1",
        imageSize: "1K",
      }
    : {
        endpoint: GEMINI_INTERACTIONS_URL,
        model: modelForProvider(provider),
        store: false,
        responseType: "image",
        responseMime: "image/png",
        aspectRatio: "1:1",
        imageSize: "1K",
      };

  const configSha256 = sha256Text(JSON.stringify({
    schema: CANARY_VERIFICATION_SCHEMA,
    provider,
    model: modelForProvider(provider),
    promptSuiteSha256: promptSuiteSha256(),
    canaryInputSha256: sha256(canaryInput.bytes),
    generationConfig,
    validation: {
      generationTimeoutMs: GENERATION_TIMEOUT_MS,
      maxInputBytes: MAX_INPUT_BYTES,
      maxOutputBytes: MAX_OUTPUT_BYTES,
      maxDecodedPixels: MAX_DECODED_PIXELS,
      perceptualSampleSize: PERCEPTUAL_SAMPLE_SIZE,
      minimumPerceptualDifference: MIN_PERCEPTUAL_DIFFERENCE,
      perceptualCrop: "centre-cover",
      perceptualKernel: "lanczos3",
      perceptualColourspace: "srgb",
    },
  }));

  return { artifactSha256, configSha256 };
}

function parseEpochMs(value: unknown): number | undefined {
  if (typeof value !== "string" || !/^\d{13}$/.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

async function canaryIsVerified(provider: Provider | undefined): Promise<boolean> {
  if (!provider) return false;
  const measuredMs = Number(process.env.AI_IMAGE_PROVIDER_CANARY_MS);
  const verifiedAt = parseEpochMs(process.env.AI_IMAGE_PROVIDER_VERIFIED_AT);
  const expiresAt = parseEpochMs(process.env.AI_IMAGE_PROVIDER_VERIFIED_EXPIRES_AT);
  if (!verifiedAt || !expiresAt) return false;

  let binding: CanaryVerificationBinding | undefined;
  try {
    binding = verificationBinding(provider, await committedCanaryInput());
  } catch {
    return false;
  }
  if (!binding) return false;

  const now = Date.now();
  const validityMs = expiresAt - verifiedAt;
  return process.env.AI_IMAGE_PROVIDER_VERIFIED === "1"
    && Number.isFinite(measuredMs)
    && measuredMs > 0
    && measuredMs < GENERATION_TIMEOUT_MS
    && verifiedAt <= now + CANARY_CLOCK_SKEW_MS
    && expiresAt > now
    && validityMs > 0
    && validityMs <= CANARY_VALIDITY_MS
    && constantTimeTextEqual(
      binding.artifactSha256,
      process.env.AI_IMAGE_PROVIDER_VERIFIED_ARTIFACT_SHA256
    )
    && constantTimeTextEqual(
      binding.configSha256,
      process.env.AI_IMAGE_PROVIDER_VERIFIED_CONFIG_SHA256
    );
}

function constantTimeTextEqual(
  expected: string | null | undefined,
  presented: string | null | undefined
): boolean {
  if (!expected || !presented || expected.length > 4_096 || presented.length > 4_096) {
    return false;
  }

  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const presentedDigest = createHash("sha256").update(presented, "utf8").digest();
  return timingSafeEqual(expectedDigest, presentedDigest);
}

function hasValidCanarySecret(request: Request): boolean {
  return constantTimeTextEqual(
    process.env.BOOTH_CANARY_SECRET,
    request.headers.get(CANARY_SECRET_HEADER)
  );
}

async function committedCanaryInput(): Promise<ParsedImage> {
  const bytes = await readFile(CANARY_INPUT_PATH);
  const parsed = parseDataUrl(`data:image/webp;base64,${bytes.toString("base64")}`);
  if (!parsed || parsed.bytes.byteLength > MAX_INPUT_BYTES) {
    throw new GenerationError("canary_input_unavailable");
  }
  return parsed;
}

function issueCanaryVerification(
  binding: CanaryVerificationBinding
): CanaryVerificationMetadata {
  const verifiedAt = Date.now();
  return {
    ...binding,
    verifiedAt,
    expiresAt: verifiedAt + CANARY_VALIDITY_MS,
  };
}

function clientAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "local";
}

function withinRateLimit(request: Request, kind: "preflight" | "generation"): boolean {
  const now = Date.now();
  const address = clientAddress(request);
  let bucket = rateBuckets.get(address);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    bucket = { startedAt: now, preflights: 0, generations: 0 };
    rateBuckets.set(address, bucket);
  }

  if (kind === "preflight") {
    bucket.preflights += 1;
    return bucket.preflights <= PREFLIGHTS_PER_WINDOW;
  }
  bucket.generations += 1;
  return bucket.generations <= GENERATIONS_PER_WINDOW;
}

async function sampledRgb(image: ParsedImage): Promise<Buffer> {
  try {
    const { data, info } = await sharp(image.bytes, {
      failOn: "error",
      limitInputPixels: MAX_DECODED_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .resize(PERCEPTUAL_SAMPLE_SIZE, PERCEPTUAL_SAMPLE_SIZE, {
        fit: "cover",
        position: "centre",
        kernel: sharp.kernel.lanczos3,
      })
      .flatten({ background: { r: 0, g: 0, b: 0 } })
      .toColourspace("srgb")
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (
      info.width !== PERCEPTUAL_SAMPLE_SIZE
      || info.height !== PERCEPTUAL_SAMPLE_SIZE
      || info.channels !== 3
      || data.byteLength !== PERCEPTUAL_SAMPLE_SIZE * PERCEPTUAL_SAMPLE_SIZE * 3
    ) {
      throw new GenerationError("invalid_output");
    }
    return data;
  } catch (error) {
    if (error instanceof GenerationError) throw error;
    throw new GenerationError("invalid_output");
  }
}

async function perceptualDifference(
  first: ParsedImage,
  second: ParsedImage
): Promise<number> {
  const [firstPixels, secondPixels] = await Promise.all([
    sampledRgb(first),
    sampledRgb(second),
  ]);
  let difference = 0;
  for (let index = 0; index < firstPixels.length; index += 1) {
    difference += Math.abs(firstPixels[index] - secondPixels[index]);
  }
  return difference / (PERCEPTUAL_SAMPLE_SIZE * PERCEPTUAL_SAMPLE_SIZE * 3 * 255);
}

async function checkedOutput(
  imageDataUrl: string,
  input: ParsedImage
): Promise<GeneratedPortrait> {
  const output = parseDataUrl(imageDataUrl);
  if (!output) throw new GenerationError("invalid_output");
  if (output.bytes.byteLength > MAX_OUTPUT_BYTES) {
    throw new GenerationError("output_too_large");
  }
  if (sha256(output.bytes) === sha256(input.bytes)) {
    throw new GenerationError("unchanged_image");
  }
  if (await perceptualDifference(input, output) < MIN_PERCEPTUAL_DIFFERENCE) {
    throw new GenerationError("unchanged_image");
  }
  return { data: output.data, mime: output.mime };
}

function dataUrlFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string" && value.startsWith("data:image/")) return value;
  if (!isRecord(value)) return undefined;

  if (typeof value.url === "string" && value.url.startsWith("data:image/")) {
    return value.url;
  }
  if (typeof value.data === "string") {
    const mime = typeof value.mimeType === "string"
      ? value.mimeType
      : typeof value.mime_type === "string"
        ? value.mime_type
        : "image/png";
    return `data:${mime};base64,${value.data}`;
  }
  return undefined;
}

function extractGatewayImage(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;

  const choices = Array.isArray(result.choices) ? result.choices : [];
  const message = isRecord(choices[0]) && isRecord(choices[0].message)
    ? choices[0].message
    : undefined;
  if (message) {
    const images = Array.isArray(message.images) ? message.images : [];
    for (const image of images) {
      if (!isRecord(image)) continue;
      const imageUrl = isRecord(image.image_url)
        ? image.image_url as GatewayImageUrl
        : image;
      const found = dataUrlFromUnknown(imageUrl);
      if (found) return found;
    }

    const content = Array.isArray(message.content) ? message.content : [];
    for (const part of content) {
      if (!isRecord(part)) continue;
      const imageUrl = isRecord(part.image_url) ? part.image_url : part;
      const inlineData = isRecord(part.inlineData)
        ? part.inlineData
        : isRecord(part.inline_data)
          ? part.inline_data
          : undefined;
      const found = dataUrlFromUnknown(imageUrl) || dataUrlFromUnknown(inlineData);
      if (found) return found;
    }
  }

  const files = Array.isArray(result.files) ? result.files : [];
  for (const file of files) {
    const found = dataUrlFromUnknown(file);
    if (found) return found;
  }
  return undefined;
}

function extractGeminiInteractionImage(result: unknown): string | undefined {
  if (!isRecord(result)) return undefined;

  const outputImage = dataUrlFromUnknown(result.output_image)
    || dataUrlFromUnknown(result.outputImage);
  if (outputImage) return outputImage;

  const steps = Array.isArray(result.steps) ? result.steps : [];
  for (const step of steps) {
    if (!isRecord(step) || step.type !== "model_output") continue;
    const content = Array.isArray(step.content) ? step.content : [];
    for (const block of content) {
      if (!isRecord(block)) continue;
      const found = dataUrlFromUnknown(block);
      if (found) return found;
    }
  }
  return undefined;
}

async function parseJsonResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new GenerationError("invalid_provider_response", response.status);
  }
}

async function generateWithGemini(
  image: ParsedImage,
  prompt: string,
  signal: AbortSignal
): Promise<GeneratedPortrait> {
  const model = GEMINI_MODEL.replace(/^google\//, "");
  const response = await fetch(GEMINI_INTERACTIONS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY || "",
    },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { type: "text", text: prompt },
        { type: "image", mime_type: image.mime, data: image.data },
      ],
      response_format: {
        type: "image",
        mime_type: "image/png",
        aspect_ratio: "1:1",
        image_size: "1K",
      },
    }),
    cache: "no-store",
    signal,
  });

  const result = await parseJsonResponse(response);
  if (!response.ok) {
    const status = response.status === 422 ? 422 : response.status;
    throw new GenerationError(status === 422 ? "moderation_blocked" : "provider_rejected", status);
  }

  const imageDataUrl = extractGeminiInteractionImage(result);
  if (!imageDataUrl) throw new GenerationError("no_image");
  return checkedOutput(imageDataUrl, image);
}

async function generateWithGateway(
  image: ParsedImage,
  prompt: string,
  token: string | undefined,
  signal: AbortSignal
): Promise<GeneratedPortrait> {
  if (!token) throw new GenerationError("provider_unconfigured");

  const response = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GATEWAY_MODEL,
      modalities: ["text", "image"],
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mime};base64,${image.data}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      stream: false,
      providerOptions: {
        gateway: {
          order: ["vertex", "google"],
          disallowPromptTraining: true,
        },
        google: {
          responseModalities: ["TEXT", "IMAGE"],
          imageConfig: { aspectRatio: "1:1", imageSize: "1K" },
        },
      },
    }),
    cache: "no-store",
    signal,
  });

  const result = await parseJsonResponse(response);
  if (!response.ok) {
    const status = response.status === 422 ? 422 : response.status;
    throw new GenerationError(status === 422 ? "moderation_blocked" : "provider_rejected", status);
  }

  const imageDataUrl = extractGatewayImage(result);
  if (!imageDataUrl) throw new GenerationError("no_image");
  return checkedOutput(imageDataUrl, image);
}

async function generatePortrait(
  image: ParsedImage,
  prompt: string,
  provider: Provider,
  gatewayToken: string | undefined,
  signal: AbortSignal
): Promise<GeneratedPortrait> {
  if (signal.aborted) throw new GenerationError("timeout");
  return provider === "gateway"
    ? generateWithGateway(image, prompt, gatewayToken, signal)
    : generateWithGemini(image, prompt, signal);
}

function correlatedError(correlation: Partial<Correlation>, error: string, message: string) {
  return { ...correlation, error, message };
}

async function providerIsReachable(
  provider: Provider,
  gatewayToken: string | undefined
): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);
  try {
    if (provider === "gateway") {
      if (!gatewayToken) return false;
      const response = await fetch(GATEWAY_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${gatewayToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: GATEWAY_PREFLIGHT_MODEL,
          messages: [{ role: "user", content: "Reply OK." }],
          max_tokens: 1,
          stream: false,
          providerOptions: {
            gateway: { order: ["vertex", "google"] },
          },
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      return response.ok;
    }

    const model = process.env.GEMINI_PREFLIGHT_MODEL || "gemini-3.1-flash-lite";
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": process.env.GEMINI_API_KEY || "",
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: "Reply OK." }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
        cache: "no-store",
        signal: controller.signal,
      }
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

export async function GET(request: Request) {
  if (!withinRateLimit(request, "preflight")) {
    return responseJson(
      { ready: false, error: "rate_limited", message: "Try again in a moment." },
      429
    );
  }

  const url = new URL(request.url);
  const requestedTeam = url.searchParams.get("teamCode");
  const teamCode = requestedTeam ? parseActiveTeamCode(requestedTeam) : undefined;
  if (requestedTeam && !teamCode) {
    return responseJson(
      { ready: false, error: "bad_team", message: "Choose a supported team." },
      400
    );
  }

  const { provider, gatewayToken } = configuredProvider(request);
  const configured = Boolean(provider);
  const operatorVerified = await canaryIsVerified(provider);
  const startedAt = Date.now();
  const reachable = provider && operatorVerified
    ? await providerIsReachable(provider, gatewayToken)
    : false;
  const ready = configured && operatorVerified && reachable;

  return responseJson({
    available: configured,
    configured,
    ready,
    status: ready
      ? "ready"
      : configured && operatorVerified
        ? "provider_unavailable"
        : configured
          ? "configured_unverified"
          : "unavailable",
    verified: ready,
    canaryMs: ready ? Number(process.env.AI_IMAGE_PROVIDER_CANARY_MS) : null,
    teamCode: teamCode || null,
    preflightMs: Date.now() - startedAt,
    timeoutMs: GENERATION_TIMEOUT_MS,
  });
}

export async function POST(request: Request) {
  if (!withinRateLimit(request, "generation")) {
    return responseJson(
      correlatedError({}, "rate_limited", "Try again in a moment."),
      429
    );
  }

  const canaryAuthorized = hasValidCanarySecret(request);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_JSON_BYTES) {
    return responseJson(
      correlatedError({}, "too_large", "That photo is too large. Try a smaller one."),
      413
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return responseJson(
      correlatedError({}, "bad_request", "Send a valid JSON generation request."),
      400
    );
  }

  if (!isRecord(body)) {
    return responseJson(
      correlatedError({}, "bad_request", "Send a valid generation request."),
      400
    );
  }

  const payload = body as GeneratePayload;
  const jobId = parseJobId(payload.jobId);
  const selectionKey = parseSelectionKey(payload.selectionKey);
  const teamCode = parseActiveTeamCode(payload.teamCode);
  const partialCorrelation = {
    ...(jobId ? { jobId } : {}),
    ...(selectionKey ? { selectionKey } : {}),
    ...(teamCode ? { teamCode } : {}),
  };

  const unexpectedKeys = Object.keys(body).filter((key) => !ALLOWED_PAYLOAD_KEYS.has(key));
  if (unexpectedKeys.length > 0) {
    return responseJson(
      correlatedError(
        partialCorrelation,
        "bad_request",
        "Send only the supported portrait generation fields."
      ),
      400
    );
  }

  if (!jobId) {
    return responseJson(
      correlatedError(partialCorrelation, "bad_job", "A valid job ID is required."),
      400
    );
  }
  if (!selectionKey) {
    return responseJson(
      correlatedError(
        partialCorrelation,
        "bad_selection",
        "A valid selection key is required."
      ),
      400
    );
  }
  if (!teamCode) {
    return responseJson(
      correlatedError(
        partialCorrelation,
        "bad_team",
        "Choose a supported team."
      ),
      400
    );
  }

  const correlation: Correlation = { jobId, selectionKey, teamCode };
  let image: ParsedImage;
  if (canaryAuthorized) {
    if (Object.prototype.hasOwnProperty.call(body, "imageBase64")) {
      return responseJson(
        correlatedError(
          correlation,
          "bad_request",
          "Protected canaries use the server-owned test image."
        ),
        400
      );
    }
    try {
      image = await committedCanaryInput();
    } catch {
      console.error("Hosted portrait canary input unavailable", correlation);
      return responseJson(
        correlatedError(correlation, "unavailable", "Hosted portrait generation is unavailable."),
        503
      );
    }
  } else {
    if (typeof payload.imageBase64 !== "string") {
      return responseJson(
        correlatedError(correlation, "bad_request", "A photo is required."),
        400
      );
    }

    const parsedImage = parseDataUrl(payload.imageBase64);
    if (!parsedImage) {
      return responseJson(
        correlatedError(
          correlation,
          "bad_image",
          "Photos must be valid JPEG, PNG, or WebP files."
        ),
        400
      );
    }
    image = parsedImage;
  }

  if (image.bytes.byteLength > MAX_INPUT_BYTES) {
    return responseJson(
      correlatedError(correlation, "too_large", "That photo is too large. Try a smaller one."),
      413
    );
  }

  const { provider, gatewayToken } = configuredProvider(request);
  if (!provider) {
    return responseJson(
      correlatedError(
        correlation,
        "unavailable",
        "Hosted portrait generation is unavailable."
      ),
      503
    );
  }
  let canaryBinding: CanaryVerificationBinding | undefined;
  if (
    canaryAuthorized
    && !constantTimeTextEqual(
      modelForProvider(provider),
      request.headers.get(CANARY_MODEL_HEADER)
    )
  ) {
    return responseJson(
      correlatedError(
        correlation,
        "canary_mismatch",
        "The protected canary configuration does not match this deployment."
      ),
      409
    );
  }
  if (canaryAuthorized) {
    canaryBinding = verificationBinding(provider, image);
    if (!canaryBinding) {
      return responseJson(
        correlatedError(
          correlation,
          "canary_unbound",
          "The protected canary is not bound to a release artifact."
        ),
        409
      );
    }
  }
  if (!canaryAuthorized && !(await canaryIsVerified(provider))) {
    return responseJson(
      correlatedError(
        correlation,
        "unavailable",
        "Hosted portrait generation has not passed its release canary."
      ),
      503
    );
  }

  const prompt = buildCohesivePortraitPrompt(teamCode);
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, GENERATION_TIMEOUT_MS);
  const abortForClient = () => controller.abort(request.signal.reason);
  request.signal.addEventListener("abort", abortForClient, { once: true });
  if (request.signal.aborted) abortForClient();

  try {
    const generated = await generatePortrait(
      image,
      prompt,
      provider,
      gatewayToken,
      controller.signal
    );
    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs >= GENERATION_TIMEOUT_MS) {
      timedOut = true;
      controller.abort();
      throw new GenerationError("timeout");
    }
    console.info("Hosted portrait generation completed", {
      ...correlation,
      elapsedMs,
    });

    return responseJson({
      ...correlation,
      status: "complete",
      imageBase64: `data:${generated.mime};base64,${generated.data}`,
      elapsedMs,
      ...(canaryAuthorized && canaryBinding
        ? { verification: issueCanaryVerification(canaryBinding) }
        : {}),
    });
  } catch (error) {
    const aborted = controller.signal.aborted
      || (error instanceof Error && error.name === "AbortError");
    const generationError = error instanceof GenerationError ? error : undefined;
    const code = generationError?.code;
    const upstreamStatus = generationError?.upstreamStatus;

    console.error("Hosted portrait generation failed", {
      ...correlation,
      code: timedOut ? "timeout" : aborted ? "cancelled" : code || "upstream",
    });

    if (timedOut) {
      return responseJson(
        correlatedError(correlation, "timeout", "Portrait generation took too long."),
        504
      );
    }
    if (aborted) {
      return responseJson(
        correlatedError(correlation, "cancelled", "Portrait generation was cancelled."),
        499
      );
    }
    if (code === "moderation_blocked" || code === "no_image" || code === "unchanged_image") {
      return responseJson(
        correlatedError(correlation, "not_generated", "No finished portrait was created."),
        422
      );
    }
    if (upstreamStatus === 402 || upstreamStatus === 403 || upstreamStatus === 429) {
      return responseJson(
        correlatedError(
          correlation,
          "unavailable",
          "Hosted portrait generation is unavailable."
        ),
        503
      );
    }
    return responseJson(
      correlatedError(correlation, "upstream", "Portrait generation failed."),
      502
    );
  } finally {
    clearTimeout(timeout);
    request.signal.removeEventListener("abort", abortForClient);
  }
}
