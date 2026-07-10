#!/usr/bin/env node

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PAGE_PATH = "app/page.tsx";
const ROUTE_PATH = "app/api/generate/route.ts";
const PROMPTS_PATH = "lib/server/team-prompts.ts";
const CANARY_RUNNER_PATH = "scripts/run-image-canary.mjs";
const ENV_EXAMPLE_PATH = ".env.local.example";
const DEFAULT_GATEWAY_IMAGE_MODEL = "bfl/flux-2-klein-4b";

const EXPECTED_TEAM_CODES = [
  "FRA",
  "MAR",
  "ESP",
  "BEL",
  "NOR",
  "ENG",
  "ARG",
  "SUI",
  "USC",
  "SJSU",
  "ALA",
  "ECAR",
  "UGA",
  "TSU",
  "UF",
  "FAU",
  "LSU",
  "CLEM",
];

const LEGACY_FILES = [
  "lib/instant-portrait.ts",
  "lib/instant-portrait.tsx",
  "lib/instant-portrait.js",
  "lib/face-blend.ts",
  "lib/face-blend.tsx",
  "lib/face-blend.js",
  "lib/face-compositor.ts",
  "lib/portrait-compositor.ts",
  "public/templates/usc-trojan-base.png",
];

const SOURCE_ROOTS = ["app", "components", "lib", "scripts"];
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".js",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
]);

const failures = [];
let assertionCount = 0;

function read(path) {
  return readFileSync(resolve(ROOT, path), "utf8");
}

function check(condition, message) {
  assertionCount += 1;
  if (!condition) failures.push(message);
}

function unique(values) {
  return [...new Set(values)];
}

function sameMembers(actual, expected) {
  const left = unique(actual).sort();
  const right = unique(expected).sort();
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function occurrences(source, pattern) {
  return [...source.matchAll(pattern)];
}

function lineNumber(source, offset) {
  return source.slice(0, offset).split("\n").length;
}

function collectSourceFiles(rootPath) {
  const absoluteRoot = resolve(ROOT, rootPath);
  if (!existsSync(absoluteRoot)) return [];

  const output = [];
  for (const entry of readdirSync(absoluteRoot, { withFileTypes: true })) {
    const absolute = join(absoluteRoot, entry.name);
    if (entry.isDirectory()) {
      output.push(...collectSourceFiles(relative(ROOT, absolute)));
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
      output.push(relative(ROOT, absolute));
    }
  }
  return output;
}

function quotedStrings(source) {
  const values = [];
  for (const match of source.matchAll(/"((?:\\.|[^"\\])*)"/g)) {
    try {
      values.push({ value: JSON.parse(`"${match[1]}"`), offset: match.index });
    } catch {
      failures.push(`Could not parse a prompt string at ${PROMPTS_PATH}:${lineNumber(source, match.index)}.`);
    }
  }
  return values;
}

function clauseAround(value, offset) {
  const before = value.slice(0, offset);
  const after = value.slice(offset);
  const clauseStart = Math.max(before.lastIndexOf("."), before.lastIndexOf(";"), before.lastIndexOf("!")) + 1;
  const endOffsets = [after.indexOf("."), after.indexOf(";"), after.indexOf("!")]
    .filter((candidate) => candidate >= 0);
  const clauseEnd = endOffsets.length > 0 ? offset + Math.min(...endOffsets) : value.length;
  return value.slice(clauseStart, clauseEnd).toLowerCase();
}

const page = read(PAGE_PATH);
const route = read(ROUTE_PATH);
const prompts = read(PROMPTS_PATH);
const canaryRunner = read(CANARY_RUNNER_PATH);
const envExample = read(ENV_EXAMPLE_PATH);

// A slip renderer is allowed. Portrait/identity compositors are not.
const imports = occurrences(page, /\bfrom\s+["']([^"']+)["']/g).map((match) => match[1]);
const forbiddenImport = imports.find((specifier) => (
  /(?:instant[-_]?portrait|face[-_]?(?:blend|composit)|portrait[-_]?composit|hosted[-_]?template)/i.test(specifier)
));
check(!forbiddenImport, `${PAGE_PATH} imports forbidden portrait compositor module "${forbiddenImport}".`);

const forbiddenClientSymbols = [
  /\bcreateAIPortrait\b/,
  /\bblendIdentity\b/,
  /\bfaceBlend\b/,
  /\bcompositePortrait\b/,
  /\bhostedTemplate\b/,
];
for (const pattern of forbiddenClientSymbols) {
  check(!pattern.test(page), `${PAGE_PATH} still references legacy portrait-compositing symbol ${pattern}.`);
}

for (const path of LEGACY_FILES) {
  check(!existsSync(resolve(ROOT, path)), `Legacy portrait compositor artifact still exists: ${path}.`);
}

const hostedTemplates = resolve(ROOT, "public/templates/hosted");
const hostedTemplateFiles = existsSync(hostedTemplates) && statSync(hostedTemplates).isDirectory()
  ? readdirSync(hostedTemplates).filter((entry) => !entry.startsWith("."))
  : [];
check(
  hostedTemplateFiles.length === 0,
  `Legacy hosted result templates still exist in public/templates/hosted (${hostedTemplateFiles.length} files).`
);

// The only template asset allowed in the client is a pick-card preview.
const templateLiterals = occurrences(page, /\/templates\/[^\n"'`]*/g).map((match) => match[0]);
check(
  templateLiterals.length === 1 && templateLiterals[0].startsWith("/templates/ai/"),
  `${PAGE_PATH} may contain only the /templates/ai/ pick-card preview path; found: ${templateLiterals.join(", ") || "none"}.`
);
const previewReferences = occurrences(page, /\bpreviewPath\s*\(/g);
check(
  previewReferences.length === 2,
  `${PAGE_PATH} must define previewPath once and use it once on a pick card; found ${previewReferences.length} references.`
);
check(
  /className="costume-preview"[\s\S]{0,240}backgroundImage:\s*`url\(\$\{previewPath\(side\.countryCode\)\}\)`/.test(page),
  "The approved preview asset is not isolated to the team-choice costume preview."
);

const submitStart = page.indexOf("const submitPhoto = useCallback");
const submitEnd = page.indexOf("\n  useEffect(() => {", submitStart);
check(submitStart >= 0 && submitEnd > submitStart, `Could not isolate submitPhoto in ${PAGE_PATH}.`);
const submitPhoto = submitStart >= 0 && submitEnd > submitStart
  ? page.slice(submitStart, submitEnd)
  : "";
check(
  !/(?:previewPath|\/templates\/|templatePath|hostedTemplate)/i.test(submitPhoto),
  "submitPhoto can reach a preview/template asset instead of hosted generation."
);

const resultStart = page.indexOf("function ResultScreen(");
const resultEnd = page.indexOf("\nfunction ", resultStart + 1);
check(resultStart >= 0, `Could not isolate the result screen in ${PAGE_PATH}.`);
const resultScreen = resultStart >= 0
  ? page.slice(resultStart, resultEnd > resultStart ? resultEnd : page.length)
  : "";
check(
  !/(?:previewPath|\/templates\/|templatePath|hostedTemplate)/i.test(resultScreen),
  "The result screen can render a preview/template asset as the final portrait."
);
check(
  /<canvas\b[^>]*ref=\{canvasRef\}/.test(resultScreen) &&
    /<ResultScreen[\s\S]{0,240}canvasRef=\{slipCanvasRef\}/.test(page),
  "The finished result is not rendered through the correlated slip canvas."
);

const portraitAssignments = occurrences(page, /portraitRef\.current\s*=\s*([^;\n]+)/g)
  .map((match) => match[1].trim());
const invalidPortraitAssignments = portraitAssignments.filter((assignment) => (
  assignment !== "null" && assignment !== "portrait" && assignment !== "restored.portrait"
));
check(
  invalidPortraitAssignments.length === 0,
  `portraitRef receives a non-generated source: ${invalidPortraitAssignments.join(", ")}.`
);
if (portraitAssignments.includes("restored.portrait")) {
  const persistedCorrelationChecks = [
    /value\.teamCode\s*!==\s*selection\.side\.countryCode/,
    /response\.headers\.get\(["']x-novig-selection["']\)\s*!==\s*metadata\.selection\.selectionKey/,
    /response\.headers\.get\(["']x-novig-job["']\)\s*!==\s*metadata\.jobId/,
    /portraitRef\.current\s*=\s*restored\.portrait[\s\S]{0,240}setSelection\(restored\.metadata\.selection\)/,
  ];
  for (const pattern of persistedCorrelationChecks) {
    check(
      pattern.test(page),
      "A persisted portrait can be restored without matching teamCode, selectionKey, and jobId."
    );
  }
}
check(
  /const\s+portrait\s*=\s*await\s+loadImage\(result\.imageBase64\)/.test(submitPhoto),
  "The final portrait is not loaded exclusively from the generation response."
);
check(
  /portrait:\s*portraitRef\.current/.test(page),
  "The slip renderer is not wired to the accepted generated portrait."
);

// Correlation must be checked before a generated image can become the portrait.
const responseIndex = submitPhoto.indexOf("const result =");
const portraitLoadIndex = submitPhoto.indexOf("const portrait = await loadImage(result.imageBase64)");
check(responseIndex >= 0 && portraitLoadIndex > responseIndex, "Could not isolate the generated-response acceptance gate.");
const acceptanceGate = responseIndex >= 0 && portraitLoadIndex > responseIndex
  ? submitPhoto.slice(responseIndex, portraitLoadIndex)
  : "";
const correlationChecks = [
  [/result\?\.status\s*!==\s*["']complete["']/, "complete status"],
  [/result\.jobId\s*!==\s*jobId/, "jobId"],
  [/result\.selectionKey\s*!==\s*selection\.selectionKey/, "selectionKey"],
  [/result\.teamCode\s*!==\s*selection\.side\.countryCode/, "teamCode"],
];
for (const [pattern, label] of correlationChecks) {
  check(pattern.test(acceptanceGate), `Generated success is accepted without verifying ${label}.`);
}
check(
  /JSON\.stringify\(\{[\s\S]*?\bjobId\b[\s\S]*?\bselectionKey:\s*selection\.selectionKey[\s\S]*?\bimageBase64\b[\s\S]*?\bteamCode:\s*selection\.side\.countryCode[\s\S]*?\}\)/.test(submitPhoto),
  "The generation request does not send jobId, selectionKey, imageBase64, and teamCode together."
);
check(
  /const\s+correlation:\s*Correlation\s*=\s*\{\s*jobId,\s*selectionKey,\s*teamCode\s*\}/.test(route),
  `${ROUTE_PATH} does not create a complete jobId + selectionKey + teamCode correlation tuple.`
);
check(
  /return\s+responseJson\(\{[\s\S]{0,240}\.\.\.correlation,[\s\S]{0,160}status:\s*["']complete["'][\s\S]{0,240}imageBase64:/.test(route),
  `${ROUTE_PATH} success does not echo the complete correlation tuple with the generated image.`
);

// A new encoding of unchanged pixels is still unchanged and must fail before release.
check(
  /import\s+sharp\s+from\s+["']sharp["']/.test(route),
  `${ROUTE_PATH} does not decode generated pixels for server-side transformation checks.`
);
check(
  /const\s+MIN_PERCEPTUAL_DIFFERENCE\s*=\s*0\.08/.test(route),
  `${ROUTE_PATH} no longer matches the client transformation threshold.`
);
check(
  /await\s+perceptualDifference\(input,\s*output\)\s*<\s*MIN_PERCEPTUAL_DIFFERENCE/.test(route) &&
    /throw\s+new\s+GenerationError\(["']unchanged_image["']\)/.test(route),
  `${ROUTE_PATH} can accept a visually unchanged re-encoded image.`
);

// The default Gateway edit must use AI SDK image generation with the selfie as a reference image.
check(
  /import\s*\{[^}]*\bgenerateImage\b[^}]*\}\s*from\s*["']ai["']/.test(route),
  `${ROUTE_PATH} does not import AI SDK generateImage.`
);
const gatewayGenerationStart = route.indexOf("async function generateWithGateway(");
const gatewayGenerationEnd = route.indexOf("\nasync function generatePortrait(", gatewayGenerationStart);
check(
  gatewayGenerationStart >= 0 && gatewayGenerationEnd > gatewayGenerationStart,
  `Could not isolate the Gateway image-generation adapter in ${ROUTE_PATH}.`
);
const gatewayGeneration = gatewayGenerationStart >= 0 && gatewayGenerationEnd > gatewayGenerationStart
  ? route.slice(gatewayGenerationStart, gatewayGenerationEnd)
  : "";
check(
  /await\s+generateImage\s*\(\s*\{/.test(gatewayGeneration),
  `${ROUTE_PATH} Gateway adapter does not call AI SDK generateImage.`
);
check(
  /\bmodel:\s*GATEWAY_MODEL\b/.test(gatewayGeneration),
  `${ROUTE_PATH} Gateway generateImage call does not use the configured Gateway image model.`
);
check(
  /\bprompt:\s*\{/.test(gatewayGeneration)
    && /\btext:\s*prompt\b/.test(gatewayGeneration)
    && /\bimages:\s*\[\s*image\.bytes\s*\]/.test(gatewayGeneration),
  `${ROUTE_PATH} Gateway generateImage prompt must include text and the parsed input bytes in prompt.images.`
);
check(
  !/\bfetch\s*\(/.test(gatewayGeneration),
  `${ROUTE_PATH} Gateway image adapter still uses a raw HTTP/chat request instead of generateImage.`
);
for (const legacyGatewayExtraction of [
  /\bextractGatewayImage\b/,
  /\bGatewayImageUrl\b/,
  /\bresult\.choices\b/,
  /\bmessage\.images\b/,
  /\bmessage\.content\b/,
]) {
  check(
    !legacyGatewayExtraction.test(route),
    `${ROUTE_PATH} still contains legacy Gateway chat image extraction ${legacyGatewayExtraction}.`
  );
}
check(
  /async\s+function\s+generateWithGemini\s*\(/.test(route),
  `${ROUTE_PATH} no longer retains the explicit direct Gemini fallback adapter.`
);
check(
  new RegExp(`AI_GATEWAY_IMAGE_MODEL\\s*\\|\\|\\s*["']${DEFAULT_GATEWAY_IMAGE_MODEL.replaceAll("/", "\\/")}["']`).test(route),
  `${ROUTE_PATH} Gateway image default must be ${DEFAULT_GATEWAY_IMAGE_MODEL}.`
);
check(
  canaryRunner.includes(`process.env.AI_GATEWAY_IMAGE_MODEL || "${DEFAULT_GATEWAY_IMAGE_MODEL}"`),
  `${CANARY_RUNNER_PATH} does not default to ${DEFAULT_GATEWAY_IMAGE_MODEL}.`
);
check(
  new RegExp(`^AI_GATEWAY_IMAGE_MODEL=${DEFAULT_GATEWAY_IMAGE_MODEL.replaceAll("/", "\\/")}$`, "m").test(envExample),
  `${ENV_EXAMPLE_PATH} does not default to ${DEFAULT_GATEWAY_IMAGE_MODEL}.`
);
check(
  route.includes("https://ai-gateway.vercel.sh/v1/credits")
    && route.includes("https://ai-gateway.vercel.sh/v1/models")
    && /balance\s*>\s*0/.test(route)
    && /model\.type\s*===\s*["']image["']/.test(route),
  `${ROUTE_PATH} Gateway readiness must authenticate against credits and verify the configured image model.`
);
check(
  !route.includes("ai-gateway.vercel.sh/v1/chat/completions")
    && !route.includes("AI_GATEWAY_PREFLIGHT_MODEL"),
  `${ROUTE_PATH} still uses the paid text-model compatibility probe.`
);

// Release proof must belong to this build and this full prompt/provider configuration.
for (const requiredBinding of [
  "VERCEL_GIT_COMMIT_SHA",
  "BOOTH_RELEASE_ARTIFACT_ID",
  "promptSuiteSha256",
  "AI_IMAGE_PROVIDER_VERIFIED_ARTIFACT_SHA256",
  "AI_IMAGE_PROVIDER_VERIFIED_CONFIG_SHA256",
  "AI_IMAGE_PROVIDER_VERIFIED_AT",
  "AI_IMAGE_PROVIDER_VERIFIED_EXPIRES_AT",
]) {
  check(
    route.includes(requiredBinding),
    `${ROUTE_PATH} release proof is missing ${requiredBinding}.`
  );
}
for (const requiredRunnerValue of [
  "AI_IMAGE_PROVIDER_VERIFIED_ARTIFACT_SHA256",
  "AI_IMAGE_PROVIDER_VERIFIED_CONFIG_SHA256",
  "AI_IMAGE_PROVIDER_VERIFIED_AT",
  "AI_IMAGE_PROVIDER_VERIFIED_EXPIRES_AT",
]) {
  check(
    canaryRunner.includes(requiredRunnerValue),
    `${CANARY_RUNNER_PATH} does not emit ${requiredRunnerValue}.`
  );
}

// Every current public choice needs a server-owned cohesive treatment.
const activeListMatch = prompts.match(/export\s+const\s+ACTIVE_TEAM_CODES\s*=\s*\[([\s\S]*?)\]\s*as\s+const/);
check(Boolean(activeListMatch), `Could not find ACTIVE_TEAM_CODES in ${PROMPTS_PATH}.`);
const activeCodes = activeListMatch
  ? occurrences(activeListMatch[1], /["']([A-Z0-9]{2,5})["']/g).map((match) => match[1])
  : [];
check(
  activeCodes.length === unique(activeCodes).length,
  `ACTIVE_TEAM_CODES contains duplicates: ${activeCodes.join(", ")}.`
);
check(
  sameMembers(activeCodes, EXPECTED_TEAM_CODES),
  `ACTIVE_TEAM_CODES must contain exactly the 18 booth teams. Expected ${EXPECTED_TEAM_CODES.join(", ")}; found ${activeCodes.join(", ")}.`
);

const treatmentsStart = prompts.indexOf("const TEAM_TREATMENTS");
const treatmentsEnd = prompts.indexOf("\nexport function parseActiveTeamCode", treatmentsStart);
check(treatmentsStart >= 0 && treatmentsEnd > treatmentsStart, `Could not isolate TEAM_TREATMENTS in ${PROMPTS_PATH}.`);
const treatments = treatmentsStart >= 0 && treatmentsEnd > treatmentsStart
  ? prompts.slice(treatmentsStart, treatmentsEnd)
  : "";
const treatmentCodes = occurrences(treatments, /^\s{2}([A-Z0-9]{2,5}):\s*\[/gm).map((match) => match[1]);
check(
  treatmentCodes.length === unique(treatmentCodes).length,
  `TEAM_TREATMENTS contains duplicate team prompts: ${treatmentCodes.join(", ")}.`
);
check(
  sameMembers(treatmentCodes, EXPECTED_TEAM_CODES),
  `TEAM_TREATMENTS must define all 18 active prompts. Missing: ${EXPECTED_TEAM_CODES.filter((code) => !treatmentCodes.includes(code)).join(", ") || "none"}; extra: ${treatmentCodes.filter((code) => !EXPECTED_TEAM_CODES.includes(code)).join(", ") || "none"}.`
);

for (const code of EXPECTED_TEAM_CODES) {
  const entryStart = treatments.search(new RegExp(`^\\s{2}${code}:\\s*\\[`, "m"));
  const remainder = entryStart >= 0 ? treatments.slice(entryStart) : "";
  const nextEntry = remainder.slice(1).search(/^\s{2}[A-Z0-9]{2,5}:\s*\[/m);
  const entry = entryStart >= 0
    ? remainder.slice(0, nextEntry >= 0 ? nextEntry + 1 : remainder.length)
    : "";
  check(entry.length >= 160, `${code} is missing a substantive cohesive team treatment.`);
}

check(
  /buildCohesivePortraitPrompt\(teamCode\)/.test(route),
  `${ROUTE_PATH} does not build the server-owned cohesive prompt for the validated teamCode.`
);
check(
  !/(?:from\s+["']@\/lib\/prompts["']|\bbuildPrompt\s*\()/.test(route),
  `${ROUTE_PATH} can reach the legacy client/theme prompt instead of the cohesive server prompt.`
);

const promptSectionStart = prompts.indexOf("const TEAM_TREATMENTS");
const promptSection = promptSectionStart >= 0 ? prompts.slice(promptSectionStart) : prompts;
const riskyInstruction = /\b(?:cut[ -]?out|opening|paste(?:[ -]?face)?)\b/gi;
const explicitProhibition = /\b(?:no|not|never|without|avoid|forbid|forbidden|prohibit|prohibited|cannot|can't|do not|don't|must not|mustn't)\b/i;
for (const { value, offset } of quotedStrings(promptSection)) {
  for (const match of value.matchAll(riskyInstruction)) {
    const clause = clauseAround(value, match.index);
    check(
      explicitProhibition.test(clause),
      `${PROMPTS_PATH}:${lineNumber(promptSection, offset)} contains a positive cutout/opening/paste-face instruction: "${clause.trim()}".`
    );
  }
}

// Marketing copy may use only the approved Novig language; legacy claims fail anywhere in app source.
const restrictedWording = [
  {
    label: "legacy marketplace wording",
    pattern: new RegExp(["peer", "to", "peer"].join("[\\s-]+"), "gi"),
  },
  {
    label: "legacy fee wording",
    pattern: new RegExp(["zero", "vig"].join("[\\s-]+"), "gi"),
  },
];
const sourceFiles = unique(SOURCE_ROOTS.flatMap(collectSourceFiles)).sort();
for (const path of sourceFiles) {
  const source = read(path);
  for (const { label, pattern } of restrictedWording) {
    pattern.lastIndex = 0;
    const match = pattern.exec(source);
    check(
      !match,
      `${path}:${match ? lineNumber(source, match.index) : 1} contains restricted ${label}.`
    );
  }
}

if (failures.length > 0) {
  console.error(`Cohesive portrait contract FAILED (${failures.length} failure${failures.length === 1 ? "" : "s"}):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Cohesive portrait contract passed: ${assertionCount} assertions, ${EXPECTED_TEAM_CODES.length} active team prompts, correlated generated-only final output.`
);
