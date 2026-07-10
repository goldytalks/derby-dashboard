import QRCode from "qrcode";
import { publicAssetPath } from "@/lib/public-assets";
import type { SlipStatus } from "@/lib/copy";
import type { CountryTheme } from "@/lib/prompts";

export type CardStyle = "poster" | "editorial" | "scoreboard";

export interface CardVariant {
  id: CardStyle;
  name: string;
  format: string;
  width: number;
  height: number;
  description: string;
}

export const CARD_VARIANTS: CardVariant[] = [
  {
    id: "poster",
    name: "Victory Poster",
    format: "Story 9:16",
    width: 1080,
    height: 1920,
    description: "Full-bleed tunnel portrait with a stadium-poster finish.",
  },
  {
    id: "editorial",
    name: "Matchday Cover",
    format: "Portrait 4:5",
    width: 1080,
    height: 1350,
    description: "A restrained editorial cover with premium paper details.",
  },
  {
    id: "scoreboard",
    name: "Gallery Slip",
    format: "Square 1:1",
    width: 1080,
    height: 1080,
    description: "A gilded, portrait-first collectible made for sharing.",
  },
];

export interface Slip {
  matchup: string;
  market: string;
  side: string;
  odds: string;
  stake: string;
  toWin: string;
  probability: string;
}

export interface CardOptions {
  portrait: HTMLImageElement | HTMLCanvasElement | null;
  country: CountryTheme;
  status: SlipStatus;
  slip: Slip;
  style: CardStyle;
  code: string;
  seed: string;
  round?: string;
  venue?: string;
}

interface FontSet {
  display: string;
  data: string;
  body: string;
  editorial: string;
}

const NOVIG_BLUE = "#1CA3F5";
const INK = "#0A0A10";
const PAPER = "#F4F1E9";
const TICKET = "#121216";

let cachedFonts: FontSet | null = null;
let fontsReady = false;
const qrCache = new Map<string, HTMLCanvasElement>();
let brandMarksPromise: Promise<{
  blue: HTMLImageElement;
  white: HTMLImageElement;
  wordmark: HTMLImageElement;
}> | null = null;

function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Could not load brand asset: ${src}`));
    image.src = src;
  });
}

function getBrandMarks(): Promise<{
  blue: HTMLImageElement;
  white: HTMLImageElement;
  wordmark: HTMLImageElement;
}> {
  if (!brandMarksPromise) {
    brandMarksPromise = Promise.all([
      loadCanvasImage(publicAssetPath("/brand/novig-mark-blue.png")),
      loadCanvasImage(publicAssetPath("/brand/novig-mark-white.png")),
      loadCanvasImage(publicAssetPath("/brand/novig-wordmark.svg")),
    ]).then(([blue, white, wordmark]) => ({ blue, white, wordmark }));
  }
  return brandMarksPromise;
}

function fontFamilies(): FontSet {
  if (cachedFonts) return cachedFonts;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => {
    const first = styles.getPropertyValue(name).trim().split(",")[0]?.trim();
    return first ? `${first}, ${fallback}` : fallback;
  };
  cachedFonts = {
    display: read("--font-display", '"Arial Black", sans-serif'),
    data: read("--font-data", "Arial, sans-serif"),
    body: read("--font-body", "Arial, sans-serif"),
    editorial: read("--font-editorial", 'Georgia, "Times New Roman", serif'),
  };
  return cachedFonts;
}

export async function ensureFontsLoaded(): Promise<void> {
  if (fontsReady || typeof document === "undefined") return;
  const fonts = fontFamilies();
  try {
    await Promise.all([
      document.fonts.load(`400 100px ${fonts.display}`),
      document.fonts.load(`700 40px ${fonts.data}`),
      document.fonts.load(`500 40px ${fonts.data}`),
      document.fonts.load(`400 40px ${fonts.body}`),
      document.fonts.load(`600 72px ${fonts.editorial}`),
      document.fonts.load(`700 72px ${fonts.editorial}`),
      document.fonts.ready,
    ]);
  } catch {
    // System fonts keep the booth usable if a webfont is slow.
  }
  fontsReady = true;
}

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function setLetterSpacing(ctx: CanvasRenderingContext2D, value: string) {
  const canvasContext = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ("letterSpacing" in canvasContext) canvasContext.letterSpacing = value;
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  family: string,
  weight: string,
  startSize: number,
  maxWidth: number,
  minimum = 20
): number {
  let size = startSize;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > minimum && ctx.measureText(text).width > maxWidth) {
    size -= 4;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number,
  faceBias = 0.34
) {
  const sourceWidth = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const sourceHeight = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!sourceWidth || !sourceHeight) return;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const cropWidth = width / scale;
  const cropHeight = height / scale;
  const sourceX = (sourceWidth - cropWidth) / 2;
  const sourceY = Math.max(0, (sourceHeight - cropHeight) * faceBias);
  ctx.drawImage(source, sourceX, sourceY, cropWidth, cropHeight, x, y, width, height);
}

function drawPlaceholderPortrait(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  country: CountryTheme
) {
  const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
  gradient.addColorStop(0, country.bg);
  gradient.addColorStop(1, country.accent);
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, width, height);
}

async function getQrCanvas(code: string, maxSize: number): Promise<HTMLCanvasElement> {
  const text = `https://novig.us/?code=${encodeURIComponent(code)}`;
  const quietZone = 4;
  const modules = QRCode.create(text, { errorCorrectionLevel: "M" }).modules.size;
  const scale = Math.max(2, Math.floor(maxSize / (modules + quietZone * 2)));
  const cacheKey = `${code}:${scale}`;
  const cached = qrCache.get(cacheKey);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  await QRCode.toCanvas(canvas, text, {
    margin: quietZone,
    scale,
    errorCorrectionLevel: "M",
    color: { dark: INK, light: "#FFFFFF" },
  });
  qrCache.set(cacheKey, canvas);
  return canvas;
}

function money(value: string): string {
  const parsed = Number(String(value).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(parsed)) return value;
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function opponentFor(slip: Slip): string {
  const teams = slip.matchup
    .split(/\s+(?:vs\.?|versus)\s+/i)
    .map((team) => team.trim());
  return (
    teams.find((team) => team.toLowerCase() !== slip.side.toLowerCase()) ||
    teams[1] ||
    "Opponent"
  );
}

function drawLogo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  image: HTMLImageElement
) {
  ctx.drawImage(image, x, y, size, size);
}

function drawQrChip(
  ctx: CanvasRenderingContext2D,
  qr: HTMLCanvasElement,
  x: number,
  y: number,
  size: number,
  radius = 18
) {
  ctx.fillStyle = "#FFFFFF";
  roundedRectPath(ctx, x, y, size, size, radius);
  ctx.fill();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qr, Math.round(x + (size - qr.width) / 2), Math.round(y + (size - qr.height) / 2));
  ctx.imageSmoothingEnabled = true;
}

function drawPoster(
  ctx: CanvasRenderingContext2D,
  options: CardOptions,
  fonts: FontSet,
  qr: HTMLCanvasElement,
  width: number,
  height: number,
  logo: HTMLImageElement
) {
  if (options.portrait) drawImageCover(ctx, options.portrait, 0, 0, width, height, 0.28);
  else drawPlaceholderPortrait(ctx, 0, 0, width, height, options.country);

  const topShade = ctx.createLinearGradient(0, 0, 0, height * 0.62);
  topShade.addColorStop(0, "rgba(5, 7, 12, 0.78)");
  topShade.addColorStop(0.72, "rgba(5, 7, 12, 0.12)");
  topShade.addColorStop(1, "rgba(5, 7, 12, 0)");
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, width, height * 0.68);

  const bottomShade = ctx.createLinearGradient(0, height * 0.48, 0, height);
  bottomShade.addColorStop(0, "rgba(7, 7, 10, 0)");
  bottomShade.addColorStop(0.58, "rgba(7, 7, 10, 0.42)");
  bottomShade.addColorStop(1, "rgba(7, 7, 10, 0.96)");
  ctx.fillStyle = bottomShade;
  ctx.fillRect(0, height * 0.46, width, height * 0.54);

  ctx.fillStyle = options.country.bg;
  ctx.fillRect(0, 0, 24, height);
  ctx.fillStyle = options.country.accent;
  ctx.fillRect(width - 24, 0, 24, height);

  drawLogo(ctx, 62, 58, 76, logo);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.82)";
  ctx.font = `700 22px ${fonts.data}`;
  setLetterSpacing(ctx, "5px");
  ctx.fillText((options.round || "WORLD CUP").toUpperCase(), width - 62, 95);
  setLetterSpacing(ctx, "0px");

  ctx.textAlign = "center";
  ctx.strokeStyle = "rgba(255,255,255,0.76)";
  ctx.lineWidth = 5;
  const codeSize = fitText(ctx, options.country.code, fonts.display, "400", 280, width - 100);
  ctx.font = `400 ${codeSize}px ${fonts.display}`;
  ctx.strokeText(options.country.code, width / 2, 360);

  ctx.fillStyle = "#FFFFFF";
  const nameSize = fitText(ctx, options.country.name.toUpperCase(), fonts.display, "400", 124, width - 120);
  ctx.font = `400 ${nameSize}px ${fonts.display}`;
  ctx.fillText(options.country.name.toUpperCase(), width / 2, 500);

  const ticketX = 54;
  const ticketY = height - 440;
  const ticketWidth = width - 108;
  const ticketHeight = 350;
  ctx.fillStyle = "rgba(12,12,17,0.92)";
  roundedRectPath(ctx, ticketX, ticketY, ticketWidth, ticketHeight, 34);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.14)";
  ctx.lineWidth = 2;
  roundedRectPath(ctx, ticketX, ticketY, ticketWidth, ticketHeight, 34);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `700 20px ${fonts.data}`;
  setLetterSpacing(ctx, "4px");
  ctx.fillText(options.slip.matchup.toUpperCase(), ticketX + 40, ticketY + 60);
  setLetterSpacing(ctx, "0px");
  ctx.fillStyle = "#FFFFFF";
  ctx.font = `400 58px ${fonts.display}`;
  ctx.fillText(`$${money(options.slip.toWin)} TO WIN`, ticketX + 40, ticketY + 140);

  const stats = [
    ["TRADE", `$${money(options.slip.stake)}`],
    ["ODDS", options.slip.odds],
    ["CHANCE", `${options.slip.probability}%`],
  ];
  stats.forEach(([label, value], index) => {
    const x = ticketX + 40 + index * 220;
    ctx.fillStyle = "rgba(255,255,255,0.52)";
    ctx.font = `700 17px ${fonts.data}`;
    ctx.fillText(label, x, ticketY + 215);
    ctx.fillStyle = index === 2 ? options.country.accent : "#FFFFFF";
    ctx.font = `700 34px ${fonts.data}`;
    ctx.fillText(value, x, ticketY + 258);
  });
  drawQrChip(ctx, qr, ticketX + ticketWidth - 156, ticketY + 172, 118, 20);
  ctx.fillStyle = "rgba(255,255,255,0.62)";
  ctx.font = `700 16px ${fonts.data}`;
  ctx.textAlign = "right";
  ctx.fillText(`CODE ${options.code}`, ticketX + ticketWidth - 38, ticketY + 328);
}

function drawEditorial(
  ctx: CanvasRenderingContext2D,
  options: CardOptions,
  fonts: FontSet,
  qr: HTMLCanvasElement,
  width: number,
  height: number,
  logo: HTMLImageElement
) {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = options.country.bg;
  ctx.fillRect(0, 0, 28, height);
  ctx.fillStyle = options.country.accent;
  ctx.fillRect(28, 0, 10, height);

  ctx.fillStyle = INK;
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.font = `700 18px ${fonts.data}`;
  setLetterSpacing(ctx, "5px");
  ctx.fillText("novig: for the cup", 72, 70);
  setLetterSpacing(ctx, "0px");
  drawLogo(ctx, width - 126, 36, 72, logo);

  const photoX = 72;
  const photoY = 112;
  const photoWidth = width - 126;
  const photoHeight = 690;
  ctx.save();
  roundedRectPath(ctx, photoX, photoY, photoWidth, photoHeight, 12);
  ctx.clip();
  if (options.portrait) drawImageCover(ctx, options.portrait, photoX, photoY, photoWidth, photoHeight, 0.3);
  else drawPlaceholderPortrait(ctx, photoX, photoY, photoWidth, photoHeight, options.country);
  const gradient = ctx.createLinearGradient(photoX, photoY + photoHeight * 0.4, photoX, photoY + photoHeight);
  gradient.addColorStop(0, "rgba(5,5,8,0)");
  gradient.addColorStop(1, "rgba(5,5,8,0.58)");
  ctx.fillStyle = gradient;
  ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
  ctx.restore();

  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.font = `700 18px ${fonts.data}`;
  setLetterSpacing(ctx, "4px");
  ctx.fillText((options.round || "WORLD CUP").toUpperCase(), photoX + 30, photoY + photoHeight - 76);
  setLetterSpacing(ctx, "0px");
  ctx.font = `400 60px ${fonts.display}`;
  ctx.fillText(options.country.code, photoX + 30, photoY + photoHeight - 24);

  const titleY = 895;
  ctx.fillStyle = INK;
  const titleSize = fitText(ctx, options.country.name.toUpperCase(), fonts.display, "400", 92, width - 144);
  ctx.font = `400 ${titleSize}px ${fonts.display}`;
  ctx.fillText(options.country.name.toUpperCase(), 72, titleY);
  ctx.fillStyle = "rgba(10,10,16,0.58)";
  ctx.font = `500 23px ${fonts.data}`;
  ctx.fillText(`${options.slip.matchup}  /  ${options.slip.market}`, 74, titleY + 58);

  ctx.strokeStyle = "rgba(10,10,16,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(72, titleY + 98);
  ctx.lineTo(width - 54, titleY + 98);
  ctx.stroke();

  const stats = [
    ["FIXED TRADE", `$${money(options.slip.stake)}`],
    ["TO WIN", `$${money(options.slip.toWin)}`],
    ["LIVE ODDS", options.slip.odds],
    ["CHANCE", `${options.slip.probability}%`],
  ];
  stats.forEach(([label, value], index) => {
    const x = 74 + index * 202;
    ctx.fillStyle = "rgba(10,10,16,0.48)";
    ctx.font = `700 15px ${fonts.data}`;
    setLetterSpacing(ctx, "2px");
    ctx.fillText(label, x, titleY + 146);
    setLetterSpacing(ctx, "0px");
    ctx.fillStyle = index === 3 ? options.country.bg : INK;
    ctx.font = `700 36px ${fonts.data}`;
    ctx.fillText(value, x, titleY + 192);
  });

  ctx.fillStyle = options.country.bg;
  roundedRectPath(ctx, 72, height - 142, width - 286, 88, 44);
  ctx.fill();
  ctx.fillStyle = options.country.ink;
  ctx.font = `700 21px ${fonts.data}`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(`CODE ${options.code}  •  novig: winners welcome`, 106, height - 98);
  drawQrChip(ctx, qr, width - 190, height - 166, 112, 18);
}

function drawScoreboard(
  ctx: CanvasRenderingContext2D,
  options: CardOptions,
  fonts: FontSet,
  width: number,
  height: number,
  marks: { white: HTMLImageElement; wordmark: HTMLImageElement }
) {
  const gold = "#C9A35A";
  const paleGold = "#E9D49A";
  const parchment = "#E8DDC8";
  const opponent = opponentFor(options.slip);

  ctx.fillStyle = "#08090E";
  ctx.fillRect(0, 0, width, height);
  const ambient = ctx.createRadialGradient(width * 0.5, height * 0.38, 30, width * 0.5, height * 0.42, 720);
  ambient.addColorStop(0, `${options.country.bg}A8`);
  ambient.addColorStop(0.54, `${options.country.bg}38`);
  ambient.addColorStop(1, "rgba(5,6,10,0)");
  ctx.fillStyle = ambient;
  ctx.fillRect(0, 0, width, height);

  for (let index = 0; index < 26; index += 1) {
    const y = 18 + index * 41;
    ctx.fillStyle = index % 2 === 0 ? "rgba(255,255,255,0.012)" : "rgba(0,0,0,0.045)";
    ctx.fillRect(0, y, width, 1);
  }

  drawLogo(ctx, 44, 34, 54, marks.white);
  ctx.drawImage(marks.wordmark, 116, 48, 142, 25);
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(232,221,200,0.72)";
  ctx.font = `700 15px ${fonts.data}`;
  setLetterSpacing(ctx, "3px");
  ctx.fillText((options.round || "WORLD CUP").toUpperCase(), width - 46, 61);
  setLetterSpacing(ctx, "0px");

  const frameX = 78;
  const frameY = 112;
  const frameWidth = 924;
  const frameHeight = 620;
  const frameGradient = ctx.createLinearGradient(frameX, frameY, frameX + frameWidth, frameY + frameHeight);
  frameGradient.addColorStop(0, "#5A3510");
  frameGradient.addColorStop(0.18, "#E0BE72");
  frameGradient.addColorStop(0.48, "#7A4D1B");
  frameGradient.addColorStop(0.72, "#F0D58C");
  frameGradient.addColorStop(1, "#4A2B0E");

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.72)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = frameGradient;
  ctx.fillRect(frameX, frameY, frameWidth, frameHeight);
  ctx.restore();

  ctx.strokeStyle = "#F4DF9B";
  ctx.lineWidth = 3;
  ctx.strokeRect(frameX + 4, frameY + 4, frameWidth - 8, frameHeight - 8);
  ctx.strokeStyle = "#3A220C";
  ctx.lineWidth = 10;
  ctx.strokeRect(frameX + 17, frameY + 17, frameWidth - 34, frameHeight - 34);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 4;
  ctx.strokeRect(frameX + 28, frameY + 28, frameWidth - 56, frameHeight - 56);

  ctx.fillStyle = parchment;
  ctx.fillRect(frameX + 34, frameY + 34, frameWidth - 68, frameHeight - 68);
  ctx.fillStyle = "#151015";
  ctx.fillRect(frameX + 47, frameY + 47, frameWidth - 94, frameHeight - 94);

  const photoX = frameX + 58;
  const photoY = frameY + 58;
  const photoWidth = frameWidth - 116;
  const photoHeight = frameHeight - 116;
  ctx.save();
  ctx.rect(photoX, photoY, photoWidth, photoHeight);
  ctx.clip();
  if (options.portrait) drawImageCover(ctx, options.portrait, photoX, photoY, photoWidth, photoHeight, 0.3);
  else drawPlaceholderPortrait(ctx, photoX, photoY, photoWidth, photoHeight, options.country);
  ctx.globalCompositeOperation = "multiply";
  ctx.fillStyle = "rgba(95,55,22,0.16)";
  ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
  ctx.globalCompositeOperation = "source-over";
  const overlay = ctx.createRadialGradient(width / 2, photoY + photoHeight * 0.43, 110, width / 2, photoY + photoHeight * 0.44, 520);
  overlay.addColorStop(0, "rgba(255,233,188,0.04)");
  overlay.addColorStop(0.7, "rgba(18,10,10,0.05)");
  overlay.addColorStop(1, "rgba(7,5,8,0.62)");
  ctx.fillStyle = overlay;
  ctx.fillRect(photoX, photoY, photoWidth, photoHeight);
  ctx.restore();

  const ornaments = [
    [frameX + 22, frameY + 22, 1, 1],
    [frameX + frameWidth - 22, frameY + 22, -1, 1],
    [frameX + 22, frameY + frameHeight - 22, 1, -1],
    [frameX + frameWidth - 22, frameY + frameHeight - 22, -1, -1],
  ] as const;
  ornaments.forEach(([x, y, directionX, directionY]) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(directionX, directionY);
    ctx.strokeStyle = paleGold;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 50);
    ctx.bezierCurveTo(3, 22, 22, 3, 50, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(13, 13, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  });

  ctx.fillStyle = "#100C10";
  ctx.fillRect(width / 2 - 172, frameY + frameHeight - 32, 344, 58);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(width / 2 - 172, frameY + frameHeight - 32, 344, 58);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = paleGold;
  ctx.font = `700 15px ${fonts.data}`;
  setLetterSpacing(ctx, "4px");
  ctx.fillText("THE GALLERY SLIP", width / 2, frameY + frameHeight - 3);
  setLetterSpacing(ctx, "0px");

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = parchment;
  const sideSize = fitText(ctx, options.slip.side.toUpperCase(), fonts.editorial, "600", 92, 640, 54);
  ctx.font = `600 ${sideSize}px ${fonts.editorial}`;
  ctx.fillText(options.slip.side.toUpperCase(), 70, 836);
  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(232,221,200,0.78)";
  ctx.font = `600 38px ${fonts.editorial}`;
  ctx.fillText(`vs ${opponent}`, width - 70, 809);
  ctx.fillStyle = "rgba(232,221,200,0.46)";
  ctx.font = `700 13px ${fonts.data}`;
  setLetterSpacing(ctx, "2px");
  ctx.fillText((options.venue || "WORLD CUP").toUpperCase(), width - 72, 838);
  setLetterSpacing(ctx, "0px");

  const boardY = 872;
  const boardX = 58;
  const boardWidth = width - 116;
  const boardHeight = 142;
  const plaque = ctx.createLinearGradient(boardX, boardY, boardX, boardY + boardHeight);
  plaque.addColorStop(0, "rgba(40,31,34,0.96)");
  plaque.addColorStop(1, "rgba(13,12,16,0.98)");
  ctx.fillStyle = plaque;
  ctx.fillRect(boardX, boardY, boardWidth, boardHeight);
  ctx.strokeStyle = gold;
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX, boardY, boardWidth, boardHeight);

  const stats = [
    ["CHANCE", `${options.slip.probability}%`],
    ["ODDS", options.slip.odds],
    ["STAKE", `$${money(options.slip.stake)}`],
    ["TO WIN", `$${money(options.slip.toWin)}`],
  ];
  stats.forEach(([label, value], index) => {
    const x = boardX + 34 + index * 235;
    if (index > 0) {
      ctx.strokeStyle = "rgba(201,163,90,0.28)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - 25, boardY + 27);
      ctx.lineTo(x - 25, boardY + boardHeight - 27);
      ctx.stroke();
    }
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(232,221,200,0.52)";
    ctx.font = `700 13px ${fonts.data}`;
    setLetterSpacing(ctx, "2px");
    ctx.fillText(label, x, boardY + 38);
    setLetterSpacing(ctx, "0px");
    ctx.fillStyle = index === 0 ? options.country.accent : parchment;
    ctx.font = `600 48px ${fonts.editorial}`;
    ctx.fillText(value, x, boardY + 100);
  });

  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(232,221,200,0.55)";
  ctx.font = `700 13px ${fonts.data}`;
  setLetterSpacing(ctx, "3px");
  ctx.fillText("novig: for the cup", width / 2, 1050);
  setLetterSpacing(ctx, "0px");
}

export async function renderCard(canvas: HTMLCanvasElement, options: CardOptions): Promise<void> {
  await ensureFontsLoaded();
  const brandMarks = await getBrandMarks();
  const fonts = fontFamilies();
  const variant = CARD_VARIANTS.find((entry) => entry.id === options.style) || CARD_VARIANTS[0];
  canvas.width = variant.width;
  canvas.height = variant.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, variant.width, variant.height);

  if (options.style === "scoreboard") {
    drawScoreboard(ctx, options, fonts, variant.width, variant.height, brandMarks);
    return;
  }

  const qr = await getQrCanvas(options.code, options.style === "poster" ? 118 : 112);

  if (options.style === "editorial") {
    drawEditorial(ctx, options, fonts, qr, variant.width, variant.height, brandMarks.blue);
    return;
  }
  drawPoster(ctx, options, fonts, qr, variant.width, variant.height, brandMarks.white);
}
