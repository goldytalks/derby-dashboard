import { NextResponse } from "next/server";
import { buildPrompt, getCountry } from "@/lib/prompts";

export const runtime = "nodejs";
export const maxDuration = 30;

// Everything here stays in memory for the life of the request and then
// falls out of scope. Nothing is written to disk or any store.

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = new Set(["image/jpeg", "image/png"]);
const GEMINI_MODEL = "gemini-2.5-flash-image";

interface GeneratePayload {
  imageBase64?: string;
  countryCode?: string;
  format?: string;
}

function parseDataUrl(
  input: string
): { mime: string; data: string } | null {
  const match = /^data:([a-z0-9/+.-]+);base64,(.+)$/i.exec(input);
  if (!match) return null;
  return { mime: match[1].toLowerCase(), data: match[2] };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  const { imageBase64, countryCode } = payload;
  if (!imageBase64 || typeof imageBase64 !== "string") {
    return NextResponse.json(
      { error: "bad_request", message: "Missing imageBase64." },
      { status: 400 }
    );
  }

  const parsed = parseDataUrl(imageBase64);
  if (!parsed || !ALLOWED_MIMES.has(parsed.mime)) {
    return NextResponse.json(
      {
        error: "bad_mime",
        message: "Photos must be JPEG or PNG.",
      },
      { status: 400 }
    );
  }

  // Base64 expands bytes by 4/3, so length * 0.75 approximates raw size.
  if (parsed.data.length * 0.75 > MAX_BYTES) {
    return NextResponse.json(
      {
        error: "too_large",
        message: "That photo is over 8MB. Try a smaller one.",
      },
      { status: 413 }
    );
  }

  const country = getCountry(String(countryCode || ""));
  if (!country) {
    return NextResponse.json(
      { error: "bad_country", message: "Unknown country code." },
      { status: 400 }
    );
  }

  const apiKey = process.env.GEMINI_API_KEY;

  // MOCK MODE: no key configured. Wait a beat and echo the photo back
  // so the whole booth is demoable with zero env vars.
  if (!apiKey) {
    await sleep(2000);
    return NextResponse.json({ imageBase64, mock: true });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: parsed.mime,
                    data: parsed.data,
                  },
                },
                { text: buildPrompt(country) },
              ],
            },
          ],
        }),
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        {
          error: "upstream",
          message: "The stylist is busy. Give it another run.",
        },
        { status: 502 }
      );
    }

    const result = (await response.json()) as {
      promptFeedback?: { blockReason?: string };
      candidates?: Array<{
        finishReason?: string;
        content?: {
          parts?: Array<{
            inlineData?: { mimeType?: string; data?: string };
          }>;
        };
      }>;
    };

    const candidate = result.candidates?.[0];
    const imagePart = candidate?.content?.parts?.find(
      (part) => part.inlineData?.data
    );

    if (!imagePart?.inlineData?.data) {
      const blocked =
        Boolean(result.promptFeedback?.blockReason) ||
        candidate?.finishReason === "SAFETY" ||
        candidate?.finishReason === "IMAGE_SAFETY" ||
        candidate?.finishReason === "PROHIBITED_CONTENT";
      return NextResponse.json(
        {
          error: blocked ? "refused" : "no_image",
          message:
            "The stylist passed on that one. Try a clearer photo with your face front and center.",
        },
        { status: 422 }
      );
    }

    const mime = imagePart.inlineData.mimeType || "image/png";
    return NextResponse.json({
      imageBase64: `data:${mime};base64,${imagePart.inlineData.data}`,
    });
  } catch {
    return NextResponse.json(
      {
        error: "upstream",
        message: "The stylist is busy. Give it another run.",
      },
      { status: 502 }
    );
  }
}
