// Ordered Bayer 8x8 dither with duotone output.
// The source is downscaled to one sample per output cell, thresholded
// against the normalized Bayer matrix, then upscaled with smoothing off
// so every cell lands as a chunky square pixel.

const BAYER_8 = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
];

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean,
    16
  );
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mixTowardWhite(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const to2 = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

type DitherSource =
  | HTMLImageElement
  | HTMLCanvasElement
  | HTMLVideoElement
  | ImageBitmap;

function sourceSize(source: DitherSource): { w: number; h: number } {
  if (typeof HTMLVideoElement !== "undefined" && source instanceof HTMLVideoElement) {
    return { w: source.videoWidth, h: source.videoHeight };
  }
  if (typeof HTMLImageElement !== "undefined" && source instanceof HTMLImageElement) {
    return { w: source.naturalWidth, h: source.naturalHeight };
  }
  return { w: source.width, h: source.height };
}

export function ditherDraw(
  ctx: CanvasRenderingContext2D,
  source: DitherSource,
  x: number,
  y: number,
  w: number,
  h: number,
  darkHex: string,
  lightHex: string,
  pixelSize = 6
): void {
  const gridW = Math.max(1, Math.round(w / pixelSize));
  const gridH = Math.max(1, Math.round(h / pixelSize));

  const tmp = document.createElement("canvas");
  tmp.width = gridW;
  tmp.height = gridH;
  const tctx = tmp.getContext("2d", { willReadFrequently: true });
  if (!tctx) return;

  // Cover crop the source into the sample grid.
  const { w: sw, h: sh } = sourceSize(source);
  if (!sw || !sh) return;
  const scale = Math.max(gridW / sw, gridH / sh);
  const dw = sw * scale;
  const dh = sh * scale;
  tctx.drawImage(source, (gridW - dw) / 2, (gridH - dh) / 2, dw, dh);

  const image = tctx.getImageData(0, 0, gridW, gridH);
  const data = image.data;
  const dark = hexToRgb(darkHex);
  const light = hexToRgb(lightHex);

  for (let py = 0; py < gridH; py++) {
    const row = BAYER_8[py & 7];
    for (let px = 0; px < gridW; px++) {
      const i = (py * gridW + px) * 4;
      // Grayscale via luma weights, then a contrast stretch.
      let l =
        (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) / 255;
      l = (l - 0.5) * 1.5 + 0.53;
      const threshold = (row[px & 7] + 0.5) / 64;
      const c = l > threshold ? light : dark;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      data[i + 3] = 255;
    }
  }

  tctx.putImageData(image, 0, 0);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp, x, y, w, h);
  ctx.restore();
}
