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
import { createGuaranteedPortrait } from "@/lib/instant-portrait";
import { COUNTRIES, getCountry, type CountryTheme } from "@/lib/prompts";
import {
  cfbOpenersSlate,
  fallbackSlate,
  type LiveGame,
  type LiveSide,
  type SlateResponse,
} from "@/lib/slate";

type Screen = "pick" | "capture" | "processing" | "result";
type ExperienceMode = "world-cup" | "cfb";

interface Selection {
  game: LiveGame;
  side: LiveSide;
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
  "Fitting the colors.",
  "Painting the portrait.",
  "Framing the final slip.",
];

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
  context.fillStyle = "#202026";
  context.beginPath();
  context.ellipse(540, 400, 205, 235, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#c98e68";
  context.beginPath();
  context.ellipse(540, 430, 175, 215, 0, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#202026";
  context.beginPath();
  context.ellipse(540, 302, 180, 115, -0.08, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "#f5f1e9";
  context.beginPath();
  context.roundRect(245, 650, 590, 530, 180);
  context.fill();
  return canvas.toDataURL("image/jpeg", 0.92);
}

function photoIsUsable(image: HTMLImageElement): boolean {
  if (image.naturalWidth < 320 || image.naturalHeight < 320) return false;
  const aspect = image.naturalWidth / image.naturalHeight;
  return aspect > 0.45 && aspect < 2.2;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function templatePath(code: string): string {
  return `/templates/hosted/${code.toLowerCase()}.webp`;
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

  const chooseSide = useCallback((nextGame: LiveGame, nextSide: LiveSide) => {
    setSelection({ game: nextGame, side: nextSide });
    setCameraError(null);
    setProcessingError(null);
    setScreen("capture");
    celebratedRef.current = false;
    const template = new Image();
    template.src = templatePath(nextSide.countryCode);
    logEvent("side_pick", { game: nextGame.id, side: nextSide.countryCode });
  }, []);

  const submitPhoto = useCallback(async (source: string) => {
    if (!selection || submittingRef.current) return;
    submittingRef.current = true;
    setCameraError(null);
    setProcessingError(null);
    setScreen("processing");
    const startedAt = performance.now();
    try {
      const image = await loadImage(source);
      if (!photoIsUsable(image)) {
        throw new Error("Move back slightly so your face and shoulders fit in frame.");
      }
      const selectedCountry = getCountry(selection.side.countryCode) || COUNTRIES[0];
      const portraitSource = await createGuaranteedPortrait(image, selectedCountry);
      const elapsed = performance.now() - startedAt;
      if (elapsed < 900) {
        await new Promise((resolve) => window.setTimeout(resolve, 900 - elapsed));
      }
      portraitRef.current = await loadImage(portraitSource);
      setRenderVersion((version) => version + 1);
      setScreen("result");
      logEvent("hosted_portrait_ready", {
        country: selection.side.countryCode,
        durationMs: Math.round(performance.now() - startedAt),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The portrait could not be finished.";
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
        <p>One photo becomes a framed, team-styled Gallery Slip in seconds.</p>
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
        style={{ backgroundImage: `url(${templatePath(side.countryCode)})` }}
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
        <p>Center your face. We’ll handle the masterpiece.</p>
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
          <h1>{TEAM_PHRASES[country.code] || "Making your masterpiece."}</h1>
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
        <span className="eyebrow">FRAMED & FINISHED</span>
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
          <p>Your square still is ready now. Add a short animated finish if you want the bonus cut.</p>
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
