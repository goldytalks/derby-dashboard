import type { CountryTheme } from "@/lib/prompts";

const OUTPUT_SIZE = 1400;

export type PortraitSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

interface NormalizedOpening {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface HostedTemplate {
  paths: readonly string[];
  opening: NormalizedOpening;
}

/**
 * The generated artwork contains a deliberately black face opening. These
 * measured bounds keep the captured person aligned with each unique costume,
 * rather than relying on a generic center crop.
 */
const HOSTED_TEMPLATES: Readonly<Record<string, HostedTemplate>> = {
  ALA: template("ala", [0.3964, 0.3421, 0.6043, 0.6307]),
  ARG: template("arg", [0.335, 0.1564, 0.66, 0.585]),
  BEL: template("bel", [0.36, 0.1979, 0.65, 0.6621]),
  CLEM: template("clem", [0.4007, 0.3286, 0.6007, 0.6129]),
  ENG: template("eng", [0.3036, 0.2286, 0.6779, 0.6729]),
  ESP: template("esp", [0.3507, 0.2636, 0.6493, 0.645]),
  FAU: template("fau", [0.3393, 0.2664, 0.6657, 0.7264]),
  FRA: template("fra", [0.345, 0.2386, 0.6386, 0.5993]),
  LSU: template("lsu", [0.3957, 0.2607, 0.605, 0.5971]),
  MAR: template("mar", [0.3671, 0.145, 0.6336, 0.5336]),
  NOR: template("nor", [0.3193, 0.245, 0.6821, 0.73]),
  SJSU: template("sjsu", [0.3807, 0.2557, 0.6214, 0.5664]),
  SUI: template("sui", [0.3964, 0.1864, 0.6021, 0.4443]),
  TSU: template("tsu", [0.3314, 0.2686, 0.6693, 0.7157]),
  UF: template("uf", [0.3621, 0.2907, 0.6357, 0.6436]),
  UGA: template("uga", [0.39, 0.335, 0.6121, 0.6271]),
  USC: template("usc", [0.4029, 0.3279, 0.5971, 0.6121]),
  // East Carolina uses a distinct booth code so Ecuador can continue to use ECU.
  // The second path keeps older hosted bundles compatible during the rename.
  ECAR: {
    paths: ["/templates/hosted/ecar.webp", "/templates/hosted/ecu.webp"],
    opening: opening([0.3643, 0.3136, 0.6336, 0.6829]),
  },
};

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function opening(values: readonly [number, number, number, number]): NormalizedOpening {
  return { left: values[0], top: values[1], right: values[2], bottom: values[3] };
}

function template(
  code: string,
  values: readonly [number, number, number, number]
): HostedTemplate {
  return {
    paths: [`/templates/hosted/${code}.webp`],
    opening: opening(values),
  };
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

function sourceDimensions(source: PortraitSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return {
      width: source.naturalWidth || source.width,
      height: source.naturalHeight || source.height,
    };
  }
  return { width: source.width, height: source.height };
}

function createCanvas(width = OUTPUT_SIZE, height = OUTPUT_SIZE): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("portrait_renderer_requires_browser");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function loadImage(path: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(path);
  if (cached) return cached;

  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error(`portrait_template_empty:${path}`));
        return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`portrait_template_unavailable:${path}`));
    image.src = path;
  });

  imageCache.set(path, request);
  request.catch(() => imageCache.delete(path));
  return request;
}

async function loadFirstAvailable(paths: readonly string[]): Promise<HTMLImageElement | null> {
  for (const path of paths) {
    try {
      return await loadImage(path);
    } catch {
      // Try the compatibility path, then fall through to the procedural costume.
    }
  }
  return null;
}

function drawImageCover(
  context: CanvasRenderingContext2D,
  source: PortraitSource,
  destination: { x: number; y: number; width: number; height: number },
  crop: { top: number; height: number }
) {
  const dimensions = sourceDimensions(source);
  if (!dimensions.width || !dimensions.height) throw new Error("portrait_source_empty");

  const targetAspect = destination.width / destination.height;
  let sourceHeight = dimensions.height * crop.height;
  let sourceWidth = sourceHeight * targetAspect;
  if (sourceWidth > dimensions.width) {
    sourceWidth = dimensions.width;
    sourceHeight = sourceWidth / targetAspect;
  }

  const sourceX = Math.max(0, (dimensions.width - sourceWidth) / 2);
  const desiredY = dimensions.height * crop.top;
  const sourceY = Math.min(Math.max(0, desiredY), dimensions.height - sourceHeight);

  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    destination.x,
    destination.y,
    destination.width,
    destination.height
  );
}

function drawSoftEllipseMask(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  radiusX: number,
  radiusY: number
) {
  context.save();
  context.translate(centerX, centerY);
  context.scale(radiusX, radiusY);
  const feather = context.createRadialGradient(0, 0, 0.78, 0, 0, 1);
  feather.addColorStop(0, "rgba(0,0,0,1)");
  feather.addColorStop(0.9, "rgba(0,0,0,0.98)");
  feather.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = feather;
  context.beginPath();
  context.arc(0, 0, 1, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawCapturedFace(
  output: CanvasRenderingContext2D,
  source: PortraitSource,
  faceOpening: NormalizedOpening
) {
  const faceLayer = createCanvas();
  const faceContext = faceLayer.getContext("2d");
  if (!faceContext) throw new Error("portrait_renderer_unavailable");

  // Keep a narrow black reveal around the artwork so costume edges stay crisp.
  const edgeInset = OUTPUT_SIZE * 0.0025;
  const x = faceOpening.left * OUTPUT_SIZE + edgeInset;
  const y = faceOpening.top * OUTPUT_SIZE + edgeInset;
  const width = (faceOpening.right - faceOpening.left) * OUTPUT_SIZE - edgeInset * 2;
  const height = (faceOpening.bottom - faceOpening.top) * OUTPUT_SIZE - edgeInset * 2;

  const dimensions = sourceDimensions(source);
  const portraitInput = dimensions.height > dimensions.width * 1.08;
  // The capture UI asks the fan to fill its oval guide. A deliberately tight
  // crop makes their face — rather than the room behind them — fill the costume
  // opening, while retaining just enough shoulder for a natural neckline.
  const crop = portraitInput
    ? { top: 0.055, height: 0.56 }
    : { top: 0.08, height: 0.62 };

  faceContext.save();
  faceContext.filter = "contrast(1.035) saturate(0.94) brightness(0.98)";
  drawImageCover(faceContext, source, { x, y, width, height }, crop);
  faceContext.restore();

  // A subtle, transparent grade seats a webcam capture inside the painted scene
  // without changing the person's facial features.
  faceContext.globalCompositeOperation = "source-atop";
  const grade = faceContext.createLinearGradient(x, y, x, y + height);
  grade.addColorStop(0, "rgba(255,224,183,0.035)");
  grade.addColorStop(1, "rgba(32,16,10,0.075)");
  faceContext.fillStyle = grade;
  faceContext.fillRect(x, y, width, height);

  faceContext.globalCompositeOperation = "destination-in";
  drawSoftEllipseMask(
    faceContext,
    x + width / 2,
    y + height / 2,
    width / 2,
    height / 2
  );
  faceContext.globalCompositeOperation = "source-over";
  output.drawImage(faceLayer, 0, 0);
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.arcTo(x + width, y, x + width, y + height, safeRadius);
  context.arcTo(x + width, y + height, x, y + height, safeRadius);
  context.arcTo(x, y + height, x, y, safeRadius);
  context.arcTo(x, y, x + width, y, safeRadius);
  context.closePath();
}

function drawFallbackCostume(
  context: CanvasRenderingContext2D,
  source: PortraitSource,
  theme: CountryTheme
) {
  const backdrop = context.createLinearGradient(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  backdrop.addColorStop(0, theme.bg);
  backdrop.addColorStop(0.58, "#090b12");
  backdrop.addColorStop(1, theme.accent);
  context.fillStyle = backdrop;
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);

  // Portrait medallion. It is intentionally inset and framed so even an unknown
  // future team still produces a transformed result, never a camera pass-through.
  const portrait = { x: 330, y: 128, width: 740, height: 790 };
  context.save();
  roundedRectPath(context, portrait.x, portrait.y, portrait.width, portrait.height, 330);
  context.clip();
  context.filter = "contrast(1.04) saturate(0.92)";
  drawImageCover(context, source, portrait, { top: 0.035, height: 0.88 });
  context.restore();

  context.strokeStyle = theme.accent;
  context.lineWidth = 34;
  roundedRectPath(context, portrait.x, portrait.y, portrait.width, portrait.height, 330);
  context.stroke();
  context.strokeStyle = "rgba(244,239,226,0.72)";
  context.lineWidth = 8;
  roundedRectPath(context, portrait.x + 20, portrait.y + 20, portrait.width - 40, portrait.height - 40, 310);
  context.stroke();

  // Bold shoulders and lapels make the output read as a costume portrait.
  context.fillStyle = theme.bg;
  context.beginPath();
  context.moveTo(0, 1020);
  context.quadraticCurveTo(260, 820, 510, 900);
  context.lineTo(650, OUTPUT_SIZE);
  context.lineTo(0, OUTPUT_SIZE);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(OUTPUT_SIZE, 1020);
  context.quadraticCurveTo(1140, 820, 890, 900);
  context.lineTo(750, OUTPUT_SIZE);
  context.lineTo(OUTPUT_SIZE, OUTPUT_SIZE);
  context.closePath();
  context.fill();
  context.strokeStyle = theme.accent;
  context.lineWidth = 22;
  context.beginPath();
  context.moveTo(420, 900);
  context.lineTo(700, 1370);
  context.lineTo(980, 900);
  context.stroke();

  context.font = "112px Apple Color Emoji, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(theme.flag, 1170, 180);

  const vignette = context.createRadialGradient(700, 550, 320, 700, 700, 980);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.38)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
}

/** Return whether a calibrated, team-specific hosted costume is available. */
export function hasHostedPortraitTemplate(code: string): boolean {
  return Boolean(HOSTED_TEMPLATES[normalizeCode(code)]);
}

/**
 * Warm the artwork cache before opening the camera. A false result is safe: the
 * compositor will use its non-pass-through costume fallback.
 */
export async function preloadHostedPortraitTemplate(code: string): Promise<boolean> {
  const hosted = HOSTED_TEMPLATES[normalizeCode(code)];
  if (!hosted || typeof window === "undefined") return false;
  return Boolean(await loadFirstAvailable(hosted.paths));
}

/**
 * Compose the captured person into the calibrated opening of the selected team
 * artwork. This is local browser rendering, so it works on a static deployment
 * without provider credentials and completes independently of an AI request.
 */
export async function createGuaranteedPortrait(
  source: PortraitSource,
  theme: CountryTheme
): Promise<string> {
  if (typeof document === "undefined") {
    throw new Error("portrait_renderer_requires_browser");
  }
  const dimensions = sourceDimensions(source);
  if (dimensions.width < 2 || dimensions.height < 2) {
    throw new Error("portrait_source_empty");
  }

  const canvas = createCanvas();
  const context = canvas.getContext("2d");
  if (!context) throw new Error("portrait_renderer_unavailable");

  const hosted = HOSTED_TEMPLATES[normalizeCode(theme.code)];
  const artwork = hosted ? await loadFirstAvailable(hosted.paths) : null;

  if (hosted && artwork) {
    context.drawImage(artwork, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    drawCapturedFace(context, source, hosted.opening);

    const finish = context.createLinearGradient(0, 0, 0, OUTPUT_SIZE);
    finish.addColorStop(0, "rgba(255,233,198,0.018)");
    finish.addColorStop(1, "rgba(6,8,12,0.055)");
    context.fillStyle = finish;
    context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  } else {
    drawFallbackCostume(context, source, theme);
  }

  return canvas.toDataURL("image/jpeg", 0.94);
}
