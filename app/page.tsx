"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { logEvent } from "@/lib/analytics";
import { renderCard, type Slip } from "@/lib/composite";
import { DEFAULT_CODE } from "@/lib/copy";
import { confettiBurst } from "@/lib/confetti";
import { COUNTRIES, getCountry, type CountryTheme } from "@/lib/prompts";
import {
  cfbOpenersSlate,
  fallbackSlate,
  type LiveGame,
  type LiveSide,
  type SlateResponse,
} from "@/lib/slate";

type Screen = "pick" | "checking" | "capture" | "processing" | "result";
type ExperienceMode = "world-cup" | "cfb";

interface Selection {
  game: LiveGame;
  side: LiveSide;
  selectionKey: string;
}

interface TimedRequest {
  controller: AbortController;
  timeout: number;
}

interface PreflightRequest extends TimedRequest {
  selectionKey: string;
}

interface ActiveGeneration extends TimedRequest {
  jobId: string;
  selectionKey: string;
}

interface GenerationResponse {
  jobId?: unknown;
  selectionKey?: unknown;
  teamCode?: unknown;
  status?: unknown;
  imageBase64?: unknown;
  error?: unknown;
}

interface MotionAsset {
  url: string;
  extension: "mp4" | "webm";
}

const TEAM_PHRASES: Record<string, string> = {
  USC: "Fight On.",
  ALA: "Roll Tide.",
  LSU: "Suck that Tiger d***.",
  UGA: "Go Dawgs.",
  UF: "Go Gators.",
};

const TEAM_GLYPHS: Record<string, string> = {
  USC: "⚔",
  SJSU: "🛡",
  ALA: "〰",
  ECAR: "☠",
  UGA: "🐶",
  TSU: "🐯",
  UF: "🐊",
  FAU: "🦉",
  LSU: "🐅",
  CLEM: "🐯",
};

const PROCESSING_LINES = [
  "Generating one cohesive AI portrait.",
  "Matching the light, texture, and character.",
  "Framing your cohesive final portrait.",
];

const PREFLIGHT_TIMEOUT_MS = 6_000;
const GENERATION_DEADLINE_MS = 45_000;
const NORMALIZED_PHOTO_SIZE = 1024;

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = source;
  });
}

function formatMoney(value: number | string): string {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : String(value);
}

function formatKickoff(game: LiveGame): string {
  if (game.state === "in") return "Live now";
  if (game.state === "post") return "Final";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(game.startTime));
}

function makeSlip(game: LiveGame, side: LiveSide): Slip {
  return {
    matchup: game.matchup,
    market: "Moneyline",
    side: side.side,
    odds: side.odds,
    stake: String(side.stake),
    toWin: String(side.toWin),
    probability: String(side.impliedProbability),
  };
}

function fixturePortrait(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const background = context.createLinearGradient(0, 0, 1080, 1080);
  background.addColorStop(0, "#dbc2aa");
  background.addColorStop(1, "#746153");
  context.fillStyle = background;
  context.fillRect(0, 0, 1080, 1080);
  context.fillStyle = "#171923";
  context.beginPath();
  context.roundRect(210, 660, 660, 500, 210);
  context.fill();
  context.fillStyle = "#a96d50";
  context.fillRect(470, 590, 140, 150);
  const skin = context.createRadialGradient(505, 375, 40, 540, 430, 250);
  skin.addColorStop(0, "#e2ad86");
  skin.addColorStop(1, "#b97556");
  context.fillStyle = skin;
  context.beginPath();
  context.ellipse(540, 425, 182, 230, -0.03, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#211d20";
  context.beginPath();
  context.ellipse(540, 285, 192, 128, -0.08, Math.PI, Math.PI * 2);
  context.fill();
  context.beginPath();
  context.moveTo(357, 350);
  context.quadraticCurveTo(390, 205, 555, 210);
  context.quadraticCurveTo(720, 225, 724, 385);
  context.quadraticCurveTo(660, 315, 585, 305);
  context.quadraticCurveTo(470, 345, 357, 350);
  context.fill();
  context.strokeStyle = "#37262a";
  context.lineWidth = 18;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(410, 394); context.quadraticCurveTo(458, 365, 500, 391);
  context.moveTo(580, 391); context.quadraticCurveTo(626, 364, 672, 396);
  context.stroke();
  context.fillStyle = "#f3efe8";
  context.beginPath(); context.ellipse(455, 425, 43, 23, 0, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.ellipse(625, 425, 43, 23, 0, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#3c6f78";
  context.beginPath(); context.arc(459, 426, 15, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(621, 426, 15, 0, Math.PI * 2); context.fill();
  context.fillStyle = "#15151a";
  context.beginPath(); context.arc(459, 426, 7, 0, Math.PI * 2); context.fill();
  context.beginPath(); context.arc(621, 426, 7, 0, Math.PI * 2); context.fill();
  context.strokeStyle = "rgba(104,57,44,.58)";
  context.lineWidth = 10;
  context.beginPath();
  context.moveTo(545, 430); context.quadraticCurveTo(525, 515, 565, 525);
  context.stroke();
  context.strokeStyle = "#7e3f45";
  context.lineWidth = 12;
  context.beginPath(); context.moveTo(470, 570); context.quadraticCurveTo(540, 610, 616, 564); context.stroke();
  return canvas.toDataURL("image/jpeg", 0.92);
}

function photoIsUsable(image: HTMLImageElement): boolean {
  if (image.naturalWidth < 320 || image.naturalHeight < 320) return false;
  const aspect = image.naturalWidth / image.naturalHeight;
  return aspect > 0.45 && aspect < 2.2;
}

function requestId(): string {
  return crypto.randomUUID();
}

function freezeSelection(game: LiveGame, side: LiveSide): Selection {
  const frozenSide = { ...side };
  return {
    selectionKey: requestId(),
    side: frozenSide,
    game: {
      ...game,
      broadcasts: [...game.broadcasts],
      home: { ...game.home },
      away: { ...game.away },
    },
  };
}

function normalizePhoto(image: HTMLImageElement): string {
  const sourceSide = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceX = (image.naturalWidth - sourceSide) / 2;
  const sourceY = (image.naturalHeight - sourceSide) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = NORMALIZED_PHOTO_SIZE;
  canvas.height = NORMALIZED_PHOTO_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("photo_normalization_failed");

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSide,
    sourceSide,
    0,
    0,
    NORMALIZED_PHOTO_SIZE,
    NORMALIZED_PHOTO_SIZE
  );
  return canvas.toDataURL("image/jpeg", 0.88);
}

function perceptualDifference(first: HTMLImageElement, second: HTMLImageElement): number {
  const sample = (image: HTMLImageElement): Uint8ClampedArray => {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("portrait_validation_failed");
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    context.drawImage(
      image,
      (image.naturalWidth - side) / 2,
      (image.naturalHeight - side) / 2,
      side,
      side,
      0,
      0,
      32,
      32
    );
    return context.getImageData(0, 0, 32, 32).data;
  };

  const firstPixels = sample(first);
  const secondPixels = sample(second);
  let difference = 0;
  for (let index = 0; index < firstPixels.length; index += 4) {
    difference += Math.abs(firstPixels[index] - secondPixels[index]);
    difference += Math.abs(firstPixels[index + 1] - secondPixels[index + 1]);
    difference += Math.abs(firstPixels[index + 2] - secondPixels[index + 2]);
  }
  return difference / (32 * 32 * 3 * 255);
}

function generationFailureMessage(status: number, errorCode: unknown): string {
  if (status === 504 || errorCode === "timeout") {
    return "This portrait took too long to finish.";
  }
  if (status === 413) return "That photo was too large to finish.";
  if (status === 422 || errorCode === "not_generated") {
    return "The AI couldn’t create a finished portrait from that photo.";
  }
  return "The portrait studio couldn’t finish this one.";
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function previewPath(code: string): string {
  return `/templates/ai/${code.toLowerCase()}.webp`;
}

export default function BoothPage() {
  const worldCupSlate = useMemo(() => fallbackSlate(), []);
  const collegeSlate = useMemo(() => cfbOpenersSlate(), []);
  const [mode, setMode] = useState<ExperienceMode>("world-cup");
  const [slate, setSlate] = useState<SlateResponse>(worldCupSlate);
  const [screen, setScreen] = useState<Screen>("pick");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [fixtureMode, setFixtureMode] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [motionAsset, setMotionAsset] = useState<MotionAsset | null>(null);
  const [motionBusy, setMotionBusy] = useState(false);

  const portraitRef = useRef<HTMLImageElement | null>(null);
  const slipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const submittingRef = useRef(false);
  const celebratedRef = useRef(false);
  const preflightRef = useRef<PreflightRequest | null>(null);
  const activeGenerationRef = useRef<ActiveGeneration | null>(null);

  const side = selection?.side;
  const game = selection?.game;
  const country = getCountry(side?.countryCode || "FRA") || COUNTRIES[0];
  const slip = selection ? makeSlip(selection.game, selection.side) : null;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialMode = params.get("cfb") === "1" ? "cfb" : "world-cup";
    setFixtureMode(params.get("fixture") === "1");
    setMode(initialMode);
    setSlate(initialMode === "cfb" ? collegeSlate : worldCupSlate);
  }, [collegeSlate, worldCupSlate]);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const endpoint = mode === "cfb" ? "/api/slate?mode=cfb" : "/api/slate";
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok) throw new Error("slate_unavailable");
        const next = (await response.json()) as SlateResponse;
        const expectedGames = mode === "cfb" ? 5 : 4;
        if (!cancelled && next.games.length >= expectedGames) setSlate(next);
      } catch {
        if (!cancelled) setSlate(mode === "cfb" ? collegeSlate : worldCupSlate);
      }
    };
    void refresh();
    const interval = window.setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [collegeSlate, mode, worldCupSlate]);

  useEffect(() => {
    return () => {
      if (motionAsset) URL.revokeObjectURL(motionAsset.url);
    };
  }, [motionAsset]);

  useEffect(() => {
    return () => {
      const preflight = preflightRef.current;
      if (preflight) {
        window.clearTimeout(preflight.timeout);
        preflight.controller.abort();
      }
      const generation = activeGenerationRef.current;
      if (generation) {
        window.clearTimeout(generation.timeout);
        generation.controller.abort();
      }
    };
  }, []);

  const switchMode = useCallback((next: ExperienceMode) => {
    if (next === mode || screen !== "pick") return;
    const params = new URLSearchParams(window.location.search);
    if (next === "cfb") params.set("cfb", "1");
    else params.delete("cfb");
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${params.size ? `?${params}` : ""}`
    );
    setMode(next);
    setSlate(next === "cfb" ? collegeSlate : worldCupSlate);
    logEvent("experience_mode", { mode: next });
  }, [collegeSlate, mode, screen, worldCupSlate]);

  const chooseSide = useCallback(async (nextGame: LiveGame, nextSide: LiveSide) => {
    if (preflightRef.current || activeGenerationRef.current || submittingRef.current) return;

    const frozen = freezeSelection(nextGame, nextSide);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), PREFLIGHT_TIMEOUT_MS);
    preflightRef.current = {
      controller,
      timeout,
      selectionKey: frozen.selectionKey,
    };

    setSelection(frozen);
    setCameraError(null);
    setProcessingError(null);
    setScreen("checking");
    celebratedRef.current = false;
    logEvent("side_pick", { game: nextGame.id, side: nextSide.countryCode });

    try {
      const response = await fetch(
        `/api/generate?teamCode=${encodeURIComponent(nextSide.countryCode)}`,
        {
        cache: "no-store",
        signal: controller.signal,
        }
      );
      const readiness = await response.json().catch(() => null) as {
        ready?: unknown;
      } | null;
      const active = preflightRef.current;
      if (!active || active.selectionKey !== frozen.selectionKey) return;
      if (!response.ok || readiness?.ready !== true) {
        throw new Error("generation_unavailable");
      }
      setScreen("capture");
      logEvent("portrait_studio_ready", { country: nextSide.countryCode });
    } catch {
      const active = preflightRef.current;
      if (!active || active.selectionKey !== frozen.selectionKey) return;
      setProcessingError("The portrait studio isn’t ready right now.");
      setScreen("processing");
      logEvent("portrait_studio_unavailable", { country: nextSide.countryCode });
    } finally {
      const active = preflightRef.current;
      if (active?.selectionKey === frozen.selectionKey) {
        window.clearTimeout(active.timeout);
        preflightRef.current = null;
      }
    }
  }, []);

  const submitPhoto = useCallback(async (source: string) => {
    if (!selection || submittingRef.current) return;
    submittingRef.current = true;
    setCameraError(null);
    setProcessingError(null);
    setScreen("processing");
    const startedAt = performance.now();
    let submittedJobId: string | null = null;
    try {
      const image = await loadImage(source);
      if (!photoIsUsable(image)) {
        throw new Error("Move back slightly so your face and shoulders fit in frame.");
      }
      const imageBase64 = normalizePhoto(image);
      const jobId = requestId();
      const controller = new AbortController();
      const remainingMs = GENERATION_DEADLINE_MS - (performance.now() - startedAt);
      if (remainingMs <= 0) throw new Error("This portrait took too long to finish.");
      const timeout = window.setTimeout(() => controller.abort(), remainingMs);
      submittedJobId = jobId;
      activeGenerationRef.current = {
        controller,
        timeout,
        jobId,
        selectionKey: selection.selectionKey,
      };

      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId,
          selectionKey: selection.selectionKey,
          imageBase64,
          teamCode: selection.side.countryCode,
        }),
        cache: "no-store",
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null) as GenerationResponse | null;
      const active = activeGenerationRef.current;
      if (
        !active ||
        active.jobId !== jobId ||
        active.selectionKey !== selection.selectionKey
      ) {
        return;
      }
      if (!response.ok) {
        throw new Error(generationFailureMessage(response.status, result?.error));
      }
      if (
        result?.status !== "complete" ||
        result.jobId !== jobId ||
        result.selectionKey !== selection.selectionKey ||
        result.teamCode !== selection.side.countryCode ||
        typeof result.imageBase64 !== "string" ||
        !result.imageBase64.startsWith("data:image/")
      ) {
        throw new Error("The finished portrait couldn’t be matched to this photo.");
      }

      const portrait = await loadImage(result.imageBase64);
      const portraitRatio = portrait.naturalWidth / portrait.naturalHeight;
      if (
        portrait.naturalWidth < 512 ||
        portrait.naturalHeight < 512 ||
        portraitRatio < 0.96 ||
        portraitRatio > 1.04 ||
        perceptualDifference(image, portrait) < 0.08
      ) {
        throw new Error("The AI didn’t create a complete transformed portrait.");
      }
      if (performance.now() - startedAt > GENERATION_DEADLINE_MS) {
        throw new Error("This portrait took too long to finish.");
      }
      const latest = activeGenerationRef.current;
      if (
        !latest ||
        latest.jobId !== jobId ||
        latest.selectionKey !== selection.selectionKey
      ) {
        return;
      }
      window.clearTimeout(latest.timeout);
      activeGenerationRef.current = null;
      portraitRef.current = portrait;
      setRenderVersion((version) => version + 1);
      setScreen("result");
      logEvent("ai_portrait_ready", {
        country: selection.side.countryCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      const active = activeGenerationRef.current;
      if (
        submittedJobId &&
        (!active || active.jobId !== submittedJobId || active.selectionKey !== selection.selectionKey)
      ) {
        return;
      }
      if (active) window.clearTimeout(active.timeout);
      activeGenerationRef.current = null;
      const timedOut = active?.controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError");
      const rawMessage = timedOut
        ? "This portrait took too long to finish."
        : error instanceof Error
          ? error.message
          : "The portrait could not be finished.";
      const message = /^(Move back|The |This )/.test(rawMessage)
        ? rawMessage
        : "The portrait studio couldn’t finish this one.";
      if (message.startsWith("Move back")) {
        setCameraError(message);
        setScreen("capture");
      } else {
        setProcessingError(message);
      }
      submittingRef.current = false;
    }
  }, [selection]);

  useEffect(() => {
    if (screen !== "result" || !portraitRef.current || !slipCanvasRef.current || !slip || !game) {
      return;
    }
    let cancelled = false;
    const draw = async () => {
      if (!slipCanvasRef.current || !portraitRef.current) return;
      await renderCard(slipCanvasRef.current, {
        portrait: portraitRef.current,
        country,
        status: "LOCKED",
        slip,
        style: "scoreboard",
        code: DEFAULT_CODE,
        seed: country.seed,
        round: game.round,
        venue: game.venue,
      });
      if (!cancelled && !celebratedRef.current && !prefersReducedMotion()) {
        celebratedRef.current = true;
        confettiBurst([country.bg, country.accent, "#1ca3f5", "#f5f1e9"]);
      }
    };
    void draw();
    return () => {
      cancelled = true;
    };
  }, [country, game, renderVersion, screen, slip]);

  const downloadStill = useCallback(() => {
    const canvas = slipCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `novig-${country.code.toLowerCase()}-gallery-slip.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      logEvent("download", { format: "png", country: country.code });
    }, "image/png");
  }, [country.code]);

  const shareStill = useCallback(async () => {
    const canvas = slipCanvasRef.current;
    if (!canvas) return;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;
    const file = new File([blob], `novig-${country.code.toLowerCase()}-slip.png`, { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "My Novig Gallery Slip" });
      logEvent("share", { country: country.code });
    } else {
      downloadStill();
    }
  }, [country.code, downloadStill]);

  const startMotion = useCallback(async () => {
    const canvas = slipCanvasRef.current;
    if (!canvas || motionBusy) return;
    setMotionBusy(true);
    try {
      const { createMotionClip } = await import("@/lib/motion");
      const clip = await createMotionClip(canvas, {
        accentColors: [country.bg, country.accent],
      });
      if (motionAsset) URL.revokeObjectURL(motionAsset.url);
      setMotionAsset({ url: URL.createObjectURL(clip.blob), extension: clip.extension });
      logEvent("motion_ready", { country: country.code, type: clip.mimeType });
    } catch {
      setProcessingError("Motion export is not supported in this browser. Your still slip is ready.");
    } finally {
      setMotionBusy(false);
    }
  }, [country, motionAsset, motionBusy]);

  const downloadMotion = useCallback(() => {
    if (!motionAsset) return;
    const link = document.createElement("a");
    link.href = motionAsset.url;
    link.download = `novig-${country.code.toLowerCase()}-motion-slip.${motionAsset.extension}`;
    link.click();
  }, [country.code, motionAsset]);

  const startOver = useCallback(() => {
    const preflight = preflightRef.current;
    if (preflight) {
      window.clearTimeout(preflight.timeout);
      preflight.controller.abort();
      preflightRef.current = null;
    }
    const generation = activeGenerationRef.current;
    if (generation) {
      window.clearTimeout(generation.timeout);
      generation.controller.abort();
      activeGenerationRef.current = null;
    }
    portraitRef.current = null;
    submittingRef.current = false;
    celebratedRef.current = false;
    setSelection(null);
    setCameraError(null);
    setProcessingError(null);
    setMotionBusy(false);
    setMotionAsset((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
    setScreen("pick");
    logEvent("booth_reset");
  }, []);

  return (
    <main className={`app-shell screen-${screen}`}>
      <SiteHeader mode={mode} sourceStatus={slate.sourceStatus} />

      {screen === "pick" && (
        <PickScreen
          mode={mode}
          slate={slate}
          onMode={switchMode}
          onSide={chooseSide}
        />
      )}

      {screen === "checking" && selection && (
        <StudioCheckScreen country={country} />
      )}

      {screen === "capture" && selection && (
        <CaptureScreen
          key={`${selection.game.id}:${selection.side.countryCode}:${cameraError || "ready"}`}
          country={country}
          matchup={selection.game.matchup}
          error={cameraError}
          fixtureMode={fixtureMode}
          onPhoto={submitPhoto}
          onBack={startOver}
        />
      )}

      {screen === "processing" && selection && (
        <ProcessingScreen country={country} error={processingError} onReset={startOver} />
      )}

      {screen === "result" && selection && slip && (
        <ResultScreen
          country={country}
          canvasRef={slipCanvasRef}
          motionAsset={motionAsset}
          motionBusy={motionBusy}
          notice={processingError}
          onSave={downloadStill}
          onShare={shareStill}
          onMotion={startMotion}
          onSaveMotion={downloadMotion}
          onReset={startOver}
        />
      )}

      <footer className="site-footer">
        <span>novig: for the cup</span>
        <span>Built for the booth • 2026</span>
      </footer>
    </main>
  );
}

function SiteHeader({ mode, sourceStatus }: { mode: ExperienceMode; sourceStatus: SlateResponse["sourceStatus"] }) {
  return (
    <header className="site-header">
      <div className="brand-lockup">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="brand-mark" src="/brand/novig-mark-blue.png" alt="" aria-hidden="true" />
        <div className="brand-copy">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="brand-wordmark" src="/brand/novig-wordmark.svg" alt="Novig" />
          <span>{mode === "cfb" ? "COLLEGE FOOTBALL" : "WORLD CUP EDITION"}</span>
        </div>
      </div>
      <div className={`slate-status ${sourceStatus === "live" ? "is-live" : ""}`}>
        <i aria-hidden="true" />
        {sourceStatus === "live" ? "Live slate" : "Verified slate"}
      </div>
    </header>
  );
}

function PickScreen({
  mode,
  slate,
  onMode,
  onSide,
}: {
  mode: ExperienceMode;
  slate: SlateResponse;
  onMode: (mode: ExperienceMode) => void;
  onSide: (game: LiveGame, side: LiveSide) => void;
}) {
  return (
    <section className="pick-view">
      <div className="pick-hero">
        <span className="eyebrow">THE 2026 PORTRAIT BOOTH</span>
        <h1>Pick a side.<br /><em>Become the moment.</em></h1>
        <p>One photo becomes a funny, AI-created team character in seconds.</p>
      </div>

      <div className="league-switch" role="tablist" aria-label="Choose a league">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "world-cup"}
          onClick={() => onMode("world-cup")}
        >
          <span>01</span>
          <strong>World Cup</strong>
          <small>Four quarterfinals</small>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cfb"}
          onClick={() => onMode("cfb")}
        >
          <span>02</span>
          <strong>College Football</strong>
          <small>Five season openers</small>
        </button>
      </div>

      <div className="slate-heading">
        <div>
          <span>{mode === "cfb" ? "OPENING WEEK" : "QUARTERFINALS"}</span>
          <h2>Every matchup. Every side.</h2>
        </div>
        <p>Schedule-verified • $50 demo lines</p>
      </div>

      <div className="matchup-list">
        {slate.games.map((game, index) => (
          <MatchupCard key={game.id} game={game} index={index + 1} onSide={onSide} />
        ))}
      </div>
    </section>
  );
}

function MatchupCard({
  game,
  index,
  onSide,
}: {
  game: LiveGame;
  index: number;
  onSide: (game: LiveGame, side: LiveSide) => void;
}) {
  return (
    <article className="matchup-card">
      <div className="matchup-meta">
        <span className="matchup-number">{String(index).padStart(2, "0")}</span>
        <div>
          <strong>{formatKickoff(game)}</strong>
          <span>{game.venue} • {game.location}</span>
        </div>
        <span className={`game-state state-${game.state}`}>{game.status}</span>
      </div>
      <div className="side-grid">
        {[game.home, game.away].map((teamSide) => (
          <SideButton key={teamSide.countryCode} game={game} side={teamSide} onClick={() => onSide(game, teamSide)} />
        ))}
      </div>
    </article>
  );
}

function SideButton({ game, side, onClick }: { game: LiveGame; side: LiveSide; onClick: () => void }) {
  const theme = getCountry(side.countryCode) || COUNTRIES[0];
  const phrase = TEAM_PHRASES[side.countryCode];
  const isCollege = Boolean(TEAM_GLYPHS[side.countryCode]);
  return (
    <button
      type="button"
      className="side-button"
      onClick={onClick}
      style={{
        "--team": theme.bg,
        "--team-accent": theme.accent,
        "--team-ink": theme.ink,
      } as CSSProperties}
      aria-label={`Choose ${side.side} in ${game.matchup}`}
    >
      <span
        className="costume-preview"
        style={{ backgroundImage: `url(${previewPath(side.countryCode)})` }}
        aria-hidden="true"
      />
      <span className="side-overlay" aria-hidden="true" />
      <span className="side-content">
        <span className="side-flag" aria-hidden="true">{isCollege ? TEAM_GLYPHS[side.countryCode] : theme.flag}</span>
        <span className="side-name">{side.side}</span>
        {phrase && <span className="side-phrase">{phrase}</span>}
        <span className="side-numbers">
          <span><small>ODDS</small><b>{side.odds}</b></span>
          <span><small>CHANCE</small><b>{side.impliedProbability}%</b></span>
          <span><small>TO WIN</small><b>${formatMoney(side.toWin)}</b></span>
        </span>
        <span className="choose-label">Choose {side.side}<i aria-hidden="true">↗</i></span>
      </span>
    </button>
  );
}

function CaptureScreen({
  country,
  matchup,
  error,
  fixtureMode,
  onPhoto,
  onBack,
}: {
  country: CountryTheme;
  matchup: string;
  error: string | null;
  fixtureMode: boolean;
  onPhoto: (source: string) => void;
  onBack: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [captured, setCaptured] = useState(false);
  const [fixtureSource, setFixtureSource] = useState<string | null>(null);

  useEffect(() => {
    if (fixtureMode) {
      const source = fixturePortrait();
      setFixtureSource(source);
      setReady(Boolean(source));
      return;
    }
    let active = true;
    let stream: MediaStream | null = null;
    const openCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1440 },
            height: { ideal: 1440 },
          },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch {
        if (active) {
          setDenied(true);
          logEvent("camera_denied");
        }
      }
    };
    void openCamera();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [attempt, fixtureMode]);

  const snap = useCallback(() => {
    if (!ready || captured) return;
    if (fixtureSource) {
      setCaptured(true);
      onPhoto(fixtureSource);
      return;
    }
    const video = videoRef.current;
    if (!video?.videoWidth) return;
    const canvas = document.createElement("canvas");
    const sourceSide = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = sourceSide;
    canvas.height = sourceSide;
    const context = canvas.getContext("2d");
    if (!context) return;
    const sourceX = (video.videoWidth - sourceSide) / 2;
    const sourceY = (video.videoHeight - sourceSide) / 2;
    context.translate(sourceSide, 0);
    context.scale(-1, 1);
    context.drawImage(video, sourceX, sourceY, sourceSide, sourceSide, 0, 0, sourceSide, sourceSide);
    setCaptured(true);
    onPhoto(canvas.toDataURL("image/jpeg", 0.92));
    logEvent("capture_snap", { country: country.code });
  }, [captured, country.code, fixtureSource, onPhoto, ready]);

  return (
    <section className="capture-view">
      <button type="button" className="back-button" onClick={onBack}>← Change team</button>
      <div className="capture-copy">
        <span className="eyebrow">{country.flag} {matchup}</span>
        <h1>Say cheese.</h1>
        <p>Center your face. We’ll build the AI character.</p>
      </div>
      <div className="camera-stage" style={{ "--team": country.bg, "--team-accent": country.accent } as CSSProperties}>
        {!denied ? (
          <>
            {fixtureSource ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fixtureSource} alt="Camera preview" />
            ) : (
              <video ref={videoRef} autoPlay muted playsInline aria-label="Camera preview" />
            )}
            <div className="face-guide" aria-hidden="true"><span>Face here</span></div>
            <div className="camera-grain" aria-hidden="true" />
          </>
        ) : (
          <div className="camera-denied">
            <span aria-hidden="true">◎</span>
            <h2>Camera access needed.</h2>
            <p>Allow the camera, then try once more.</p>
          </div>
        )}
      </div>
      {error && <p className="capture-error" role="alert">{error}</p>}
      {denied ? (
        <button
          type="button"
          className="shutter"
          onClick={() => { setDenied(false); setReady(false); setAttempt((value) => value + 1); }}
        >
          Try camera again
        </button>
      ) : (
        <button type="button" className="shutter" disabled={!ready || captured} onClick={snap}>
          <span aria-hidden="true" />
          {captured ? "Photo taken" : "Take photo"}
        </button>
      )}
    </section>
  );
}

function StudioCheckScreen({ country }: { country: CountryTheme }) {
  const collegeGlyph = TEAM_GLYPHS[country.code];
  return (
    <section
      className="processing-view"
      style={{ "--team": country.bg, "--team-accent": country.accent } as CSSProperties}
      aria-live="polite"
    >
      <div className={`team-animation ${collegeGlyph ? "college-animation" : "flag-animation"}`} aria-hidden="true">
        <span>{collegeGlyph || country.flag}</span>
        <i />
      </div>
      <span className="eyebrow">{country.name.toUpperCase()} PORTRAIT</span>
      <h1>Getting the portrait studio ready.</h1>
      <p>One quick check, then the camera opens.</p>
      <div className="progress-track" aria-hidden="true"><i /></div>
    </section>
  );
}

function ProcessingScreen({ country, error, onReset }: { country: CountryTheme; error: string | null; onReset: () => void }) {
  const [line, setLine] = useState(0);
  useEffect(() => {
    if (error) return;
    const interval = window.setInterval(() => setLine((value) => (value + 1) % PROCESSING_LINES.length), 1200);
    return () => window.clearInterval(interval);
  }, [error]);
  const collegeGlyph = TEAM_GLYPHS[country.code];
  return (
    <section className="processing-view" style={{ "--team": country.bg, "--team-accent": country.accent } as CSSProperties}>
      {error ? (
        <div className="processing-error">
          <span aria-hidden="true">{country.flag}</span>
          <h1>That one didn’t finish.</h1>
          <p>{error}</p>
          <button type="button" className="primary-action" onClick={onReset}>Start over</button>
        </div>
      ) : (
        <>
          <div className={`team-animation ${collegeGlyph ? "college-animation" : "flag-animation"}`} aria-hidden="true">
            <span>{collegeGlyph || country.flag}</span>
            <i />
          </div>
          <span className="eyebrow">{country.name.toUpperCase()} PORTRAIT</span>
          <h1>{TEAM_PHRASES[country.code] || "Generating one cohesive portrait."}</h1>
          <p key={line}>{PROCESSING_LINES[line]}</p>
          <div className="progress-track" aria-hidden="true"><i /></div>
        </>
      )}
    </section>
  );
}

function ResultScreen({
  country,
  canvasRef,
  motionAsset,
  motionBusy,
  notice,
  onSave,
  onShare,
  onMotion,
  onSaveMotion,
  onReset,
}: {
  country: CountryTheme;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  motionAsset: MotionAsset | null;
  motionBusy: boolean;
  notice: string | null;
  onSave: () => void;
  onShare: () => void;
  onMotion: () => void;
  onSaveMotion: () => void;
  onReset: () => void;
}) {
  return (
    <section className="result-view">
      <div className="result-heading">
        <h1>Your masterpiece, sir.</h1>
      </div>
      <div className="result-layout">
        <div className="slip-stage">
          <canvas
            ref={canvasRef}
            className="final-slip"
            role="img"
            aria-label={`Square Gallery Slip for ${country.name}`}
          />
          <span className="slip-edition">ONE OF ONE</span>
        </div>
        <aside className="result-panel">
          <span className="result-number">01</span>
          <h2>Ready for the group chat.</h2>
          <p>Your AI character is framed in the square slip. Add a short animated finish if you want the bonus cut.</p>
          <div className="result-actions">
            <button type="button" className="primary-action" onClick={onSave}>Save slip</button>
            <button type="button" className="secondary-action" onClick={onShare}>Share</button>
            {!motionAsset ? (
              <button type="button" className="motion-action" onClick={onMotion} disabled={motionBusy}>
                <span aria-hidden="true">▶</span>
                {motionBusy ? "Making motion cut…" : "Make it move"}
                <small>4-second bonus video</small>
              </button>
            ) : (
              <button type="button" className="motion-action is-ready" onClick={onSaveMotion}>
                <span aria-hidden="true">↓</span>
                Save motion cut
                <small>{motionAsset.extension.toUpperCase()} • square</small>
              </button>
            )}
          </div>
          {notice && <p className="result-notice" role="status">{notice}</p>}
          <button type="button" className="next-fan" onClick={onReset}>Next fan <span aria-hidden="true">→</span></button>
        </aside>
      </div>
      {motionAsset && (
        <div className="motion-preview">
          <div>
            <span className="eyebrow">BONUS CUT</span>
            <h2>Your slip, in motion.</h2>
          </div>
          <video src={motionAsset.url} autoPlay muted loop playsInline controls aria-label="Animated Gallery Slip preview" />
        </div>
      )}
    </section>
  );
}
