export type MotionSource = HTMLCanvasElement | HTMLImageElement | ImageBitmap;

export interface MotionClipOptions {
  /** Clip length. Defaults to 4.5 seconds and is constrained to 4-5 seconds. */
  durationMs?: number;
  /** Square export dimension. Defaults to 1080. */
  size?: number;
  /** Frames per second. Defaults to 30. */
  fps?: number;
  /** Optional colors used for the small edge sparks. */
  accentColors?: readonly string[];
  /** Lets the caller cancel an in-progress optional render. */
  signal?: AbortSignal;
}

export interface MotionClip {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
  durationMs: number;
  width: number;
  height: number;
}

const MIME_CANDIDATES = [
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
  "video/mp4;codecs=h264",
] as const;

interface Spark {
  x: number;
  y: number;
  radius: number;
  phase: number;
  color: string;
}

function preferredMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  if (typeof MediaRecorder.isTypeSupported !== "function") return "video/webm";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}

function sourceDimensions(source: MotionSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

function drawCover(
  context: CanvasRenderingContext2D,
  source: MotionSource,
  size: number,
  scale: number,
  offsetX: number,
  offsetY: number
) {
  const sourceSize = sourceDimensions(source);
  const baseScale = Math.max(size / sourceSize.width, size / sourceSize.height);
  const width = sourceSize.width * baseScale * scale;
  const height = sourceSize.height * baseScale * scale;
  context.drawImage(
    source,
    (size - width) / 2 + offsetX,
    (size - height) / 2 + offsetY,
    width,
    height
  );
}

function makeSparks(size: number, colors: readonly string[]): Spark[] {
  const fallbackColors = ["#1CA3F5", "#F4F1E9", "#D3AA52"];
  const palette = colors.length ? colors : fallbackColors;
  return Array.from({ length: 18 }, (_, index) => {
    const side = index % 2 === 0 ? 1 : -1;
    return {
      x: side > 0 ? size * (0.78 + (index % 5) * 0.035) : size * (0.22 - (index % 5) * 0.035),
      y: size * (0.12 + ((index * 37) % 76) / 100),
      radius: size * (0.0025 + (index % 4) * 0.0012),
      phase: (index / 18) * Math.PI * 2,
      color: palette[index % palette.length],
    };
  });
}

function drawFrame(
  context: CanvasRenderingContext2D,
  source: MotionSource,
  size: number,
  progress: number,
  sparks: readonly Spark[],
  reducedMotion: boolean
) {
  context.clearRect(0, 0, size, size);

  const pulse = reducedMotion ? 0 : Math.sin(progress * Math.PI);
  const scale = 1.012 + pulse * 0.024;
  const offsetX = reducedMotion ? 0 : Math.sin(progress * Math.PI * 2) * size * 0.006;
  const offsetY = reducedMotion ? 0 : Math.cos(progress * Math.PI * 2) * size * 0.004;
  drawCover(context, source, size, scale, offsetX, offsetY);

  // A restrained gallery-light sweep adds motion without hiding the slip copy.
  if (!reducedMotion) {
    const sweepX = -size * 0.55 + progress * size * 2.1;
    const light = context.createLinearGradient(sweepX, 0, sweepX + size * 0.34, size);
    light.addColorStop(0, "rgba(255,255,255,0)");
    light.addColorStop(0.48, "rgba(255,244,221,0.095)");
    light.addColorStop(0.52, "rgba(255,255,255,0.13)");
    light.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = light;
    context.fillRect(0, 0, size, size);
  }

  for (const spark of sparks) {
    const opacity = reducedMotion
      ? 0.24
      : Math.max(0, Math.sin(progress * Math.PI * 4 + spark.phase)) * 0.72;
    context.globalAlpha = opacity;
    context.fillStyle = spark.color;
    context.beginPath();
    context.arc(spark.x, spark.y, spark.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;

  const vignette = context.createRadialGradient(size / 2, size / 2, size * 0.34, size / 2, size / 2, size * 0.74);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.14)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, size, size);
}

/** Browser capability check for showing or hiding the optional motion action. */
export function supportsMotionExport(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function" &&
    preferredMimeType() !== null
  );
}

/**
 * Build a short square video from an already-finished slip. Call this only from
 * the optional result action; the still result does not wait for this render.
 */
export async function createMotionClip(
  source: MotionSource,
  options: MotionClipOptions = {}
): Promise<MotionClip> {
  if (!supportsMotionExport()) throw new Error("motion_export_unsupported");
  if (options.signal?.aborted) throw new DOMException("Motion export cancelled", "AbortError");

  const dimensions = sourceDimensions(source);
  if (!dimensions.width || !dimensions.height) throw new Error("motion_source_empty");

  const size = Math.max(480, Math.min(1440, Math.round(options.size ?? 1080)));
  const durationMs = Math.max(4000, Math.min(5000, Math.round(options.durationMs ?? 4500)));
  const fps = Math.max(20, Math.min(60, Math.round(options.fps ?? 30)));
  const mimeType = preferredMimeType();
  if (!mimeType) throw new Error("motion_export_unsupported");

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("motion_renderer_unavailable");

  const stream = canvas.captureStream(fps);
  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });
  recorder.ondataavailable = (event) => {
    if (event.data.size) chunks.push(event.data);
  };

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const sparks = makeSparks(size, options.accentColors ?? []);
  const startedAt = performance.now();
  let animationFrame = 0;
  let timeout = 0;

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onerror = () => reject(new Error("motion_export_failed"));
    recorder.onstop = () => resolve();
  });

  const stop = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
  const abort = () => stop();
  options.signal?.addEventListener("abort", abort, { once: true });

  const paint = (now: number) => {
    const elapsed = Math.min(durationMs, now - startedAt);
    drawFrame(context, source, size, elapsed / durationMs, sparks, reducedMotion);
    if (elapsed < durationMs && recorder.state !== "inactive") {
      animationFrame = window.requestAnimationFrame(paint);
    }
  };

  drawFrame(context, source, size, 0, sparks, reducedMotion);
  recorder.start(250);
  animationFrame = window.requestAnimationFrame(paint);
  timeout = window.setTimeout(stop, durationMs + 80);

  try {
    await stopped;
  } finally {
    window.cancelAnimationFrame(animationFrame);
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abort);
    stream.getTracks().forEach((track) => track.stop());
  }

  if (options.signal?.aborted) throw new DOMException("Motion export cancelled", "AbortError");
  if (!chunks.length) throw new Error("motion_export_empty");

  return {
    blob: new Blob(chunks, { type: mimeType }),
    mimeType,
    extension: mimeType.startsWith("video/mp4") ? "mp4" : "webm",
    durationMs,
    width: size,
    height: size,
  };
}

/**
 * Compact compatibility API for result components that only need the Blob.
 * `createMotionClip` remains available when the caller also needs the actual
 * browser-selected extension and export metadata.
 */
export async function createMotionSlip(
  source: MotionSource,
  options: { primary?: string; accent?: string; durationMs?: number; signal?: AbortSignal } = {}
): Promise<Blob> {
  const colors = [options.primary, options.accent].filter(
    (color): color is string => Boolean(color)
  );
  const clip = await createMotionClip(source, {
    durationMs: options.durationMs,
    accentColors: colors,
    signal: options.signal,
  });
  return clip.blob;
}

/** Trigger a browser download for a previously-rendered motion clip. */
export function downloadMotionClip(clip: MotionClip, baseName = "novig-motion-slip"): void {
  const url = URL.createObjectURL(clip.blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${baseName}.${clip.extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
