/**
 * Browser-side identity compositor for the full-face costume artwork in
 * `/public/templates/ai`.
 *
 * Unlike the legacy opening compositor, this module starts with a complete AI
 * portrait and replaces only the inner facial features. A tapered, feathered
 * face matte keeps the template's hair, jaw edge, costume, and scene intact,
 * while luminance and colour transfer seat the captured identity in the same
 * light. There is never a black reveal or a hard oval edge.
 */

export type FaceBlendImageSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap
  | OffscreenCanvas;

export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceLandmarks {
  leftEye: NormalizedPoint;
  rightEye: NormalizedPoint;
  nose: NormalizedPoint;
  mouth: NormalizedPoint;
  chin: NormalizedPoint;
}

export interface FaceMaskProfile {
  /** Fraction of the face edge used for the transparent transition. */
  feather: number;
  /** Horizontal width at the forehead relative to the cheeks. */
  foreheadWidth: number;
  /** Horizontal width at the temples relative to the cheeks. */
  templeWidth: number;
  /** Horizontal width at the chin relative to the cheeks. */
  chinWidth: number;
  /** Move the upper edge down to retain more template hair. */
  hairlineInset: number;
}

export interface TeamFaceTarget {
  code: FaceBlendTeamCode;
  templatePath: string;
  /** Skin-feature region in normalized template coordinates. */
  faceRect: NormalizedRect;
  /** Landmark positions in normalized template coordinates. */
  landmarks: FaceLandmarks;
  mask: FaceMaskProfile;
}

export const AI_FACE_TEAM_CODES = [
  "ALA",
  "ARG",
  "BEL",
  "CLEM",
  "ECAR",
  "ENG",
  "ESP",
  "FAU",
  "FRA",
  "LSU",
  "MAR",
  "NOR",
  "SJSU",
  "SUI",
  "TSU",
  "UF",
  "UGA",
  "USC",
] as const;

export type FaceBlendTeamCode = (typeof AI_FACE_TEAM_CODES)[number];

const DEFAULT_MASK: FaceMaskProfile = Object.freeze({
  feather: 0.2,
  foreheadWidth: 0.82,
  templeWidth: 0.98,
  chinWidth: 0.7,
  hairlineInset: 0.06,
});

type Bounds = readonly [left: number, top: number, right: number, bottom: number];

/**
 * Convert a generated head opening into the smaller skin-feature region used
 * for an identity blend. The insets intentionally leave the AI portrait's hair
 * and silhouette untouched.
 */
function target(
  code: FaceBlendTeamCode,
  bounds: Bounds,
  tuning: Partial<FaceMaskProfile> & {
    leftInset?: number;
    rightInset?: number;
    topInset?: number;
    bottomInset?: number;
    eyeY?: number;
    mouthY?: number;
  } = {}
): TeamFaceTarget {
  const [left, top, right, bottom] = bounds;
  const headWidth = right - left;
  const headHeight = bottom - top;
  const leftInset = tuning.leftInset ?? 0.13;
  const rightInset = tuning.rightInset ?? 0.13;
  const topInset = tuning.topInset ?? 0.14;
  const bottomInset = tuning.bottomInset ?? 0.035;
  const faceRect: NormalizedRect = {
    x: left + headWidth * leftInset,
    y: top + headHeight * topInset,
    width: headWidth * (1 - leftInset - rightInset),
    height: headHeight * (1 - topInset - bottomInset),
  };
  const point = (x: number, y: number): NormalizedPoint => ({
    x: faceRect.x + faceRect.width * x,
    y: faceRect.y + faceRect.height * y,
  });

  return Object.freeze({
    code,
    templatePath: `/templates/ai/${code.toLowerCase()}.webp`,
    faceRect: Object.freeze(faceRect),
    landmarks: Object.freeze({
      leftEye: Object.freeze(point(0.34, tuning.eyeY ?? 0.35)),
      rightEye: Object.freeze(point(0.66, tuning.eyeY ?? 0.35)),
      nose: Object.freeze(point(0.5, 0.56)),
      mouth: Object.freeze(point(0.5, tuning.mouthY ?? 0.75)),
      chin: Object.freeze(point(0.5, 0.98)),
    }),
    mask: Object.freeze({
      feather: tuning.feather ?? DEFAULT_MASK.feather,
      foreheadWidth: tuning.foreheadWidth ?? DEFAULT_MASK.foreheadWidth,
      templeWidth: tuning.templeWidth ?? DEFAULT_MASK.templeWidth,
      chinWidth: tuning.chinWidth ?? DEFAULT_MASK.chinWidth,
      hairlineInset: tuning.hairlineInset ?? DEFAULT_MASK.hairlineInset,
    }),
  });
}

function measuredTarget(
  code: FaceBlendTeamCode,
  rect: readonly [x: number, y: number, width: number, height: number],
  tuning: Partial<FaceMaskProfile> & { eyeY?: number; mouthY?: number } = {}
): TeamFaceTarget {
  return target(
    code,
    [rect[0], rect[1], rect[0] + rect[2], rect[1] + rect[3]],
    {
      ...tuning,
      leftInset: 0,
      rightInset: 0,
      topInset: 0,
      bottomInset: 0,
    }
  );
}

/**
 * Face boxes measured from the actual 1400-square AI artworks for the eight
 * tournament sides and ten college teams. The coordinates are normalized, so
 * the same mapping works at preview and export resolution. Callers may supply a
 * measured override for regenerated artwork without changing the algorithm.
 */
export const AI_FACE_TARGETS: Readonly<Record<FaceBlendTeamCode, TeamFaceTarget>> =
  Object.freeze({
    ALA: measuredTarget("ALA", [0.4377, 0.2046, 0.1277, 0.1277], { feather: 0.22 }),
    ARG: measuredTarget("ARG", [0.403, 0.2805, 0.1787, 0.1786]),
    BEL: measuredTarget("BEL", [0.4452, 0.0917, 0.1379, 0.1379], { chinWidth: 0.67 }),
    CLEM: measuredTarget("CLEM", [0.3587, 0.1849, 0.281, 0.2809], { feather: 0.22 }),
    ECAR: measuredTarget("ECAR", [0.4031, 0.1443, 0.208, 0.208]),
    ENG: measuredTarget("ENG", [0.415, 0.2135, 0.1715, 0.1715]),
    ESP: measuredTarget("ESP", [0.4059, 0.1435, 0.1796, 0.1796]),
    FAU: measuredTarget("FAU", [0.3536, 0.2176, 0.2689, 0.2688]),
    FRA: measuredTarget("FRA", [0.4002, 0.2268, 0.2307, 0.2306]),
    LSU: measuredTarget("LSU", [0.4072, 0.1939, 0.2095, 0.2095], { feather: 0.22 }),
    MAR: measuredTarget("MAR", [0.4222, 0.0861, 0.1735, 0.1734]),
    NOR: measuredTarget("NOR", [0.4091, 0.1554, 0.1861, 0.1861]),
    SJSU: measuredTarget("SJSU", [0.4041, 0.1304, 0.1789, 0.179], { feather: 0.22 }),
    SUI: measuredTarget("SUI", [0.414, 0.1474, 0.1793, 0.1793], { feather: 0.22 }),
    TSU: measuredTarget("TSU", [0.3851, 0.2253, 0.2348, 0.2347]),
    UF: measuredTarget("UF", [0.3873, 0.1758, 0.2334, 0.2334]),
    UGA: measuredTarget("UGA", [0.3879, 0.1007, 0.212, 0.212], { feather: 0.22 }),
    USC: measuredTarget("USC", [0.3663, 0.1595, 0.2756, 0.2757], { feather: 0.22 }),
  });

export interface ColorStatistics {
  mean: readonly [number, number, number];
  deviation: readonly [number, number, number];
  luminanceMean: number;
  luminanceDeviation: number;
  weight: number;
}

export interface FaceColorMatchSettings {
  /** 0 keeps capture lighting; 1 fully matches the template's mean luminance. */
  luminance: number;
  /** 0 keeps capture colour; 1 fully adopts the template's ambient colour. */
  color: number;
  /** Strength of local, low-frequency template light transferred to the face. */
  localLighting: number;
}

export interface FaceBlendOptions {
  outputSize?: number;
  /** A canvas/image override is useful for deterministic browser tests. */
  templateSource?: FaceBlendImageSource;
  templateUrl?: string;
  /** Normalized captured-face rectangle. Defaults to the camera's guide. */
  sourceFaceRect?: NormalizedRect;
  sourceLandmarks?: FaceLandmarks;
  /** Disable only for deterministic tests; native detection is best-effort. */
  detectSourceFace?: boolean;
  /** Override when a regenerated team artwork has new measured geometry. */
  target?: TeamFaceTarget;
  colorMatch?: Partial<FaceColorMatchSettings>;
  outputType?: "image/png" | "image/jpeg" | "image/webp";
  quality?: number;
}

export interface FaceBlendDiagnostics {
  source: ColorStatistics;
  target: ColorStatistics;
  maskCoverage: number;
  rotationRadians: number;
}

export interface FaceBlendResult {
  canvas: HTMLCanvasElement;
  dataUrl: string;
  code: FaceBlendTeamCode;
  templateUrl: string;
  sourceFaceRect: NormalizedRect;
  targetFaceRect: NormalizedRect;
  diagnostics: FaceBlendDiagnostics;
}

const DEFAULT_SOURCE_FACE: Readonly<NormalizedRect> = Object.freeze({
  // Last-resort crop calibrated to the booth's centered camera guide. Real
  // captures use MediaPipe below; this only runs when both browser detectors
  // genuinely fail or the fixture intentionally supplies no detectable face.
  x: 0.24,
  y: 0.24,
  width: 0.52,
  height: 0.64,
});

const DEFAULT_COLOR_MATCH: Readonly<FaceColorMatchSettings> = Object.freeze({
  luminance: 0.92,
  color: 0.38,
  localLighting: 0.42,
});

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function mix(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const position = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return position * position * (3 - 2 * position);
}

function normalizedCode(code: string): FaceBlendTeamCode | null {
  const normalized = code.trim().toUpperCase();
  return (AI_FACE_TEAM_CODES as readonly string[]).includes(normalized)
    ? (normalized as FaceBlendTeamCode)
    : null;
}

function clampRect(rect: NormalizedRect): NormalizedRect {
  const x = clamp(rect.x, 0, 0.999);
  const y = clamp(rect.y, 0, 0.999);
  return {
    x,
    y,
    width: clamp(rect.width, 0.001, 1 - x),
    height: clamp(rect.height, 0.001, 1 - y),
  };
}

function dimensions(source: FaceBlendImageSource): { width: number; height: number } {
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  }
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { width: source.videoWidth || source.width, height: source.videoHeight || source.height };
  }
  return { width: source.width, height: source.height };
}

function canvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") throw new Error("face_blend_requires_browser");
  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  return output;
}

function context2d(targetCanvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = targetCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("face_blend_canvas_unavailable");
  return context;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) return cached;
  if (typeof Image === "undefined") return Promise.reject(new Error("face_blend_requires_browser"));

  const request = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error(`face_blend_template_empty:${url}`));
        return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error(`face_blend_template_unavailable:${url}`));
    image.src = url;
  });
  imageCache.set(url, request);
  request.catch(() => imageCache.delete(url));
  return request;
}

function drawCover(
  output: CanvasRenderingContext2D,
  source: FaceBlendImageSource,
  width: number,
  height: number
): void {
  const size = dimensions(source);
  if (size.width < 2 || size.height < 2) throw new Error("face_blend_source_empty");
  const scale = Math.max(width / size.width, height / size.height);
  const drawWidth = size.width * scale;
  const drawHeight = size.height * scale;
  output.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function eyeAngle(landmarks: FaceLandmarks): number {
  return Math.atan2(
    landmarks.rightEye.y - landmarks.leftEye.y,
    landmarks.rightEye.x - landmarks.leftEye.x
  );
}

interface NativeDetectedFace {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

interface NativeFaceDetector {
  detect(source: CanvasImageSource): Promise<NativeDetectedFace[]>;
}

type NativeFaceDetectorConstructor = new (options?: {
  fastMode?: boolean;
  maxDetectedFaces?: number;
}) => NativeFaceDetector;

interface MediaPipeDetection {
  boundingBox?: {
    originX: number;
    originY: number;
    width: number;
    height: number;
  };
  keypoints?: Array<{
    x: number;
    y: number;
    label?: string;
    score?: number;
  }>;
}

interface MediaPipeFaceDetector {
  detect(source: CanvasImageSource): {
    detections: MediaPipeDetection[];
  };
}

const MEDIAPIPE_ASSET_BASE = "/mediapipe";
const MEDIAPIPE_MODEL_PATH = `${MEDIAPIPE_ASSET_BASE}/blaze_face_short_range.tflite`;
const MEDIAPIPE_MAX_INPUT_EDGE = 960;
let mediaPipeDetectorPromise: Promise<MediaPipeFaceDetector | null> | null = null;

/**
 * Load the official detector only when a shutter capture needs it. Both the
 * model and the SIMD WASM runtime live under `/public/mediapipe`, so the
 * captured face never leaves this browser and the booth's initial bundle does
 * not pay the detector cost.
 */
async function getMediaPipeFaceDetector(): Promise<MediaPipeFaceDetector | null> {
  if (typeof window === "undefined") return null;
  if (mediaPipeDetectorPromise) return mediaPipeDetectorPromise;

  mediaPipeDetectorPromise = import("@mediapipe/tasks-vision")
    .then(async ({ FaceDetector, FilesetResolver }) => {
      // tasks-vision 0.10.35 injects its loader as a classic script. Its ES
      // module loader contains `import.meta` and fails in that context, so use
      // the official SIMD classic pair that FilesetResolver supports here.
      const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_ASSET_BASE, false);
      // Emscripten emits this successful CPU-delegate status through
      // `console.error`. Suppress only that exact, non-error status during
      // initialization; every genuine initialization error still surfaces.
      const originalError = console.error;
      console.error = (...messages: unknown[]) => {
        const rendered = messages.map(String).join(" ");
        if (rendered.includes("INFO: Created TensorFlow Lite XNNPACK delegate for CPU.")) return;
        originalError(...messages);
      };
      try {
        return (await FaceDetector.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MEDIAPIPE_MODEL_PATH },
          runningMode: "IMAGE",
          minDetectionConfidence: 0.35,
          minSuppressionThreshold: 0.3,
        })) as MediaPipeFaceDetector;
      } finally {
        console.error = originalError;
      }
    })
    .catch(() => {
      // Allow a later fan to retry after a transient asset/network failure.
      mediaPipeDetectorPromise = null;
      return null;
    });

  return mediaPipeDetectorPromise;
}

/** Draw every supported capture source into a MediaPipe-compatible canvas. */
function mediaPipeInput(source: FaceBlendImageSource): HTMLCanvasElement {
  const size = dimensions(source);
  if (size.width < 2 || size.height < 2) throw new Error("face_blend_source_empty");
  const scale = Math.min(1, MEDIAPIPE_MAX_INPUT_EDGE / Math.max(size.width, size.height));
  const input = canvas(
    Math.max(2, Math.round(size.width * scale)),
    Math.max(2, Math.round(size.height * scale))
  );
  context2d(input).drawImage(source, 0, 0, input.width, input.height);
  return input;
}

/**
 * BlazeFace boxes are deliberately converted from the whole detected head to
 * an inner feature crop: omit most template-owned hair, retain the eyes and
 * expression, and extend through the user's chin. This is intentionally taller
 * than the detector's nearly-square box because front-camera faces commonly
 * include a longer jaw than BlazeFace's training crop.
 */
function featureRectFromDetectorBox(
  box: { originX: number; originY: number; width: number; height: number },
  imageWidth: number,
  imageHeight: number,
  keypoints: MediaPipeDetection["keypoints"] = []
): NormalizedRect | null {
  if (
    !Number.isFinite(box.originX) ||
    !Number.isFinite(box.originY) ||
    !Number.isFinite(box.width) ||
    !Number.isFinite(box.height) ||
    box.width <= 1 ||
    box.height <= 1
  ) {
    return null;
  }

  const normalizedBox = {
    x: box.originX / imageWidth,
    y: box.originY / imageHeight,
    width: box.width / imageWidth,
    height: box.height / imageHeight,
  };
  // BlazeFace publishes keypoints in this order: left eye, right eye, nose,
  // mouth, left tragion, right tragion. Eyes establish scale and rotation while
  // the mouth safely locates the lower face without ever reaching a shirt.
  const leftEye = keypoints?.[0];
  const rightEye = keypoints?.[1];
  const mouth = keypoints?.[3];
  if (
    leftEye &&
    rightEye &&
    mouth &&
    [leftEye.x, leftEye.y, rightEye.x, rightEye.y, mouth.x, mouth.y].every(Number.isFinite)
  ) {
    const eyeDistance = Math.hypot(rightEye.x - leftEye.x, rightEye.y - leftEye.y);
    if (eyeDistance >= 0.03 && eyeDistance <= 0.6) {
      const eyeCenterX = (leftEye.x + rightEye.x) / 2;
      const eyeCenterY = (leftEye.y + rightEye.y) / 2;
      const width = clamp(
        eyeDistance * 2.65,
        normalizedBox.width * 0.86,
        normalizedBox.width * 1.16
      );
      const top = clamp(
        eyeCenterY - eyeDistance * 1.57,
        normalizedBox.y - normalizedBox.height * 0.34,
        eyeCenterY - eyeDistance * 0.48
      );
      const desiredBottom = mouth.y + eyeDistance * 0.68;
      const bottom = clamp(
        desiredBottom,
        mouth.y + eyeDistance * 0.45,
        normalizedBox.y + normalizedBox.height * 1.1
      );
      return clampRect({
        x: eyeCenterX - width / 2,
        y: top,
        width,
        height: bottom - top,
      });
    }
  }

  // A detected face without usable keypoints is still materially better than
  // a generic crop. BlazeFace boxes begin near the brows, so extend upward by
  // a quarter-box and cap the lower edge around the jaw instead of the shirt.
  return clampRect({
    x: (box.originX - box.width * 0.015) / imageWidth,
    y: (box.originY - box.height * 0.255) / imageHeight,
    width: (box.width * 1.03) / imageWidth,
    height: (box.height * 1.34) / imageHeight,
  });
}

/** Detect the largest face locally with the self-hosted MediaPipe runtime. */
export async function detectSourceFaceRectWithMediaPipe(
  source: FaceBlendImageSource
): Promise<NormalizedRect | null> {
  try {
    const detector = await getMediaPipeFaceDetector();
    if (!detector) return null;
    const input = mediaPipeInput(source);
    const detection = detector
      .detect(input)
      .detections.filter(
        (candidate) =>
          candidate.boundingBox &&
          candidate.boundingBox.width > 1 &&
          candidate.boundingBox.height > 1
      )
      .sort((first, second) => {
        const firstBox = first.boundingBox!;
        const secondBox = second.boundingBox!;
        return secondBox.width * secondBox.height - firstBox.width * firstBox.height;
      })[0];
    if (!detection?.boundingBox) return null;
    return featureRectFromDetectorBox(
      detection.boundingBox,
      input.width,
      input.height,
      detection.keypoints
    );
  } catch {
    return null;
  }
}

/**
 * Prefer the browser Shape Detection API when it exists, then use the official
 * self-hosted MediaPipe detector in browsers such as Chrome that omit it. Only
 * a genuine failure of both detectors reaches the calibrated camera-guide crop.
 */
export async function detectSourceFaceRect(
  source: FaceBlendImageSource
): Promise<NormalizedRect | null> {
  const scope = globalThis as typeof globalThis & {
    FaceDetector?: NativeFaceDetectorConstructor;
  };
  const size = dimensions(source);
  if (size.width < 2 || size.height < 2) return null;

  if (typeof scope.FaceDetector === "function") {
    try {
      const detector = new scope.FaceDetector({ fastMode: true, maxDetectedFaces: 3 });
      const faces = await detector.detect(source as CanvasImageSource);
      const face = faces
        .filter((candidate) => candidate.boundingBox.width > 1 && candidate.boundingBox.height > 1)
        .sort(
          (first, second) =>
            second.boundingBox.width * second.boundingBox.height -
            first.boundingBox.width * first.boundingBox.height
        )[0];
      if (face) {
        const box = face.boundingBox;
        const converted = featureRectFromDetectorBox(
          { originX: box.x, originY: box.y, width: box.width, height: box.height },
          size.width,
          size.height
        );
        if (converted) return converted;
      }
    } catch {
      // MediaPipe below supplies the cross-browser path.
    }
  }

  return detectSourceFaceRectWithMediaPipe(source);
}

/**
 * Infer a conservative face rectangle from landmarks. It deliberately excludes
 * shoulders and most hair so the generated portrait supplies the silhouette.
 */
export function faceRectFromLandmarks(landmarks: FaceLandmarks): NormalizedRect {
  const eyeDistance = Math.hypot(
    landmarks.rightEye.x - landmarks.leftEye.x,
    landmarks.rightEye.y - landmarks.leftEye.y
  );
  const centerX = (landmarks.leftEye.x + landmarks.rightEye.x) / 2;
  const centerY = (landmarks.leftEye.y + landmarks.rightEye.y) / 2;
  const width = clamp(eyeDistance * 2.85, 0.08, 0.9);
  return clampRect({
    x: centerX - width / 2,
    y: centerY - width * 0.35,
    width,
    height: width,
  });
}

/**
 * Pure, allocation-only face matte for unit tests and the browser compositor.
 * Pixels are row-major floats from transparent (0) to fully replaced (1).
 */
export function createFaceFeatherMask(
  width: number,
  height: number,
  profile: Partial<FaceMaskProfile> = {}
): Float32Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("face_blend_invalid_mask_size");
  }
  const settings: FaceMaskProfile = {
    feather: clamp(profile.feather ?? DEFAULT_MASK.feather, 0.04, 0.45),
    foreheadWidth: clamp(profile.foreheadWidth ?? DEFAULT_MASK.foreheadWidth, 0.55, 1),
    templeWidth: clamp(profile.templeWidth ?? DEFAULT_MASK.templeWidth, 0.72, 1.08),
    chinWidth: clamp(profile.chinWidth ?? DEFAULT_MASK.chinWidth, 0.48, 0.92),
    hairlineInset: clamp(profile.hairlineInset ?? DEFAULT_MASK.hairlineInset, 0, 0.24),
  };
  const values = new Float32Array(width * height);
  const innerEdge = 1 - settings.feather;

  for (let y = 0; y < height; y += 1) {
    // Begin just below the hairline and map the usable area to -1...1.
    const verticalPosition = y / Math.max(1, height - 1);
    const adjustedY = (verticalPosition - settings.hairlineInset) / (1 - settings.hairlineInset);
    if (adjustedY < 0 || adjustedY > 1) continue;
    const normalizedY = adjustedY * 2 - 1;
    let widthScale: number;
    if (normalizedY < -0.35) {
      widthScale = mix(settings.foreheadWidth, settings.templeWidth, (normalizedY + 1) / 0.65);
    } else if (normalizedY < 0.3) {
      widthScale = settings.templeWidth;
    } else {
      widthScale = mix(settings.templeWidth, settings.chinWidth, (normalizedY - 0.3) / 0.7);
    }

    for (let x = 0; x < width; x += 1) {
      const normalizedX = ((x / Math.max(1, width - 1)) * 2 - 1) / widthScale;
      // A slightly super-elliptical cheek region avoids the pasted oval look.
      const distance = Math.pow(
        Math.pow(Math.abs(normalizedX), 2.25) + Math.pow(Math.abs(normalizedY), 2.1),
        1 / 2.15
      );
      values[y * width + x] = 1 - smoothstep(innerEdge, 1, distance);
    }
  }
  return values;
}

/** Pure weighted RGB/luminance statistics, exported for deterministic tests. */
export function calculateColorStatistics(
  pixels: Uint8ClampedArray,
  weights?: Float32Array
): ColorStatistics {
  if (pixels.length % 4 !== 0 || (weights && weights.length !== pixels.length / 4)) {
    throw new Error("face_blend_invalid_pixel_buffer");
  }
  const sums = [0, 0, 0];
  let luminanceSum = 0;
  let totalWeight = 0;
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const alpha = pixels[index + 3] / 255;
    const weight = (weights?.[pixel] ?? 1) * alpha;
    if (weight <= 0.01) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    sums[0] += red * weight;
    sums[1] += green * weight;
    sums[2] += blue * weight;
    luminanceSum += (red * 0.2126 + green * 0.7152 + blue * 0.0722) * weight;
    totalWeight += weight;
  }
  if (totalWeight <= 0.01) throw new Error("face_blend_empty_sample");
  const means = sums.map((sum) => sum / totalWeight) as [number, number, number];
  const luminanceMean = luminanceSum / totalWeight;
  const variance = [0, 0, 0];
  let luminanceVariance = 0;
  for (let index = 0, pixel = 0; index < pixels.length; index += 4, pixel += 1) {
    const alpha = pixels[index + 3] / 255;
    const weight = (weights?.[pixel] ?? 1) * alpha;
    if (weight <= 0.01) continue;
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    variance[0] += (red - means[0]) ** 2 * weight;
    variance[1] += (green - means[1]) ** 2 * weight;
    variance[2] += (blue - means[2]) ** 2 * weight;
    luminanceVariance += (luminance - luminanceMean) ** 2 * weight;
  }
  return {
    mean: [means[0], means[1], means[2]],
    deviation: [
      Math.sqrt(variance[0] / totalWeight),
      Math.sqrt(variance[1] / totalWeight),
      Math.sqrt(variance[2] / totalWeight),
    ],
    luminanceMean,
    luminanceDeviation: Math.sqrt(luminanceVariance / totalWeight),
    weight: totalWeight,
  };
}

function luminance(red: number, green: number, blue: number): number {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

/**
 * Pure colour-transfer routine. `sourceBlurred` and `targetBlurred` are optional
 * low-frequency buffers used to inherit scene lighting without ghosting the
 * generated model's facial features into the captured identity.
 */
export function matchFaceColors(
  source: Uint8ClampedArray,
  targetPixels: Uint8ClampedArray,
  weights: Float32Array,
  settings: Partial<FaceColorMatchSettings> = {},
  sourceBlurred?: Uint8ClampedArray,
  targetBlurred?: Uint8ClampedArray
): {
  pixels: Uint8ClampedArray;
  sourceStatistics: ColorStatistics;
  targetStatistics: ColorStatistics;
} {
  if (
    source.length !== targetPixels.length ||
    source.length !== weights.length * 4 ||
    (sourceBlurred && sourceBlurred.length !== source.length) ||
    (targetBlurred && targetBlurred.length !== targetPixels.length)
  ) {
    throw new Error("face_blend_mismatched_pixel_buffer");
  }
  const resolved: FaceColorMatchSettings = {
    luminance: clamp(settings.luminance ?? DEFAULT_COLOR_MATCH.luminance, 0, 1),
    color: clamp(settings.color ?? DEFAULT_COLOR_MATCH.color, 0, 1),
    localLighting: clamp(settings.localLighting ?? DEFAULT_COLOR_MATCH.localLighting, 0, 1),
  };
  const sourceStatistics = calculateColorStatistics(source, weights);
  const targetStatistics = calculateColorStatistics(targetPixels, weights);
  const result = new Uint8ClampedArray(source);
  const contrastScale = clamp(
    targetStatistics.luminanceDeviation / Math.max(8, sourceStatistics.luminanceDeviation),
    0.72,
    1.34
  );
  const sourceRedChroma = sourceStatistics.mean[0] - sourceStatistics.luminanceMean;
  const sourceBlueChroma = sourceStatistics.mean[2] - sourceStatistics.luminanceMean;
  const targetRedChroma = targetStatistics.mean[0] - targetStatistics.luminanceMean;
  const targetBlueChroma = targetStatistics.mean[2] - targetStatistics.luminanceMean;

  for (let index = 0; index < source.length; index += 4) {
    const sourceRed = source[index];
    const sourceGreen = source[index + 1];
    const sourceBlue = source[index + 2];
    const sourceLuminance = luminance(sourceRed, sourceGreen, sourceBlue);
    const matchedLuminance =
      (sourceLuminance - sourceStatistics.luminanceMean) * contrastScale +
      targetStatistics.luminanceMean;
    let adjustedLuminance = mix(sourceLuminance, matchedLuminance, resolved.luminance);

    if (sourceBlurred && targetBlurred) {
      const sourceLow = luminance(sourceBlurred[index], sourceBlurred[index + 1], sourceBlurred[index + 2]);
      const targetLow = luminance(targetBlurred[index], targetBlurred[index + 1], targetBlurred[index + 2]);
      adjustedLuminance += (targetLow - sourceLow) * resolved.localLighting;
    }

    const redChroma = sourceRed - sourceLuminance;
    const blueChroma = sourceBlue - sourceLuminance;
    const adjustedRedChroma = redChroma +
      (targetRedChroma - sourceRedChroma) * resolved.color;
    const adjustedBlueChroma = blueChroma +
      (targetBlueChroma - sourceBlueChroma) * resolved.color;
    const red = adjustedLuminance + adjustedRedChroma;
    const blue = adjustedLuminance + adjustedBlueChroma;
    // Solve green from luminance so texture contrast remains identity-driven.
    const green = (adjustedLuminance - red * 0.2126 - blue * 0.0722) / 0.7152;
    result[index] = clamp(Math.round(red), 0, 255);
    result[index + 1] = clamp(Math.round(green), 0, 255);
    result[index + 2] = clamp(Math.round(blue), 0, 255);
    result[index + 3] = source[index + 3];
  }

  return { pixels: result, sourceStatistics, targetStatistics };
}

function blurredPixels(sourceCanvas: HTMLCanvasElement, blurRadius: number): Uint8ClampedArray {
  const blurred = canvas(sourceCanvas.width, sourceCanvas.height);
  const context = context2d(blurred);
  context.filter = `blur(${Math.max(2, blurRadius)}px)`;
  context.drawImage(sourceCanvas, 0, 0);
  context.filter = "none";
  return context.getImageData(0, 0, blurred.width, blurred.height).data;
}

function drawSourceFacePatch(
  source: FaceBlendImageSource,
  sourceRect: NormalizedRect,
  width: number,
  height: number,
  rotation: number
): HTMLCanvasElement {
  const sourceSize = dimensions(source);
  if (sourceSize.width < 2 || sourceSize.height < 2) throw new Error("face_blend_source_empty");
  const patch = canvas(width, height);
  const output = context2d(patch);
  output.save();
  output.translate(width / 2, height / 2);
  output.rotate(rotation);
  // Slight overdraw keeps rotated corners opaque beneath the feathered mask.
  const overscan = 1.05;
  output.drawImage(
    source,
    sourceRect.x * sourceSize.width,
    sourceRect.y * sourceSize.height,
    sourceRect.width * sourceSize.width,
    sourceRect.height * sourceSize.height,
    (-width * overscan) / 2,
    (-height * overscan) / 2,
    width * overscan,
    height * overscan
  );
  output.restore();
  return patch;
}

/** Return a calibrated target or null for a team without full-face artwork. */
export function getAIFaceTarget(code: string): TeamFaceTarget | null {
  const normalized = normalizedCode(code);
  return normalized ? AI_FACE_TARGETS[normalized] : null;
}

/** Warm the full-face artwork before the shutter is tapped. */
export async function preloadAIFaceTemplate(code: string): Promise<boolean> {
  const targetConfig = getAIFaceTarget(code);
  if (!targetConfig || typeof window === "undefined") return false;
  try {
    await loadImage(targetConfig.templatePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Blend the captured identity into a complete AI costume portrait.
 *
 * The method intentionally throws if the complete AI template is unavailable;
 * callers should request a generated portrait or show a recoverable error, not
 * fall back to an untouched camera frame or a face-opening composition.
 */
export async function blendIdentityIntoTemplate(
  source: FaceBlendImageSource,
  code: string,
  options: FaceBlendOptions = {}
): Promise<FaceBlendResult> {
  const normalized = normalizedCode(code);
  if (!normalized) throw new Error(`face_blend_team_unsupported:${code}`);
  const targetConfig = options.target ?? AI_FACE_TARGETS[normalized];
  const templateUrl = options.templateUrl ?? targetConfig.templatePath;
  const artwork = options.templateSource ?? (await loadImage(templateUrl));
  const outputSize = Math.round(clamp(options.outputSize ?? 1400, 320, 2400));
  const outputCanvas = canvas(outputSize, outputSize);
  const output = context2d(outputCanvas);
  drawCover(output, artwork, outputSize, outputSize);

  const targetRect = clampRect(targetConfig.faceRect);
  const detectedSourceRect =
    !options.sourceFaceRect &&
    !options.sourceLandmarks &&
    options.detectSourceFace !== false
      ? await detectSourceFaceRect(source)
      : null;
  const sourceRect = clampRect(
    options.sourceFaceRect ??
      (options.sourceLandmarks
        ? faceRectFromLandmarks(options.sourceLandmarks)
        : detectedSourceRect ?? DEFAULT_SOURCE_FACE)
  );
  const targetPixels = {
    x: Math.round(targetRect.x * outputSize),
    y: Math.round(targetRect.y * outputSize),
    width: Math.max(8, Math.round(targetRect.width * outputSize)),
    height: Math.max(8, Math.round(targetRect.height * outputSize)),
  };
  // Keep readback within the canvas after integer rounding.
  targetPixels.width = Math.min(targetPixels.width, outputSize - targetPixels.x);
  targetPixels.height = Math.min(targetPixels.height, outputSize - targetPixels.y);

  const rotation =
    eyeAngle(targetConfig.landmarks) -
    (options.sourceLandmarks ? eyeAngle(options.sourceLandmarks) : 0);
  const sourcePatch = drawSourceFacePatch(
    source,
    sourceRect,
    targetPixels.width,
    targetPixels.height,
    rotation
  );
  const sourceContext = context2d(sourcePatch);
  const sourceImage = sourceContext.getImageData(0, 0, targetPixels.width, targetPixels.height);
  const targetImage = output.getImageData(
    targetPixels.x,
    targetPixels.y,
    targetPixels.width,
    targetPixels.height
  );
  const mask = createFaceFeatherMask(targetPixels.width, targetPixels.height, targetConfig.mask);
  const blurRadius = Math.max(4, Math.round(targetPixels.width * 0.045));

  const targetPatch = canvas(targetPixels.width, targetPixels.height);
  context2d(targetPatch).putImageData(targetImage, 0, 0);
  const matched = matchFaceColors(
    sourceImage.data,
    targetImage.data,
    mask,
    options.colorMatch,
    blurredPixels(sourcePatch, blurRadius),
    blurredPixels(targetPatch, blurRadius)
  );

  const composite = new Uint8ClampedArray(targetImage.data);
  let coverage = 0;
  for (let pixel = 0, index = 0; pixel < mask.length; pixel += 1, index += 4) {
    const alpha = mask[pixel] * (matched.pixels[index + 3] / 255);
    coverage += alpha;
    composite[index] = Math.round(mix(targetImage.data[index], matched.pixels[index], alpha));
    composite[index + 1] = Math.round(mix(targetImage.data[index + 1], matched.pixels[index + 1], alpha));
    composite[index + 2] = Math.round(mix(targetImage.data[index + 2], matched.pixels[index + 2], alpha));
    composite[index + 3] = 255;
  }
  output.putImageData(
    new ImageData(composite, targetPixels.width, targetPixels.height),
    targetPixels.x,
    targetPixels.y
  );

  const outputType = options.outputType ?? "image/jpeg";
  const quality = clamp(options.quality ?? 0.95, 0.7, 1);
  return {
    canvas: outputCanvas,
    dataUrl: outputCanvas.toDataURL(outputType, quality),
    code: normalized,
    templateUrl,
    sourceFaceRect: sourceRect,
    targetFaceRect: targetRect,
    diagnostics: {
      source: matched.sourceStatistics,
      target: matched.targetStatistics,
      maskCoverage: coverage / mask.length,
      rotationRadians: rotation,
    },
  };
}

/** Convenience API for the existing portrait renderer. */
export async function blendIdentityToDataUrl(
  source: FaceBlendImageSource,
  code: string,
  options: FaceBlendOptions = {}
): Promise<string> {
  return (await blendIdentityIntoTemplate(source, code, options)).dataUrl;
}
