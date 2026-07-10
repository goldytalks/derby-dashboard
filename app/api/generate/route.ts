import OpenAI, { toFile } from "openai";
import { NextResponse } from "next/server";
import { buildPrompt, getCountry, type CountryTheme } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png"]);
const OPENAI_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-2";
const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image";

type AiProvider = "auto" | "openai" | "gemini" | "mock";

interface GeneratePayload {
  imageBase64?: string;
  countryCode?: string;
  format?: string;
  provider?: AiProvider;
}

interface ParsedImage {
  mime: string;
  data: string;
  bytes: Buffer;
}

interface GeneratedPortrait {
  imageBase64: string;
  provider: "openai" | "gemini" | "mock";
  model: string;
  mock?: boolean;
}

const AI_PROVIDERS: AiProvider[] = ["auto", "openai", "gemini", "mock"];

function parseDataUrl(input: string): ParsedImage | null {
  const match = /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(input);
  if (!match) return null;
  const mime = match[1].toLowerCase();
  const data = match[2];
  if (!ALLOWED_MIMES.has(mime) || !/^[a-z0-9+/]+={0,2}$/i.test(data)) return null;
  return { mime, data, bytes: Buffer.from(data, "base64") };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveProvider(requested?: AiProvider): GeneratedPortrait["provider"] {
  const configured = requested || (process.env.AI_IMAGE_PROVIDER as AiProvider) || "auto";
  if (configured === "openai") return process.env.OPENAI_API_KEY ? "openai" : "mock";
  if (configured === "gemini") return process.env.GEMINI_API_KEY ? "gemini" : "mock";
  if (configured === "mock") return "mock";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.GEMINI_API_KEY) return "gemini";
  return "mock";
}

function checkedOutput(data: string, mime: string, provider: "openai" | "gemini", model: string): GeneratedPortrait {
  if (!ALLOWED_MIMES.has(mime)) throw new Error("unsupported_output");
  if (Buffer.byteLength(data, "base64") > MAX_BYTES) throw new Error("output_too_large");
  return {
    imageBase64: `data:${mime};base64,${data}`,
    provider,
    model,
  };
}

function openAiQuality(): "low" | "medium" | "high" | "auto" {
  const value = process.env.OPENAI_IMAGE_QUALITY;
  return value === "low" || value === "high" || value === "auto" ? value : "medium";
}

async function generateWithOpenAI(image: ParsedImage, country: CountryTheme): Promise<GeneratedPortrait> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const extension = image.mime === "image/png" ? "png" : "jpg";
  const response = await client.images.edit({
    model: OPENAI_MODEL,
    image: await toFile(image.bytes, `booth-selfie.${extension}`, { type: image.mime }),
    prompt: buildPrompt(country),
    size: "1024x1536",
    quality: openAiQuality(),
    background: "opaque",
    output_format: "jpeg",
    output_compression: 82,
    n: 1,
  });
  const data = response.data?.[0]?.b64_json;
  if (!data) throw new Error("no_image");
  return checkedOutput(data, "image/jpeg", "openai", OPENAI_MODEL);
}

async function generateWithGemini(image: ParsedImage, country: CountryTheme): Promise<GeneratedPortrait> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY || "",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: buildPrompt(country) },
              {
                inline_data: {
                  mime_type: image.mime,
                  data: image.data,
                },
              },
            ],
          },
        ],
        generationConfig: {
          responseModalities: ["IMAGE"],
          responseFormat: {
            image: { aspectRatio: "2:3", imageSize: "1K" },
          },
        },
      }),
    }
  );
  if (!response.ok) throw new Error(`gemini_${response.status}`);
  const result = (await response.json()) as {
    promptFeedback?: { blockReason?: string };
    candidates?: Array<{
      finishReason?: string;
      content?: { parts?: Array<{ inlineData?: { mimeType?: string; data?: string } }> };
    }>;
  };
  const candidate = result.candidates?.[0];
  const imagePart = candidate?.content?.parts?.find((part) => part.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    const blocked =
      Boolean(result.promptFeedback?.blockReason) ||
      ["SAFETY", "IMAGE_SAFETY", "PROHIBITED_CONTENT"].includes(candidate?.finishReason || "");
    throw new Error(blocked ? "moderation_blocked" : "no_image");
  }
  return checkedOutput(
    imagePart.inlineData.data,
    imagePart.inlineData.mimeType || "image/png",
    "gemini",
    GEMINI_MODEL
  );
}

export async function POST(request: Request) {
  let payload: GeneratePayload;
  try {
    payload = (await request.json()) as GeneratePayload;
  } catch {
    return NextResponse.json(
      { error: "bad_request", message: "Send JSON with an imageBase64 field." },
      { status: 400 }
    );
  }

  if (!payload.imageBase64 || typeof payload.imageBase64 !== "string") {
    return NextResponse.json(
      { error: "bad_request", message: "Missing imageBase64." },
      { status: 400 }
    );
  }
  const image = parseDataUrl(payload.imageBase64);
  if (!image) {
    return NextResponse.json(
      { error: "bad_image", message: "Photos must be valid JPEG or PNG files." },
      { status: 400 }
    );
  }
  if (image.bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "too_large", message: "That photo is too large for the booth. Try a smaller one." },
      { status: 413 }
    );
  }
  if (payload.format && !["portrait", "story", "square"].includes(payload.format)) {
    return NextResponse.json(
      { error: "bad_format", message: "Choose a supported card format." },
      { status: 400 }
    );
  }
  const country = getCountry(String(payload.countryCode || ""));
  if (!country) {
    return NextResponse.json(
      { error: "bad_country", message: "Unknown team code." },
      { status: 400 }
    );
  }

  if (payload.provider && !AI_PROVIDERS.includes(payload.provider)) {
    return NextResponse.json(
      { error: "bad_provider", message: "Choose Auto, OpenAI, Gemini, or Mock." },
      { status: 400 }
    );
  }
  if (payload.provider === "openai" && !process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      {
        error: "missing_key",
        message: "OpenAI is not configured. Set OPENAI_API_KEY, then try the live edit again.",
        provider: "openai",
      },
      { status: 503 }
    );
  }
  if (payload.provider === "gemini" && !process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      {
        error: "missing_key",
        message: "Gemini is not configured. Set GEMINI_API_KEY, then try the live edit again.",
        provider: "gemini",
      },
      { status: 503 }
    );
  }

  const provider = resolveProvider(payload.provider);
  if (provider === "mock") {
    await sleep(1200);
    return NextResponse.json({
      imageBase64: payload.imageBase64,
      provider: "mock",
      model: "local-pass-through",
      mock: true,
    } satisfies GeneratedPortrait);
  }

  try {
    const result =
      provider === "openai"
        ? await generateWithOpenAI(image, country)
        : await generateWithGemini(image, country);
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "upstream";
    const moderated = code === "moderation_blocked" || code === "no_image";
    return NextResponse.json(
      {
        error: moderated ? "refused" : "upstream",
        message: moderated
          ? "The stylist passed on that photo. Try a clear, front-facing shot."
          : "The stylist is busy. Give it another run.",
        provider,
      },
      { status: moderated ? 422 : 502 }
    );
  }
}
