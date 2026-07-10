"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { renderCard, type Slip } from "@/lib/composite";
import { DEFAULT_CODE } from "@/lib/copy";
import { confettiBurst } from "@/lib/confetti";
import { logEvent } from "@/lib/analytics";
import { createGuaranteedPortrait } from "@/lib/instant-portrait";
import { COUNTRIES, getCountry, type CountryTheme } from "@/lib/prompts";
import {
  CFB_TEAM_CODES,
  cfbOpenersSlate,
  fallbackSlate,
  type LiveGame,
  type LiveSide,
  type SlateResponse,
} from "@/lib/slate";

type Screen = "pick" | "preflight" | "capture" | "processing" | "result";
type ExperienceMode = "world-cup" | "cfb";

interface CodexImageJob {
  id: string;
  status: "queued" | "complete";
  countryCode: string;
  countryName: string;
  resultPath: string;
  createdAt: string;
  resultRevision?: string;
  imageBase64?: string;
}

interface PersistedBoothSession {
  version: 1;
  experienceMode: ExperienceMode;
  countryCode: string;
  slip: Slip;
  game: LiveGame;
  job: CodexImageJob;
  capturedImage: string;
}

const ACTIVE_SESSION_KEY = "novig-booth-active-session-v1";
const GUARANTEED_RESULT_MS = 30_000;
const reattachedJobIds = new Set<string>();
const PROCESSING_LINES = [
  "Dressing the photo.",
  "Adding the live number.",
  "Finishing the slip.",
];

const INITIAL_SLIP: Slip = {
  matchup: "France vs Morocco",
  market: "Moneyline",
  side: "France",
  odds: "-170",
  stake: "50",
  toWin: "29.41",
  probability: "63",
};

const TEAM_PHRASES: Record<string, string> = {
  USC: "Fight On.",
  ALA: "Roll Tide.",
  LSU: "Suck that Tiger d***.",
  UGA: "Go Dawgs.",
  UF: "Go Gators.",
};

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = src;
  });
}

function passesPhotoShapeCheck(image: HTMLImageElement): boolean {
  if (image.naturalWidth < 320 || image.naturalHeight < 320) return false;
  const aspect = image.naturalWidth / image.naturalHeight;
  return aspect > 0.4 && aspect < 2.5;
}

async function normalizePhoto(image: HTMLImageElement): Promise<string> {
  const maxSide = 1536;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

function formatDollars(value: number | string): string {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return String(value);
  return parsed.toLocaleString("en-US", { maximumFractionDigits: 2 });
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

function slipFromSide(game: LiveGame, side: LiveSide): Slip {
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

function createFixturePortrait(): string {
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 1200;
  const context = canvas.getContext("2d");
  if (!context) return "";
  const background = context.createLinearGradient(0, 0, 900, 1200);
  background.addColorStop(0, "#173D67");
  background.addColorStop(1, "#7A2E51");
  context.fillStyle = background;
  context.fillRect(0, 0, 900, 1200);
  context.fillStyle = "#D9A77F";
  context.beginPath();
  context.arc(450, 390, 170, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#141820";
  context.beginPath();
  context.arc(450, 335, 178, Math.PI, Math.PI * 2);
  context.fill();
  context.fillStyle = "#ECE7DE";
  context.beginPath();
  context.roundRect(180, 590, 540, 680, 190);
  context.fill();
  return canvas.toDataURL("image/jpeg", 0.9);
}

function readPersistedSession(): PersistedBoothSession | null {
  try {
    const value = window.localStorage.getItem(ACTIVE_SESSION_KEY);
    return value ? JSON.parse(value) as PersistedBoothSession : null;
  } catch {
    return null;
  }
}

function writePersistedSession(session: PersistedBoothSession): void {
  try {
    window.localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(session));
  } catch {
    // The live in-memory flow remains available if local storage is full or disabled.
  }
}

function updatePersistedJob(job: CodexImageJob): void {
  const session = readPersistedSession();
  if (!session || session.job.id !== job.id) return;
  writePersistedSession({ ...session, job: { ...job, imageBase64: undefined } });
}

export default function BoothPage() {
  const initialFallback = useMemo(() => fallbackSlate(), []);
  const [screen, setScreen] = useState<Screen>("pick");
  const [slate, setSlate] = useState<SlateResponse>(initialFallback);
  const [selectedGame, setSelectedGame] = useState<LiveGame | null>(null);
  const [countryCode, setCountryCode] = useState("FRA");
  const [slip, setSlip] = useState<Slip>(INITIAL_SLIP);
  const [codexJob, setCodexJob] = useState<CodexImageJob | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [preflightError, setPreflightError] = useState<string | null>(null);
  const [renderVersion, setRenderVersion] = useState(0);
  const [fixtureMode, setFixtureMode] = useState(false);
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>("world-cup");
  const [guaranteedResultJobId, setGuaranteedResultJobId] = useState<string | null>(null);

  const portraitRef = useRef<HTMLImageElement | null>(null);
  const slipCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const submittingRef = useRef(false);
  const jobStartedAtRef = useRef<number | null>(null);
  const celebratedRef = useRef(false);
  const guaranteedPortraitRef = useRef<string | null>(null);

  const liveGame =
    slate.games.find((game) => game.id === slate.activeGameId) || slate.games[0];
  const activeGame = selectedGame || liveGame;
  const country = getCountry(countryCode) || COUNTRIES[0];
  const slateChoices = slate.games.flatMap((game) =>
    [game.home, game.away]
      .filter((side) =>
        experienceMode === "cfb"
          ? CFB_TEAM_CODES.includes(side.countryCode)
          : slate.eligibleCountryCodes.includes(side.countryCode)
      )
      .map((side) => ({ game, side }))
  );

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const nextMode: ExperienceMode = searchParams.get("cfb") === "1" ? "cfb" : "world-cup";
    setFixtureMode(searchParams.get("fixture") === "1");
    setExperienceMode(nextMode);

    const session = readPersistedSession();
    if (
      !session ||
      session.version !== 1 ||
      session.experienceMode !== nextMode ||
      !getCountry(session.countryCode)
    ) {
      return;
    }
    let cancelled = false;
    void loadImage(session.capturedImage).then(async (image) => {
      if (cancelled) return;
      portraitRef.current = image;
      if (session.job.status === "queued") {
        const sessionCountry = getCountry(session.countryCode);
        if (sessionCountry) {
          guaranteedPortraitRef.current = await createGuaranteedPortrait(image, sessionCountry);
        }
        jobStartedAtRef.current = new Date(session.job.createdAt).getTime();
      }
      if (cancelled) return;
      setSelectedGame(session.game);
      setCountryCode(session.countryCode);
      setSlip(session.slip);
      setCodexJob(session.job);
      setScreen(session.job.status === "complete" ? "result" : "processing");
      setRenderVersion((version) => version + 1);
    }).catch(() => {
      window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const modeFallback = experienceMode === "cfb" ? cfbOpenersSlate() : initialFallback;
    const loadSlate = async () => {
      try {
        const endpoint = experienceMode === "cfb" ? "/api/slate?mode=cfb" : "/api/slate";
        const response = await fetch(endpoint, { cache: "no-store" });
        if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) {
          throw new Error("slate_unavailable");
        }
        const nextSlate = (await response.json()) as SlateResponse;
        if (!cancelled && nextSlate.games.length) {
          setSlate(
            experienceMode === "world-cup" && nextSlate.games.length < 4
              ? initialFallback
              : nextSlate
          );
        }
      } catch {
        if (!cancelled) setSlate(modeFallback);
      }
    };
    void loadSlate();
    const timer = window.setInterval(loadSlate, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [experienceMode, initialFallback]);

  const changeExperienceMode = useCallback((mode: ExperienceMode) => {
    if (mode === experienceMode || screen !== "pick") return;
    const params = new URLSearchParams(window.location.search);
    if (mode === "cfb") params.set("cfb", "1");
    else params.delete("cfb");
    window.history.replaceState({}, "", `${window.location.pathname}${params.size ? `?${params}` : ""}`);
    setExperienceMode(mode);
    setSlate(mode === "cfb" ? cfbOpenersSlate() : initialFallback);
    setSelectedGame(null);
    setCountryCode(mode === "cfb" ? "USC" : "FRA");
    setPreflightError(null);
    logEvent("experience_mode", { mode });
  }, [experienceMode, initialFallback, screen]);

  const chooseSide = useCallback(async (game: LiveGame, side: LiveSide) => {
    celebratedRef.current = false;
    setSelectedGame(game);
    setCountryCode(side.countryCode);
    setSlip(slipFromSide(game, side));
    setCaptureError(null);
    setProcessingError(null);
    setPreflightError(null);
    setScreen("preflight");
    logEvent("side_pick", { game: game.id, side: side.countryCode });
    try {
      const canvas = document.createElement("canvas");
      if (!canvas.getContext("2d")) throw new Error("Portrait rendering is not available here.");
      const response = await fetch(
        `/api/codex-image-job?preflight=1&countryCode=${encodeURIComponent(side.countryCode)}`,
        { cache: "no-store" }
      );
      const check = await response.json() as { ready?: boolean; maxDeliveryMs?: number; message?: string };
      if (!response.ok || !check.ready || Number(check.maxDeliveryMs) > 45_000) {
        throw new Error(check.message || "The portrait engine is not ready.");
      }
      setScreen("capture");
      logEvent("portrait_preflight_passed", { side: side.countryCode });
    } catch (error) {
      setPreflightError(error instanceof Error ? error.message : "The portrait engine is not ready.");
      setScreen("pick");
      logEvent("portrait_preflight_failed", { side: side.countryCode });
    }
  }, []);

  const finishGuaranteedPortrait = useCallback(async (source: string, jobId: string | null) => {
    try {
      portraitRef.current = await loadImage(source);
      setGuaranteedResultJobId(jobId);
      setProcessingError(null);
      setScreen("result");
      setRenderVersion((version) => version + 1);
      submittingRef.current = false;
      logEvent("guaranteed_portrait_ready", { country: countryCode, job: jobId || "fixture" });
    } catch {
      setProcessingError("The guaranteed portrait could not be loaded.");
    }
  }, [countryCode]);

  const finishGeneratedPortrait = useCallback(async (
    source: string,
    completedJob?: CodexImageJob
  ) => {
    try {
      portraitRef.current = await loadImage(source);
      guaranteedPortraitRef.current = null;
      setGuaranteedResultJobId(null);
      jobStartedAtRef.current = null;
      setCodexJob((currentJob) => {
        const finished = completedJob || currentJob;
        if (!finished) return null;
        const storedJob = { ...finished, status: "complete" as const, imageBase64: undefined };
        updatePersistedJob(storedJob);
        return storedJob;
      });
      setProcessingError(null);
      setScreen("result");
      setRenderVersion((version) => version + 1);
      submittingRef.current = false;
      logEvent("generate_done", { country: countryCode, provider: "codex", mock: false });
    } catch {
      jobStartedAtRef.current = null;
      setCodexJob(null);
      if (!portraitRef.current) {
        setProcessingError("The finished portrait could not be loaded.");
      }
    }
  }, [countryCode]);

  useEffect(() => {
    if (
      (screen !== "processing" && screen !== "result") ||
      processingError
    ) {
      return;
    }

    if (
      screen === "result" &&
      codexJob?.status === "queued" &&
      guaranteedResultJobId !== codexJob.id &&
      !fixtureMode
    ) {
      setScreen("processing");
      return;
    }

    if (codexJob?.status === "complete") {
      let cancelled = false;
      let revisionTimer: number | undefined;
      const checkForRevision = async () => {
        try {
          const metadataResponse = await fetch(
            `/api/codex-image-job?id=${encodeURIComponent(codexJob.id)}&meta=1`,
            { cache: "no-store" }
          );
          if (!metadataResponse.ok || cancelled) return;
          const metadata = (await metadataResponse.json()) as CodexImageJob;
          if (
            metadata.status !== "complete" ||
            !metadata.resultRevision ||
            metadata.resultRevision === codexJob.resultRevision
          ) {
            return;
          }
          const imageResponse = await fetch(
            `/api/codex-image-job?id=${encodeURIComponent(codexJob.id)}`,
            { cache: "no-store" }
          );
          if (!imageResponse.ok || cancelled) return;
          const revisedJob = (await imageResponse.json()) as CodexImageJob;
          if (revisedJob.status === "complete" && revisedJob.imageBase64) {
            await finishGeneratedPortrait(revisedJob.imageBase64, revisedJob);
          }
        } catch {
          // Keep the current finished slip if a revision check is interrupted.
        }
      };
      void checkForRevision();
      revisionTimer = window.setInterval(() => void checkForRevision(), 2500);
      return () => {
        cancelled = true;
        if (revisionTimer !== undefined) window.clearInterval(revisionTimer);
      };
    }

    if (!codexJob) {
      if (screen !== "result" || fixtureMode) return;
      let cancelled = false;
      let recoveryTimer: number | undefined;
      const reattachLatestJob = async () => {
        try {
          const response = await fetch("/api/codex-image-job", { cache: "no-store" });
          if (!response.ok || cancelled) return;
          const job = (await response.json()) as CodexImageJob;
          if (
            cancelled ||
            !job.id ||
            job.countryCode !== countryCode
          ) {
            return;
          }
          if (job.status === "complete" && job.imageBase64) {
            await finishGeneratedPortrait(job.imageBase64, job);
            return;
          }
          if (job.status === "queued" && !reattachedJobIds.has(job.id)) {
            reattachedJobIds.add(job.id);
            jobStartedAtRef.current = Date.now();
            setCodexJob(job);
          }
        } catch {
          // The framed fallback remains usable if job recovery is unavailable.
        }
      };
      void reattachLatestJob();
      recoveryTimer = window.setInterval(() => void reattachLatestJob(), 1500);
      return () => {
        cancelled = true;
        if (recoveryTimer !== undefined) window.clearInterval(recoveryTimer);
      };
    }

    let cancelled = false;
    let timer: number | undefined;
    jobStartedAtRef.current = jobStartedAtRef.current ?? Date.now();

    const stop = () => {
      cancelled = true;
      if (timer !== undefined) window.clearInterval(timer);
    };

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(
          `/api/codex-image-job?id=${encodeURIComponent(codexJob.id)}`,
          { cache: "no-store" }
        );
        if (response.status === 409) {
          stop();
          reattachedJobIds.add(codexJob.id);
          jobStartedAtRef.current = null;
          setCodexJob(null);
          if (screen === "processing" && guaranteedPortraitRef.current) {
            void finishGuaranteedPortrait(guaranteedPortraitRef.current, codexJob.id);
          } else if (screen === "processing") {
            setProcessingError("This photo session expired.");
          }
          return;
        }
        if (!response.ok) return;
        const job = (await response.json()) as CodexImageJob;
        if (job.id !== codexJob.id) return;
        if (job.status === "complete" && job.imageBase64) {
          stop();
          await finishGeneratedPortrait(job.imageBase64, job);
        }
      } catch {
        // A transient local request failure can recover on the next poll.
      }
    };

    timer = window.setInterval(() => void poll(), 1500);
    void poll();
    return stop;
  }, [
    codexJob,
    countryCode,
    finishGeneratedPortrait,
    finishGuaranteedPortrait,
    fixtureMode,
    guaranteedResultJobId,
    processingError,
    screen,
  ]);

  useEffect(() => {
    if (
      screen !== "processing" ||
      !codexJob ||
      codexJob.status !== "queued" ||
      !guaranteedPortraitRef.current
    ) {
      return;
    }
    const startedAt = jobStartedAtRef.current ?? new Date(codexJob.createdAt).getTime();
    const delay = Math.max(0, GUARANTEED_RESULT_MS - (Date.now() - startedAt));
    const timer = window.setTimeout(() => {
      if (guaranteedPortraitRef.current) {
        void finishGuaranteedPortrait(guaranteedPortraitRef.current, codexJob.id);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [codexJob, finishGuaranteedPortrait, screen]);

  const submitCapturedPhoto = useCallback(async (source: string) => {
    if (submittingRef.current || !activeGame) return;
    submittingRef.current = true;
    jobStartedAtRef.current = Date.now();
    setCaptureError(null);
    setProcessingError(null);
    setScreen("processing");

    try {
      const image = await loadImage(source);
      if (!passesPhotoShapeCheck(image)) {
        submittingRef.current = false;
        setCaptureError("Move back slightly so your face and shoulders fit in frame.");
        setScreen("capture");
        return;
      }

      portraitRef.current = image;
      guaranteedPortraitRef.current = await createGuaranteedPortrait(image, country);

      if (fixtureMode) {
        jobStartedAtRef.current = null;
        logEvent("fixture_capture_ready", { country: countryCode });
        await new Promise((resolve) => window.setTimeout(resolve, 650));
        setCodexJob(null);
        await finishGuaranteedPortrait(guaranteedPortraitRef.current, null);
        return;
      }

      const normalized = await normalizePhoto(image);
      const response = await fetch("/api/codex-image-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64: normalized,
          countryCode,
          matchup: activeGame.matchup,
        }),
      });
      const job = (await response.json()) as CodexImageJob & { message?: string };
      if (!response.ok) {
        throw new Error(job.message || "The slip could not be started.");
      }
      setCodexJob(job);
      writePersistedSession({
        version: 1,
        experienceMode,
        countryCode,
        slip,
        game: activeGame,
        job: { ...job, imageBase64: undefined },
        capturedImage: normalized,
      });
      logEvent("codex_image_job_staged", { country: countryCode, job: job.id });
    } catch (error) {
      jobStartedAtRef.current = null;
      submittingRef.current = false;
      setProcessingError(error instanceof Error ? error.message : "The slip could not be started.");
    }
  }, [activeGame, country, countryCode, experienceMode, finishGuaranteedPortrait, fixtureMode, slip]);

  useEffect(() => {
    if (screen !== "result" || !portraitRef.current || !slipCanvasRef.current) return;
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
        round: activeGame?.round,
        venue: activeGame?.venue,
      });
      if (!cancelled && !celebratedRef.current && !prefersReducedMotion()) {
        celebratedRef.current = true;
        confettiBurst([country.bg, country.accent, "#1CA3F5", "#F4F8FC"]);
      }
    };
    void draw();
    return () => {
      cancelled = true;
    };
  }, [activeGame?.round, activeGame?.venue, country, renderVersion, screen, slip]);

  const saveSlip = useCallback(() => {
    const canvas = slipCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `novig-${country.code.toLowerCase()}-gallery-slip.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      logEvent("download", { style: "scoreboard", country: country.code });
    }, "image/png");
  }, [country.code]);

  const startOver = useCallback(() => {
    window.localStorage.removeItem(ACTIVE_SESSION_KEY);
    portraitRef.current = null;
    submittingRef.current = false;
    jobStartedAtRef.current = null;
    celebratedRef.current = false;
    guaranteedPortraitRef.current = null;
    setSelectedGame(null);
    setCodexJob(null);
    setCaptureError(null);
    setProcessingError(null);
    setPreflightError(null);
    setGuaranteedResultJobId(null);
    setScreen("pick");
    logEvent("booth_reset");
  }, []);

  return (
    <main className={`shell shell-${screen} streamlined-shell`}>
      <header className="brandbar streamlined-brandbar">
        <div className="brand-lockup">
          <img
            className="brand-mark"
            src="/brand/novig-mark-blue.png"
            alt=""
            aria-hidden="true"
          />
          <div className="brand-copy">
            <img
              className="brand-wordmark"
              src="/brand/novig-wordmark.svg"
              alt="Novig"
            />
            <small>{experienceMode === "cfb" ? "COLLEGE FOOTBALL" : "WORLD CUP EDITION"}</small>
          </div>
        </div>
        <div className={`sync-chip ${slate.sourceStatus === "live" ? "is-live" : ""}`}>
          <i aria-hidden="true" />
          {experienceMode === "cfb"
            ? "Opener slate"
            : slate.sourceStatus === "live" ? "Live slate" : "Verified fallback"}
        </div>
      </header>

      {screen === "pick" && (
        <nav className="experience-switch" aria-label="Choose a booth">
          <button
            type="button"
            aria-pressed={experienceMode === "world-cup"}
            onClick={() => changeExperienceMode("world-cup")}
          >
            <span aria-hidden="true">🏆</span>
            <strong>World Cup</strong>
            <small>Quarterfinals</small>
          </button>
          <button
            type="button"
            aria-pressed={experienceMode === "cfb"}
            onClick={() => changeExperienceMode("cfb")}
          >
            <span aria-hidden="true">🏟️</span>
            <strong>CFB</strong>
            <small>Season openers</small>
          </button>
        </nav>
      )}

      {screen === "pick" && activeGame && (
        <section className="pick-screen streamlined-pick" aria-label="Choose a side">
          <div className="section-heading">
            <span>{experienceMode === "cfb" ? "2026 SEASON OPENERS" : "WORLD CUP QUARTERFINALS"}</span>
            <h1>{experienceMode === "cfb" ? "Choose your team." : "Choose your country."}</h1>
            <p>
              {experienceMode === "cfb"
                ? "Official opening matchups • demo lines"
                : "All four remaining games • Pick your side"}
            </p>
          </div>
          <div className={experienceMode === "cfb" ? "cfb-choice-grid" : "world-cup-choice-grid"}>
            {slateChoices.map(({ game, side }) => (
              <TeamChoice
                key={`${game.id}:${side.countryCode}`}
                game={game}
                side={side}
                onSelect={() => chooseSide(game, side)}
              />
            ))}
          </div>
          {preflightError && <p className="preflight-error" role="alert">{preflightError}</p>}
          <p className="pick-hint">Your camera opens as soon as you choose.</p>
        </section>
      )}

      {screen === "preflight" && (
        <PreflightScreen country={country} />
      )}

      {screen === "capture" && (
        <CaptureScreen
          key={`${countryCode}-${captureError || "ready"}`}
          country={country}
          error={captureError}
          fixtureMode={fixtureMode}
          renderConfirmed
          onPhoto={submitCapturedPhoto}
        />
      )}

      {screen === "processing" && (
        <ProcessingScreen country={country} error={processingError} onReset={startOver} />
      )}

      {screen === "result" && (
        <section className="single-result" aria-label="Your finished slip">
          <div className="section-heading single-result-heading">
            <h1>Your masterpiece, sir.</h1>
          </div>
          <canvas
            ref={slipCanvasRef}
            className="single-slip-canvas"
            style={{ aspectRatio: "1 / 1" }}
            role="img"
            aria-label={`Framed Gallery Slip for ${country.name}, ${slip.odds}, $${slip.stake} trade`}
          />
          <div className="result-actions">
            <button className="btn btn-primary" onClick={saveSlip}>Save slip</button>
            <button className="btn btn-ghost" onClick={startOver}>Next fan</button>
          </div>
        </section>
      )}

      <footer className="foot streamlined-foot">
        <span>novig: for the cup</span>
      </footer>
    </main>
  );
}

function TeamChoice({
  game,
  side,
  onSelect,
}: {
  game?: LiveGame;
  side: LiveSide;
  onSelect: () => void;
}) {
  const theme = getCountry(side.countryCode) || COUNTRIES[0];
  const phrase = TEAM_PHRASES[side.countryCode];
  const opponent = game
    ? side.homeAway === "home" ? game.away.side : game.home.side
    : null;
  return (
    <button
      className="team-choice streamlined-team-choice"
      style={{ "--team": theme.bg, "--team-accent": theme.accent } as CSSProperties}
      onClick={onSelect}
    >
      <div className="team-choice-top">
        <span className="team-flag" aria-hidden="true">{theme.flag}</span>
        <span className="pick-marker">CHOOSE</span>
      </div>
      <h2 className="team-name">{side.side}</h2>
      {phrase && <p className="team-phrase-card">{phrase}</p>}
      {game && opponent && (
        <div className="team-opener">
          <strong>vs {opponent}</strong>
          <span>{formatKickoff(game)}</span>
        </div>
      )}
      <div className="team-number-grid">
        <span><small>ODDS</small><strong>{side.odds}</strong></span>
        <span><small>CHANCE</small><strong>{side.impliedProbability}%</strong></span>
        <span><small>TO WIN</small><strong>${formatDollars(side.toWin)}</strong></span>
      </div>
      <div className="fixed-trade">$50 trade included</div>
    </button>
  );
}

function PreflightScreen({ country }: { country: CountryTheme }) {
  return (
    <section className="preflight-screen" aria-label="Checking portrait engine" aria-live="polite">
      <TeamLoader country={country} />
      <span className="processing-kicker">PORTRAIT CHECK</span>
      <h1>Checking your look.</h1>
      <p>The camera opens only after the finished-image path is ready.</p>
    </section>
  );
}

function CaptureScreen({
  country,
  error,
  fixtureMode,
  renderConfirmed,
  onPhoto,
}: {
  country: CountryTheme;
  error: string | null;
  fixtureMode: boolean;
  renderConfirmed: boolean;
  onPhoto: (source: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraAttempt, setCameraAttempt] = useState(0);
  const [fixtureSource, setFixtureSource] = useState<string | null>(null);
  const [captured, setCaptured] = useState(false);

  useEffect(() => {
    if (fixtureMode) {
      const source = createFixturePortrait();
      setFixtureSource(source);
      setCameraReady(Boolean(source));
      return;
    }

    let stream: MediaStream | null = null;
    let active = true;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 1280 },
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
          setCameraReady(true);
        }
      } catch {
        if (active) {
          setCameraFailed(true);
          logEvent("camera_denied");
        }
      }
    };
    void start();
    return () => {
      active = false;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [cameraAttempt, fixtureMode]);

  const snap = useCallback(() => {
    if (captured || !cameraReady) return;
    if (fixtureSource) {
      setCaptured(true);
      onPhoto(fixtureSource);
      return;
    }
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(video, 0, 0);
    setCaptured(true);
    onPhoto(canvas.toDataURL("image/jpeg", 0.9));
    logEvent("capture_snap");
  }, [cameraReady, captured, fixtureSource, onPhoto]);

  const retryCamera = useCallback(() => {
    setCameraFailed(false);
    setCameraReady(false);
    setCameraAttempt((attempt) => attempt + 1);
  }, []);

  return (
    <section className="capture-screen streamlined-capture" aria-label="Take your photo">
      <div className="capture-team-chip">
        <span aria-hidden="true">{country.flag}</span>
        <strong>{country.name}</strong>
      </div>
      {renderConfirmed && (
        <p className="render-confirmed"><span aria-hidden="true">✓</span> Portrait ready • 30 second delivery</p>
      )}
      <div className="section-heading capture-heading">
        <h1>Say cheese.</h1>
      </div>

      {!cameraFailed ? (
        <div className="cam-wrap">
          {fixtureSource ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fixtureSource} alt="Camera preview" />
          ) : (
            <video ref={videoRef} playsInline muted autoPlay aria-label="Camera preview" />
          )}
          <div className="camera-corners" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>
      ) : (
        <div className="camera-fallback">
          <span aria-hidden="true">◎</span>
          <p>Camera access is required for the booth.</p>
        </div>
      )}

      {error && <p className="error-note" role="alert">{error}</p>}
      {cameraFailed ? (
        <button className="btn btn-primary shutter-button" onClick={retryCamera}>
          Try camera again
        </button>
      ) : (
        <button
          className="btn btn-primary shutter-button"
          onClick={snap}
          disabled={!cameraReady || captured}
        >
          {captured ? "Photo taken" : "Take photo"}
        </button>
      )}
    </section>
  );
}

function ProcessingScreen({
  country,
  error,
  onReset,
}: {
  country: CountryTheme;
  error: string | null;
  onReset: () => void;
}) {
  const [lineIndex, setLineIndex] = useState(0);
  const phrase = TEAM_PHRASES[country.code];

  useEffect(() => {
    if (error) return;
    const timer = window.setInterval(
      () => setLineIndex((index) => (index + 1) % PROCESSING_LINES.length),
      1600
    );
    return () => window.clearInterval(timer);
  }, [error]);

  return (
    <section className="processing-screen" aria-label="Building your slip" aria-live="polite">
      {error ? (
        <>
          <span className="processing-flag" aria-hidden="true">{country.flag}</span>
          <h1>That one didn&apos;t finish.</h1>
          <p>{error}</p>
          <button className="btn btn-primary" onClick={onReset}>Start over</button>
        </>
      ) : (
        <>
          <TeamLoader country={country} />
          <span className="processing-kicker">{country.flag} {country.name}</span>
          <h1>{phrase || "Making your slip."}</h1>
          <p>{PROCESSING_LINES[lineIndex]}</p>
        </>
      )}
    </section>
  );
}

function TeamLoader({ country }: { country: CountryTheme }) {
  if (!CFB_TEAM_CODES.includes(country.code)) {
    return (
      <div className="team-loader flag-loader" aria-hidden="true">
        <span className="flag-cloth">{country.flag}</span>
        <i className="loader-ground" />
      </div>
    );
  }

  if (country.code === "USC") {
    return (
      <div
        className="team-loader trojan-loader"
        style={{ "--loader-team": country.bg, "--loader-accent": country.accent } as CSSProperties}
        aria-hidden="true"
      >
        <span className="trojan-warrior">
          <i className="trojan-crest" />
          <i className="trojan-head" />
          <i className="trojan-body" />
          <i className="trojan-shield" />
          <i className="trojan-arm" />
          <i className="trojan-leg trojan-leg-one" />
          <i className="trojan-leg trojan-leg-two" />
        </span>
        <i className="loader-ground" />
      </div>
    );
  }

  const mascot = country.code === "LSU"
    ? "🐅"
    : country.code === "ALA"
      ? "🌊"
      : country.code === "UGA"
        ? "🐶"
        : "🐊";
  return (
    <div
      className={`team-loader mascot-loader mascot-${country.code.toLowerCase()}`}
      style={{ "--loader-team": country.bg, "--loader-accent": country.accent } as CSSProperties}
      aria-hidden="true"
    >
      <span>{mascot}</span>
      <i className="loader-ground" />
    </div>
  );
}
