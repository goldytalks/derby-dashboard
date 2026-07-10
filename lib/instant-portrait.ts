import type { CountryTheme } from "@/lib/prompts";

const SIZE = 1024;
let uscTemplatePromise: Promise<HTMLImageElement> | null = null;

function loadUSCTemplate(): Promise<HTMLImageElement> {
  if (uscTemplatePromise) return uscTemplatePromise;
  uscTemplatePromise = new Promise((resolve, reject) => {
    const template = new Image();
    template.onload = () => resolve(template);
    template.onerror = () => reject(new Error("usc_template_unavailable"));
    template.src = "/templates/usc-trojan-base.png?v=2";
  });
  return uscTemplatePromise;
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement
) {
  const scale = Math.max(SIZE / image.naturalWidth, SIZE / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(image, (SIZE - width) / 2, (SIZE - height) / 2, width, height);
}

function fillEllipse(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
  color: string
) {
  context.beginPath();
  context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
  context.fillStyle = color;
  context.fill();
}

function drawEditorialJacket(
  context: CanvasRenderingContext2D,
  primary: string,
  accent: string
) {
  context.fillStyle = primary;
  context.beginPath();
  context.moveTo(0, 760);
  context.quadraticCurveTo(220, 650, 410, 730);
  context.lineTo(512, 1024);
  context.lineTo(0, 1024);
  context.closePath();
  context.fill();
  context.beginPath();
  context.moveTo(SIZE, 760);
  context.quadraticCurveTo(804, 650, 614, 730);
  context.lineTo(512, 1024);
  context.lineTo(SIZE, 1024);
  context.closePath();
  context.fill();

  context.strokeStyle = accent;
  context.lineWidth = 18;
  context.beginPath();
  context.moveTo(318, 724);
  context.lineTo(512, 1000);
  context.lineTo(706, 724);
  context.stroke();
}

function drawUSCFaceIntoTemplate(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement
) {
  context.save();
  context.beginPath();
  context.moveTo(486, 294);
  context.bezierCurveTo(430, 288, 392, 320, 378, 374);
  context.bezierCurveTo(360, 444, 368, 526, 394, 584);
  context.bezierCurveTo(416, 634, 450, 670, 486, 681);
  context.bezierCurveTo(528, 672, 564, 636, 586, 584);
  context.bezierCurveTo(612, 520, 618, 438, 598, 370);
  context.bezierCurveTo(582, 320, 542, 290, 486, 294);
  context.closePath();
  context.clip();
  context.fillStyle = "#120d0a";
  context.fillRect(350, 270, 270, 430);

  const sourceWidth = image.naturalWidth * 0.42;
  const sourceHeight = image.naturalHeight * 0.55;
  const sourceX = image.naturalWidth * 0.24;
  const sourceY = image.naturalHeight * 0.23;
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    330,
    260,
    330,
    455
  );
  context.fillStyle = "rgba(111, 61, 32, 0.08)";
  context.fillRect(350, 270, 270, 430);
  context.restore();
}

function drawMascotHood(
  context: CanvasRenderingContext2D,
  outer: string,
  inner: string,
  kind: "tiger" | "bulldog"
) {
  context.strokeStyle = outer;
  context.lineWidth = 142;
  context.beginPath();
  context.ellipse(512, 460, 312, 350, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = inner;
  context.lineWidth = 20;
  context.stroke();

  context.fillStyle = outer;
  context.beginPath();
  if (kind === "tiger") {
    context.moveTo(258, 224); context.lineTo(302, 72); context.lineTo(396, 206);
    context.moveTo(628, 206); context.lineTo(722, 72); context.lineTo(766, 224);
  } else {
    context.moveTo(268, 238); context.quadraticCurveTo(114, 138, 172, 370); context.lineTo(352, 282);
    context.moveTo(672, 282); context.quadraticCurveTo(910, 138, 852, 370); context.lineTo(756, 238);
  }
  context.fill();

  if (kind === "tiger") {
    context.strokeStyle = "#20160e";
    context.lineWidth = 22;
    for (const offset of [-150, -78, 78, 150]) {
      context.beginPath();
      context.moveTo(512 + offset, 132);
      context.lineTo(512 + offset * 0.62, 240);
      context.stroke();
    }
  }
  drawEditorialJacket(context, outer, inner);
}

function drawGator(context: CanvasRenderingContext2D, theme: CountryTheme) {
  drawEditorialJacket(context, theme.bg, theme.accent);
  context.strokeStyle = "#174c2f";
  context.lineWidth = 118;
  context.beginPath();
  context.ellipse(512, 470, 340, 320, 0, 0, Math.PI * 2);
  context.stroke();
  context.strokeStyle = theme.accent;
  context.lineWidth = 16;
  context.stroke();
  context.fillStyle = "#f7ead3";
  for (let i = 0; i < 9; i += 1) {
    const x = 250 + i * 66;
    context.beginPath();
    context.moveTo(x, 714);
    context.lineTo(x + 25, 760);
    context.lineTo(x + 50, 714);
    context.closePath();
    context.fill();
  }
}

function drawCrimsonWave(context: CanvasRenderingContext2D, theme: CountryTheme) {
  drawEditorialJacket(context, theme.bg, theme.accent);
  context.globalAlpha = 0.92;
  for (let index = 0; index < 3; index += 1) {
    context.strokeStyle = index % 2 ? "#ffffff" : theme.bg;
    context.lineWidth = 48 - index * 8;
    context.beginPath();
    context.moveTo(-60, 800 + index * 54);
    context.bezierCurveTo(248, 606, 432, 1054, 1084, 724 + index * 44);
    context.stroke();
  }
  context.globalAlpha = 1;
}

function drawCountryCostume(context: CanvasRenderingContext2D, theme: CountryTheme) {
  drawEditorialJacket(context, theme.bg, theme.accent);
  switch (theme.code) {
    case "ESP":
      context.fillStyle = "#d9b45d";
      fillEllipse(context, 270, 740, 120, 52, "#d9b45d");
      fillEllipse(context, 754, 740, 120, 52, "#d9b45d");
      break;
    case "BEL":
      context.strokeStyle = "#d8a94b";
      context.lineWidth = 10;
      for (let x = 260; x < 770; x += 62) {
        context.beginPath(); context.moveTo(x, 730); context.lineTo(x, SIZE); context.stroke();
      }
      for (let y = 780; y < SIZE; y += 62) {
        context.beginPath(); context.moveTo(210, y); context.lineTo(814, y); context.stroke();
      }
      break;
    case "FRA":
      fillEllipse(context, 260, 738, 104, 48, "#d9b45d");
      fillEllipse(context, 764, 738, 104, 48, "#d9b45d");
      break;
    case "MAR":
      context.strokeStyle = theme.accent;
      context.lineWidth = 68;
      context.beginPath();
      context.ellipse(512, 456, 292, 344, 0, Math.PI * 1.06, Math.PI * 1.94);
      context.stroke();
      break;
    case "NOR":
    case "ENG":
      context.strokeStyle = "#c8cbd0";
      context.lineWidth = 48;
      context.beginPath();
      context.ellipse(512, 430, 278, 330, 0, Math.PI * 1.08, Math.PI * 1.92);
      context.stroke();
      break;
    case "ARG":
      context.fillStyle = "rgba(255,255,255,0.72)";
      context.fillRect(442, 730, 140, 294);
      break;
    case "SUI":
      context.fillStyle = "rgba(230,230,230,0.75)";
      context.fillRect(480, 824, 64, 170);
      context.fillRect(430, 876, 164, 64);
      break;
  }

  context.font = "96px Apple Color Emoji, sans-serif";
  context.textAlign = "center";
  context.fillText(theme.flag, 852, 158);
}

export async function createGuaranteedPortrait(
  image: HTMLImageElement,
  theme: CountryTheme
): Promise<string> {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("portrait_renderer_unavailable");

  if (theme.code === "USC") {
    const template = await loadUSCTemplate();
    context.drawImage(template, 0, 0, SIZE, SIZE);
    drawUSCFaceIntoTemplate(context, image);
    return canvas.toDataURL("image/jpeg", 0.94);
  }

  drawCover(context, image);
  context.fillStyle = `${theme.bg}24`;
  context.fillRect(0, 0, SIZE, SIZE);

  const vignette = context.createRadialGradient(512, 430, 250, 512, 512, 720);
  vignette.addColorStop(0, "rgba(0,0,0,0)");
  vignette.addColorStop(1, "rgba(0,0,0,0.48)");
  context.fillStyle = vignette;
  context.fillRect(0, 0, SIZE, SIZE);

  switch (theme.code) {
    case "LSU":
      drawMascotHood(context, "#d29f13", theme.bg, "tiger");
      break;
    case "UGA":
      drawMascotHood(context, "#d7d3ca", theme.bg, "bulldog");
      break;
    case "UF":
      drawGator(context, theme);
      break;
    case "ALA":
      drawCrimsonWave(context, theme);
      break;
    default:
      drawCountryCostume(context, theme);
  }

  const wash = context.createLinearGradient(0, 0, 0, SIZE);
  wash.addColorStop(0, "rgba(244,211,156,0.06)");
  wash.addColorStop(1, "rgba(13,8,6,0.12)");
  context.fillStyle = wash;
  context.fillRect(0, 0, SIZE, SIZE);
  return canvas.toDataURL("image/jpeg", 0.92);
}
