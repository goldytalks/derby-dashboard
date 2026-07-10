import { randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { buildPrompt, getCountry } from "@/lib/prompts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 3 * 1024 * 1024;
const JOB_DIR = path.join(process.cwd(), ".codex", "booth-image-job");

interface JobPayload {
  imageBase64?: string;
  countryCode?: string;
  matchup?: string;
}

interface JobMetadata {
  id: string;
  status: "queued" | "complete";
  countryCode: string;
  countryName: string;
  matchup: string;
  inputPath: string;
  promptPath: string;
  resultPath: string;
  createdAt: string;
}

function parseDataUrl(input: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/]+={0,2})$/i.exec(input);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const bytes = Buffer.from(match[2], "base64");
  return { mime, bytes };
}

function extensionFor(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

function mimeFor(fileName: string) {
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

async function ensureJobDir() {
  await mkdir(JOB_DIR, { recursive: true, mode: 0o700 });
}

async function readMetadata(id?: string | null): Promise<JobMetadata | null> {
  try {
    const fileName = id && /^[a-f0-9-]{36}$/i.test(id) ? `job-${id}.json` : "job.json";
    return JSON.parse(await readFile(path.join(JOB_DIR, fileName), "utf8")) as JobMetadata;
  } catch {
    if (!id) return null;
    try {
      const legacy = JSON.parse(
        await readFile(path.join(JOB_DIR, "job.json"), "utf8")
      ) as JobMetadata;
      return legacy.id === id ? legacy : null;
    } catch {
      return null;
    }
  }
}

async function findResult(metadata: JobMetadata) {
  const fileName = path.basename(metadata.resultPath);
  try {
    const resultPath = path.join(JOB_DIR, fileName);
    const [bytes, fileStats] = await Promise.all([readFile(resultPath), stat(resultPath)]);
    return {
      fileName,
      bytes,
      resultRevision: `${fileStats.mtimeMs}:${fileStats.size}`,
    };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (process.env.VERCEL) {
    return NextResponse.json(
      { error: "local_only", message: "Codex Image Gen handoff is available only in the local app." },
      { status: 409 }
    );
  }

  let payload: JobPayload;
  try {
    payload = (await request.json()) as JobPayload;
  } catch {
    return NextResponse.json({ error: "bad_request", message: "Send a portrait and team code." }, { status: 400 });
  }

  const image = payload.imageBase64 ? parseDataUrl(payload.imageBase64) : null;
  const country = getCountry(String(payload.countryCode || ""));
  if (!image || image.bytes.byteLength > MAX_BYTES) {
    return NextResponse.json({ error: "bad_image", message: "Use a JPEG, PNG, or WebP portrait under 3 MB." }, { status: 400 });
  }
  if (!country) {
    return NextResponse.json({ error: "bad_country", message: "Choose a tournament team." }, { status: 400 });
  }

  const id = randomUUID();
  await ensureJobDir();
  const inputPath = path.join(JOB_DIR, `input-${id}.${extensionFor(image.mime)}`);
  const promptPath = path.join(JOB_DIR, `prompt-${id}.txt`);
  const resultPath = path.join(JOB_DIR, `result-${id}.png`);
  const prompt = [
    "Use case: identity-preserve",
    "Asset type: local Novig Booth portrait test",
    `Team: ${country.name}`,
    `Primary request: ${buildPrompt(country)}`,
    "Input fidelity: high",
    "Quality: high",
    "Constraints: change only wardrobe, prop, and background; keep the person recognizable; no logos, text, or watermark.",
  ].join("\n");
  const metadata: JobMetadata = {
    id,
    status: "queued",
    countryCode: country.code,
    countryName: country.name,
    matchup: String(payload.matchup || "World Cup match").slice(0, 80),
    inputPath,
    promptPath,
    resultPath,
    createdAt: new Date().toISOString(),
  };

  const metadataJson = `${JSON.stringify(metadata, null, 2)}\n`;
  await Promise.all([
    writeFile(inputPath, image.bytes, { mode: 0o600 }),
    writeFile(promptPath, `${prompt}\n`, { encoding: "utf8", mode: 0o600 }),
    writeFile(path.join(JOB_DIR, `job-${id}.json`), metadataJson, { encoding: "utf8", mode: 0o600 }),
    writeFile(path.join(JOB_DIR, "job.json"), metadataJson, { encoding: "utf8", mode: 0o600 }),
  ]);

  return NextResponse.json(metadata);
}

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  if (searchParams.get("preflight") === "1") {
    const country = getCountry(String(searchParams.get("countryCode") || ""));
    if (process.env.VERCEL || !country) {
      return NextResponse.json(
        {
          ready: false,
          message: process.env.VERCEL
            ? "The local portrait renderer is not connected."
            : "That team is not ready for portraits.",
        },
        { status: 409, headers: { "Cache-Control": "no-store" } }
      );
    }
    try {
      await ensureJobDir();
      return NextResponse.json(
        {
          ready: true,
          countryCode: country.code,
          maxDeliveryMs: 45_000,
          checkedAt: new Date().toISOString(),
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    } catch {
      return NextResponse.json(
        { ready: false, message: "The portrait workspace is not writable." },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
  }
  const requestedId = searchParams.get("id");
  const metadataOnly = searchParams.get("meta") === "1";
  const metadata = await readMetadata(requestedId);
  if (!metadata) {
    if (!requestedId) return NextResponse.json({ status: "empty" });
    return NextResponse.json(
      { status: "stale", id: requestedId },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }
  const result = await findResult(metadata);
  if (!result) {
    return NextResponse.json(metadata, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    {
      ...metadata,
      status: "complete",
      resultPath: path.join(JOB_DIR, result.fileName),
      resultRevision: result.resultRevision,
      ...(metadataOnly
        ? {}
        : { imageBase64: `data:${mimeFor(result.fileName)};base64,${result.bytes.toString("base64")}` }),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
