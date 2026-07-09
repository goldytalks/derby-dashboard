// Pure canvas card compositor. The only import besides local libs is the
// qrcode package, which renders the promo QR into an offscreen canvas.

import QRCode from "qrcode";
import { COOKED_THEME, type CountryTheme } from "@/lib/prompts";
import type { SlipStatus } from "@/lib/copy";

export type CardFormat = "story" | "square";

export interface Slip {
  matchup: string;
  market: string;
  side: string;
  odds: string;
  stake: string;
  toWin: string;
}

export interface CardOptions {
  portrait: HTMLImageElement | HTMLCanvasElement | null;
  country: CountryTheme;
  status: SlipStatus;
  slip: Slip;
  format: CardFormat;
  code: string;
  seed: string;
}

const NEAR_BLACK = "#0A0A10";
const TICKET = "#121216";
const NOVIG_BLUE = "#1CA3F5";
const MARGIN = 76;

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixTowardWhite(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const to2 = (c: number) => c.toString(16).padStart(2, "0");
  return `#${to2(mix(r))}${to2(mix(g))}${to2(mix(b))}`;
}

// Straight photobooth print: cover crop the photo into the region,
// biased slightly toward the top so faces stay in frame.
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  w: number,
  h: number
) {
  const sw =
    source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sh =
    source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!sw || !sh) return;
  const scale = Math.max(w / sw, h / sh);
  const srcW = w / scale;
  const srcH = h / scale;
  const sx = (sw - srcW) / 2;
  const sy = (sh - srcH) * 0.38;
  ctx.drawImage(source, sx, sy, srcW, srcH, x, y, w, h);
}

interface FontSet {
  display: string;
  data: string;
  body: string;
}

let cachedFonts: FontSet | null = null;

function fontFamilies(): FontSet {
  if (cachedFonts) return cachedFonts;
  const styles = getComputedStyle(document.documentElement);
  // Take only the first family from each variable. A single bad entry
  // later in the list would invalidate the whole ctx.font assignment,
  // and canvas fails silently by keeping the previous font.
  const read = (name: string, fallback: string) => {
    const first = styles.getPropertyValue(name).trim().split(",")[0]?.trim();
    return first ? `${first}, ${fallback}` : fallback;
  };
  cachedFonts = {
    display: read("--font-display", '"Archivo Black", sans-serif'),
    data: read("--font-data", '"Space Grotesk", sans-serif'),
    body: read("--font-body", "Archivo, sans-serif"),
  };
  return cachedFonts;
}

let fontsReady = false;

// Canvas text measures wrong if the webfonts have not arrived yet,
// so every render awaits this once before drawing.
export async function ensureFontsLoaded(): Promise<void> {
  if (fontsReady || typeof document === "undefined") return;
  const f = fontFamilies();
  try {
    await Promise.all([
      document.fonts.load(`400 100px ${f.display}`),
      document.fonts.load(`700 40px ${f.data}`),
      document.fonts.load(`500 40px ${f.data}`),
      document.fonts.load(`400 40px ${f.body}`),
      document.fonts.ready,
    ]);
  } catch {
    // Fall through to system faces rather than blocking the render.
  }
  fontsReady = true;
}

const qrCache = new Map<string, HTMLCanvasElement>();

// Render at an integer pixels-per-module scale and draw 1:1 later.
// Resampling a QR breaks its modules and makes it hard to scan.
async function getQrCanvas(
  code: string,
  maxSize: number
): Promise<HTMLCanvasElement> {
  const text = `https://novig.us/?code=${encodeURIComponent(code)}`;
  const modules = QRCode.create(text, { errorCorrectionLevel: "M" }).modules
    .size;
  const quietZoneModules = 4;
  const scale = Math.max(
    2,
    Math.floor(maxSize / (modules + quietZoneModules * 2))
  );
  const cacheKey = `${code}:${scale}`;
  const hit = qrCache.get(cacheKey);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, {
    margin: quietZoneModules,
    scale,
    errorCorrectionLevel: "M",
    color: { dark: "#0E0E12", light: "#FFFFFF" },
  });
  qrCache.set(cacheKey, canvas);
  return canvas;
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  const anyCtx = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in anyCtx) anyCtx.letterSpacing = value;
}

function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: string,
  startSize: number,
  maxWidth: number
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > 14 && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHazardBand(
  ctx: CanvasRenderingContext2D,
  width: number,
  centerY: number,
  bandHeight: number,
  bg: string,
  ink: string
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, centerY - bandHeight / 2, width, bandHeight);
  ctx.clip();
  ctx.fillStyle = bg;
  ctx.fillRect(0, centerY - bandHeight / 2, width, bandHeight);
  ctx.fillStyle = ink;
  const stripeW = 26;
  const step = stripeW * 2.4;
  for (let x = -bandHeight; x < width + bandHeight; x += step) {
    ctx.save();
    ctx.translate(x, centerY);
    ctx.rotate(-Math.PI / 4);
    ctx.fillRect(-stripeW / 2, -bandHeight, stripeW, bandHeight * 2);
    ctx.restore();
  }
  ctx.restore();
}

function drawRailText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  centerY: number,
  color: string,
  family: string,
  clockwise: boolean
) {
  ctx.save();
  ctx.translate(x, centerY);
  ctx.rotate(clockwise ? Math.PI / 2 : -Math.PI / 2);
  ctx.font = `700 24px ${family}`;
  setLetterSpacing(ctx, "8px");
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  // Soft shadow keeps the rails readable over bright photos.
  ctx.shadowColor = "rgba(10, 10, 16, 0.75)";
  ctx.shadowBlur = 10;
  ctx.fillText(text, 0, 0);
  setLetterSpacing(ctx, "0px");
  ctx.restore();
}

interface TicketArea {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawTicketStrip(
  ctx: CanvasRenderingContext2D,
  area: TicketArea,
  code: string,
  qr: HTMLCanvasElement,
  fonts: FontSet
) {
  const strip = document.createElement("canvas");
  strip.width = area.w;
  strip.height = area.h;
  const sctx = strip.getContext("2d");
  if (!sctx) return;

  sctx.fillStyle = TICKET;
  roundedRectPath(sctx, 0, 0, area.w, area.h, 20);
  sctx.fill();

  // Scallop circles punched out of the top edge.
  sctx.globalCompositeOperation = "destination-out";
  const scallopR = 13;
  const spacing = 52;
  for (let x = spacing / 2; x < area.w; x += spacing) {
    sctx.beginPath();
    sctx.arc(x, 0, scallopR, 0, Math.PI * 2);
    sctx.fill();
  }
  sctx.globalCompositeOperation = "source-over";

  const pad = Math.round(area.h * 0.17);
  const logoSize = area.h - pad * 2;

  // Blue rounded N logo square.
  sctx.fillStyle = NOVIG_BLUE;
  roundedRectPath(sctx, pad, pad, logoSize, logoSize, Math.round(logoSize * 0.26));
  sctx.fill();
  sctx.fillStyle = "#FFFFFF";
  sctx.font = `400 ${Math.round(logoSize * 0.58)}px ${fonts.display}`;
  sctx.textAlign = "center";
  sctx.textBaseline = "middle";
  sctx.fillText("N", pad + logoSize / 2, pad + logoSize * 0.56);

  // QR chip on the right. The QR canvas is drawn at its natural size,
  // centered, so its modules stay pixel exact.
  const chipSize = area.h - pad * 2;
  const chipX = area.w - pad - chipSize;
  sctx.fillStyle = "#FFFFFF";
  roundedRectPath(sctx, chipX, pad, chipSize, chipSize, 14);
  sctx.fill();
  sctx.imageSmoothingEnabled = false;
  sctx.drawImage(
    qr,
    Math.round(chipX + (chipSize - qr.width) / 2),
    Math.round(pad + (chipSize - qr.height) / 2)
  );
  sctx.imageSmoothingEnabled = true;

  // Code and subline.
  const textX = pad + logoSize + Math.round(pad * 0.9);
  const maxTextW = chipX - textX - pad;
  sctx.textAlign = "left";
  sctx.textBaseline = "alphabetic";
  const codeSize = fitFontSize(
    sctx,
    `CODE ${code}`,
    fonts.data,
    "700",
    Math.round(area.h * 0.26),
    maxTextW
  );
  sctx.fillStyle = "#FFFFFF";
  sctx.font = `700 ${codeSize}px ${fonts.data}`;
  setLetterSpacing(sctx, "2px");
  sctx.fillText(`CODE ${code}`, textX, area.h * 0.47);
  setLetterSpacing(sctx, "0px");
  sctx.fillStyle = "rgba(244, 248, 252, 0.66)";
  sctx.font = `500 ${Math.round(area.h * 0.15)}px ${fonts.data}`;
  sctx.fillText("novig.us  |  trade the Cup", textX, area.h * 0.72);

  ctx.drawImage(strip, area.x, area.y);
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fonts: FontSet,
  tint: string
) {
  ctx.save();
  ctx.font = `700 22px ${fonts.data}`;
  setLetterSpacing(ctx, "3px");
  const w = ctx.measureText(text).width + 48;
  const h = 46;
  ctx.fillStyle = "rgba(10, 10, 16, 0.78)";
  roundedRectPath(ctx, x - w, y, w, h, h / 2);
  ctx.fill();
  ctx.strokeStyle = tint;
  ctx.lineWidth = 2;
  roundedRectPath(ctx, x - w, y, w, h, h / 2);
  ctx.stroke();
  ctx.fillStyle = tint;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x - w / 2, y + h / 2 + 1);
  setLetterSpacing(ctx, "0px");
  ctx.restore();
}

function formatMoney(raw: string): string {
  const n = Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return raw || "0";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export async function renderCard(
  canvas: HTMLCanvasElement,
  opts: CardOptions
): Promise<void> {
  await ensureFontsLoaded();
  const fonts = fontFamilies();

  const isStory = opts.format === "story";
  const ticketH = isStory ? 196 : 164;
  const ticketPad = Math.round(ticketH * 0.17);
  const qr = await getQrCanvas(opts.code, ticketH - ticketPad * 2 - 8);
  const W = 1080;
  const H = isStory ? 1920 : 1080;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const cooked = opts.status === "COOKED";
  const bg = cooked ? COOKED_THEME.bg : opts.country.bg;
  const ink = cooked ? COOKED_THEME.ink : opts.country.ink;
  const lightTint = mixTowardWhite(bg, 0.84);

  const topH = Math.round(H * (isStory ? 0.46 : 0.42));
  const k = isStory ? 1 : 0.62; // type scale for the square recipe
  const maxW = W - MARGIN * 2;

  // ---- background blocks ----
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, topH);
  ctx.fillStyle = NEAR_BLACK;
  ctx.fillRect(0, topH, W, H - topH);

  // ---- portrait, real photo, no filters ----
  const portraitH = H - topH;
  if (opts.portrait) {
    drawImageCover(ctx, opts.portrait, 0, topH, W, portraitH);
  }

  // ---- type stack in the top block ----
  const eyebrow = `${opts.slip.matchup}  •  ${opts.slip.market}`.toUpperCase();
  const moneyLabel = "TO WIN";
  const moneyText = `$${formatMoney(opts.slip.toWin)}`;
  const oddsText = `ODDS ${opts.slip.odds}`.toUpperCase();
  const sideText = `${opts.slip.side}  •  STAKE $${formatMoney(
    opts.slip.stake
  )}`.toUpperCase();

  let eyebrowSize = Math.round(30 * k);
  let labelSize = Math.round(34 * k);
  let sideSize = Math.round(28 * k);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  let statusSize = fitFontSize(
    ctx,
    opts.status,
    fonts.display,
    "400",
    Math.round(300 * k),
    maxW
  );
  let moneySize = fitFontSize(
    ctx,
    moneyText,
    fonts.display,
    "400",
    Math.round(210 * k),
    maxW
  );
  let oddsSize = fitFontSize(
    ctx,
    oddsText,
    fonts.display,
    "400",
    Math.round(104 * k),
    maxW * 0.8
  );

  let gap = Math.round(34 * k);
  let smallGap = Math.round(16 * k);
  const stackHeight = () =>
    eyebrowSize +
    gap +
    statusSize +
    gap +
    labelSize +
    smallGap +
    moneySize +
    gap +
    oddsSize +
    gap +
    sideSize;

  // The whole stack must live inside the top block, above the hazard band.
  const stackRoom = topH - Math.round(72 * k) - 40;
  if (stackHeight() > stackRoom) {
    const f = stackRoom / stackHeight();
    eyebrowSize = Math.round(eyebrowSize * f);
    labelSize = Math.round(labelSize * f);
    sideSize = Math.round(sideSize * f);
    statusSize = Math.round(statusSize * f);
    moneySize = Math.round(moneySize * f);
    oddsSize = Math.round(oddsSize * f);
    gap = Math.round(gap * f);
    smallGap = Math.round(smallGap * f);
  }

  const stackH = stackHeight();
  let y = Math.max((topH - 40 - stackH) / 2, Math.round(32 * k));
  const cx = W / 2;

  // Eyebrow: matchup and market.
  y += eyebrowSize;
  ctx.font = `700 ${eyebrowSize}px ${fonts.data}`;
  setLetterSpacing(ctx, `${Math.round(6 * k)}px`);
  ctx.fillStyle = ink;
  ctx.fillText(eyebrow, cx, y, maxW);
  setLetterSpacing(ctx, "0px");

  // Status word, outlined only.
  y += gap + statusSize;
  ctx.font = `400 ${statusSize}px ${fonts.display}`;
  ctx.strokeStyle = ink;
  ctx.lineWidth = Math.max(3, Math.round(statusSize * 0.02));
  ctx.strokeText(opts.status, cx, y - statusSize * 0.14);

  // Money line, solid.
  y += gap + labelSize;
  ctx.font = `700 ${labelSize}px ${fonts.data}`;
  setLetterSpacing(ctx, `${Math.round(10 * k)}px`);
  ctx.fillStyle = ink;
  ctx.fillText(moneyLabel, cx, y);
  setLetterSpacing(ctx, "0px");
  y += smallGap + moneySize;
  ctx.font = `400 ${moneySize}px ${fonts.display}`;
  ctx.fillText(moneyText, cx, y - moneySize * 0.14);

  // Odds line, outlined.
  y += gap + oddsSize;
  ctx.font = `400 ${oddsSize}px ${fonts.display}`;
  ctx.lineWidth = Math.max(2, Math.round(oddsSize * 0.03));
  ctx.strokeText(oddsText, cx, y - oddsSize * 0.14);

  // Side and stake, small caps.
  y += gap + sideSize;
  ctx.font = `700 ${sideSize}px ${fonts.data}`;
  setLetterSpacing(ctx, `${Math.round(5 * k)}px`);
  ctx.fillText(sideText, cx, y, maxW);
  setLetterSpacing(ctx, "0px");

  // ---- hazard divider over the seam ----
  drawHazardBand(ctx, W, topH, Math.round(52 * (isStory ? 1 : 0.8)), bg, ink);

  // ---- vertical rails ----
  const railCenter = topH + portraitH * 0.42;
  drawRailText(ctx, "NOVIG BOOTH  GET CAPPED", 38, railCenter, "rgba(244, 248, 252, 0.5)", fonts.data, false);
  drawRailText(ctx, "PEER TO PEER  ZERO VIG", W - 38, railCenter, "rgba(244, 248, 252, 0.5)", fonts.data, true);

  // ---- ticket strip ----
  const ticketMargin = isStory ? 56 : 40;
  const ticket: TicketArea = {
    x: ticketMargin,
    y: H - ticketMargin - ticketH,
    w: W - ticketMargin * 2,
    h: ticketH,
  };
  drawTicketStrip(ctx, ticket, opts.code, qr, fonts);

  // ---- AI FIT badge over the portrait ----
  drawBadge(
    ctx,
    `AI FIT • ${opts.seed}`,
    W - MARGIN + 20,
    topH + Math.round(48 * (isStory ? 1 : 0.7)),
    fonts,
    lightTint
  );
}
