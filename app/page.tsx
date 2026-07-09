"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { COUNTRIES, getCountry } from "@/lib/prompts";
import {
  CAMERA_FAIL_NOTE,
  CTA_LABEL,
  DEFAULT_CODE,
  LOADING_LINES,
  POSE_PROMPTS,
  SAFETY_RETRY_NOTE,
  STATUS_LABELS,
  buildCaption,
  sanitizeSlipText,
  type SlipStatus,
} from "@/lib/copy";
import { renderCard, type CardFormat, type Slip } from "@/lib/composite";
import { confettiBurst } from "@/lib/confetti";
import { logEvent } from "@/lib/analytics";
import {
  DEMO_STAKE,
  TODAYS_SLATE,
  type SlateGame,
  type SlateSide,
} from "@/lib/slate";

type Screen = "landing" | "capture" | "setup" | "result";

const SLIP_LIMITS: Record<keyof Slip, number> = {
  matchup: 40,
  market: 24,
  side: 16,
  odds: 7,
  stake: 8,
  toWin: 9,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image_load_failed"));
    img.src = src;
  });
}

// Lightweight sanity check standing in for face detection in v1:
// reject tiny images and extreme aspect ratios before spending an API call.
function passesPhotoSanity(img: HTMLImageElement): boolean {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w < 320 || h < 320) return false;
  const aspect = w / h;
  return aspect > 0.4 && aspect < 2.5;
}

async function normalizePhoto(img: HTMLImageElement): Promise<string> {
  const maxSide = 1536;
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas_unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function computeToWin(odds: string, stake: string): string {
  const stakeNum = parseFloat(stake);
  const oddsNum = parseInt(odds.replace("+", ""), 10);
  if (!isFinite(stakeNum) || !isFinite(oddsNum) || oddsNum === 0) return "";
  const winnings =
    oddsNum > 0 ? (stakeNum * oddsNum) / 100 : (stakeNum * 100) / Math.abs(oddsNum);
  if (!isFinite(winnings)) return "";
  return String(Math.round(winnings));
}

export default function BoothPage() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [photo, setPhoto] = useState<string | null>(null);
  const [countryCode, setCountryCode] = useState("USA");
  const [status, setStatus] = useState<SlipStatus>("LOCKED");
  const [format, setFormat] = useState<CardFormat>("story");
  const [slip, setSlip] = useState<Slip>({
    matchup: "USA vs Mexico",
    market: "Moneyline",
    side: "USA",
    odds: "+117",
    stake: "100",
    toWin: "117",
  });
  const [toWinTouched, setToWinTouched] = useState(false);
  const [slateChoice, setSlateChoice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);
  const [genError, setGenError] = useState<string | null>(null);
  const [isMock, setIsMock] = useState(false);
  const [pendingReveal, setPendingReveal] = useState(false);
  const [copied, setCopied] = useState(false);

  const portraitRef = useRef<HTMLImageElement | null>(null);
  const cardCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const country = getCountry(countryCode) ?? COUNTRIES[0];
  const captionAmount = status === "COOKED" ? slip.stake : slip.toWin;
  const caption = buildCaption(country.name, status, captionAmount, DEFAULT_CODE);

  const updateSlip = useCallback(
    (key: keyof Slip, raw: string) => {
      const value = sanitizeSlipText(raw, SLIP_LIMITS[key]);
      setSlip((prev) => {
        const next = { ...prev, [key]: value };
        if ((key === "odds" || key === "stake") && !toWinTouched) {
          const auto = computeToWin(next.odds, next.stake);
          if (auto) next.toWin = auto;
        }
        return next;
      });
      if (key === "toWin") setToWinTouched(true);
      setSlateChoice(null);
    },
    [toWinTouched]
  );

  const pickSlateSide = useCallback((game: SlateGame, side: SlateSide) => {
    setSlip({
      matchup: game.matchup,
      market: "Moneyline",
      side: side.side,
      odds: side.odds,
      stake: DEMO_STAKE,
      toWin: computeToWin(side.odds, DEMO_STAKE) || "",
    });
    setToWinTouched(false);
    setCountryCode(side.countryCode);
    setSlateChoice(`${game.id}:${side.countryCode}`);
    logEvent("slate_pick", { game: game.id, side: side.countryCode });
  }, []);

  const acceptPhoto = useCallback(async (source: string, from: string) => {
    try {
      const img = await loadImage(source);
      if (!passesPhotoSanity(img)) {
        setGenError(
          "We could not make out a face in that one. Try a closer, clearer photo."
        );
        return;
      }
      const normalized = await normalizePhoto(img);
      setPhoto(normalized);
      setGenError(null);
      setScreen("setup");
      logEvent(from, { width: img.naturalWidth, height: img.naturalHeight });
    } catch {
      setGenError("That photo did not load. Try another one.");
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!photo || loading) return;
    setGenError(null);
    setLoading(true);
    logEvent("generate_request", { country: countryCode, format, status });

    let lineIdx = 0;
    setLoadingLine(LOADING_LINES[0]);
    const lineTimer = setInterval(() => {
      lineIdx = (lineIdx + 1) % LOADING_LINES.length;
      setLoadingLine(LOADING_LINES[lineIdx]);
    }, 640);

    try {
      // Static demo hosts have no API route. When the endpoint is missing
      // or unreachable, run mock mode right here in the browser so the
      // booth still works end to end.
      const request = (async () => {
        try {
          if (process.env.NEXT_PUBLIC_STATIC_DEMO === "1") {
            throw new Error("static_demo");
          }
          const res = await fetch("/api/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              imageBase64: photo,
              countryCode,
              format,
            }),
          });
          const isJson = res.headers
            .get("content-type")
            ?.includes("application/json");
          if (isJson) {
            return { ok: res.ok, body: await res.json() };
          }
        } catch {
          // Network failure falls through to the local mock.
        }
        await sleep(2000);
        return { ok: true, body: { imageBase64: photo, mock: true } };
      })();

      // Minimum theater time even when the model comes back fast.
      const [result] = await Promise.all([request, sleep(3200)]);

      if (!result.ok) {
        const message =
          result.body?.error === "refused" || result.body?.error === "no_image"
            ? SAFETY_RETRY_NOTE
            : result.body?.message || "Something slipped. Run it again.";
        setGenError(message);
        return;
      }

      const portrait = await loadImage(result.body.imageBase64 as string);
      portraitRef.current = portrait;
      setIsMock(Boolean(result.body.mock));
      setPendingReveal(true);
      setScreen("result");
      logEvent("generate_done", { mock: Boolean(result.body.mock) });
    } catch {
      setGenError("The booth hiccuped. Run it again.");
    } finally {
      clearInterval(lineTimer);
      setLoading(false);
    }
  }, [photo, loading, countryCode, format, status]);

  // Slot machine reveal, then settle with confetti.
  useEffect(() => {
    if (screen !== "result" || !pendingReveal) return;
    let cancelled = false;

    const run = async () => {
      const canvas = cardCanvasRef.current;
      const portrait = portraitRef.current;
      if (!canvas || !portrait) return;

      const finalOpts = {
        portrait,
        country,
        status,
        slip,
        format,
        code: DEFAULT_CODE,
        seed: country.seed,
      };

      const reduced = prefersReducedMotion();
      if (!reduced) {
        for (let i = 0; i < 7; i++) {
          const roll = COUNTRIES[Math.floor(Math.random() * COUNTRIES.length)];
          await renderCard(canvas, {
            ...finalOpts,
            country: roll,
            status: "LOCKED",
            seed: roll.seed,
          });
          await sleep(120 + Math.random() * 180);
          if (cancelled) return;
        }
      }

      await renderCard(canvas, finalOpts);
      if (cancelled) return;
      if (!reduced) {
        confettiBurst([country.bg, "#1CA3F5", "#F4F8FC", "#35D07F"]);
      }
      logEvent("reveal_settle", { country: country.code, status });
      setPendingReveal(false);
    };

    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, pendingReveal]);

  const handleDownload = useCallback(() => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `novig-booth-${country.code.toLowerCase()}.png`;
      link.click();
      URL.revokeObjectURL(url);
      logEvent("download", { country: country.code, format });
    }, "image/png");
  }, [country.code, format]);

  const handleCopyCaption = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      logEvent("copy_caption", { country: country.code });
    } catch {
      setGenError("Copy failed. Long press the caption text instead.");
    }
  }, [caption, country.code]);

  const handleShare = useCallback(() => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
      };
      try {
        if (blob && nav.share && nav.canShare) {
          const file = new File([blob], "novig-booth.png", {
            type: "image/png",
          });
          if (nav.canShare({ files: [file] })) {
            await nav.share({ files: [file], text: caption });
            logEvent("share", { mode: "file" });
            return;
          }
        }
        if (nav.share) {
          await nav.share({ text: caption });
          logEvent("share", { mode: "text" });
          return;
        }
        await handleCopyCaption();
      } catch {
        // User closed the share sheet. Nothing to do.
      }
    }, "image/png");
  }, [caption, handleCopyCaption]);

  const resetBooth = useCallback(() => {
    portraitRef.current = null;
    setPhoto(null);
    setIsMock(false);
    setGenError(null);
    setScreen("capture");
    logEvent("run_it_back");
  }, []);

  return (
    <main className="shell">
      <header className="brandbar">
        <div className="n-mark" aria-hidden="true">
          N
        </div>
        <span>NOVIG BOOTH</span>
      </header>

      {screen === "landing" && (
        <section aria-label="Welcome">
          <h1 className="headline">
            GET
            <strong>CAPPED</strong>
          </h1>
          <p className="sub">
            Snap a selfie. We dress you in your nation&apos;s colors, print
            your trading slip on a poster card, and hand you the share button.
            Peer to peer. Zero vig.
          </p>
          <div className="hazard" aria-hidden="true" />
          <button
            className="btn btn-primary"
            onClick={() => {
              setScreen("capture");
              logEvent("booth_start");
            }}
          >
            {CTA_LABEL}
          </button>
        </section>
      )}

      {screen === "capture" && (
        <CaptureScreen
          onPhoto={acceptPhoto}
          onBack={() => setScreen("landing")}
          error={genError}
        />
      )}

      {screen === "setup" && (
        <section aria-label="Slip setup">
          <h2 className="headline" style={{ fontSize: "clamp(34px, 9vw, 52px)" }}>
            <strong>YOUR SLIP</strong>
          </h2>

          <div className="ticket-card">
            <span className="label">Today&apos;s slate, $100 trade</span>
            <div className="slate">
              {TODAYS_SLATE.map((game) => (
                <div className="slate-game" key={game.id}>
                  <p className="slate-matchup">
                    {game.matchup}
                    {game.live && (
                      <span className="live-tag" aria-label="Live now">
                        LIVE
                      </span>
                    )}
                  </p>
                  <div className="slate-sides">
                    {game.sides.map((s) => (
                      <button
                        key={s.countryCode}
                        className="slate-pill"
                        aria-pressed={slateChoice === `${game.id}:${s.countryCode}`}
                        onClick={() => pickSlateSide(game, s)}
                      >
                        <span>{s.side}</span>
                        <strong>{s.odds}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <p className="note slim">
              Tap a side to load the slip. Demo odds, edit anything below.
            </p>
          </div>

          <div className="ticket-card">
            <span className="label">Nation</span>
            <div className="chip-grid" role="group" aria-label="Pick your nation">
              {COUNTRIES.map((c) => (
                <button
                  key={c.code}
                  className="chip"
                  aria-pressed={c.code === countryCode}
                  onClick={() => setCountryCode(c.code)}
                >
                  <span aria-hidden="true">{c.flag}</span>
                  {c.code}
                </button>
              ))}
            </div>
          </div>

          <div className="ticket-card">
            <span className="label">Position</span>
            <div className="field-grid">
              <div className="field wide">
                <label htmlFor="matchup">Matchup</label>
                <input
                  id="matchup"
                  value={slip.matchup}
                  onChange={(e) => updateSlip("matchup", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="market">Market</label>
                <input
                  id="market"
                  value={slip.market}
                  onChange={(e) => updateSlip("market", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="side">Side</label>
                <input
                  id="side"
                  value={slip.side}
                  onChange={(e) => updateSlip("side", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="odds">American odds</label>
                <input
                  id="odds"
                  inputMode="numeric"
                  value={slip.odds}
                  onChange={(e) => updateSlip("odds", e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="stake">Stake ($)</label>
                <input
                  id="stake"
                  inputMode="decimal"
                  value={slip.stake}
                  onChange={(e) => updateSlip("stake", e.target.value)}
                />
              </div>
              <div className="field wide">
                <label htmlFor="towin">To win ($)</label>
                <input
                  id="towin"
                  inputMode="decimal"
                  value={slip.toWin}
                  onChange={(e) => updateSlip("toWin", e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="ticket-card">
            <span className="label">Status</span>
            <div className="seg" role="group" aria-label="Position status">
              {(["LOCKED", "CAPPED", "COOKED"] as SlipStatus[]).map((s) => (
                <button
                  key={s}
                  className={
                    s === "CAPPED" ? "tone-green" : s === "COOKED" ? "tone-red" : ""
                  }
                  aria-pressed={status === s}
                  aria-label={STATUS_LABELS[s]}
                  onClick={() => setStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>

            <span className="label" style={{ marginTop: 16 }}>
              Format
            </span>
            <div className="seg" role="group" aria-label="Card format">
              <button
                aria-pressed={format === "story"}
                onClick={() => setFormat("story")}
              >
                STORY 1080x1920
              </button>
              <button
                aria-pressed={format === "square"}
                onClick={() => setFormat("square")}
              >
                SQUARE 1080x1080
              </button>
            </div>
          </div>

          {genError && (
            <p className="error-note" role="alert">
              {genError}
            </p>
          )}

          <div className="btn-row">
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading}
            >
              Get capped
            </button>
            <button className="btn btn-ghost" onClick={() => setScreen("capture")}>
              Retake photo
            </button>
          </div>
        </section>
      )}

      {screen === "result" && (
        <section aria-label="Your card">
          <h2 className="headline" style={{ fontSize: "clamp(34px, 9vw, 52px)" }}>
            <strong>CAPPED.</strong>
          </h2>
          {isMock && (
            <p className="note">
              Demo mode: no AI key configured, so your original photo came back
              untouched. Add GEMINI_API_KEY for the full fit.
            </p>
          )}
          <canvas
            ref={cardCanvasRef}
            className="card-preview"
            style={{ aspectRatio: format === "story" ? "9 / 16" : "1 / 1" }}
            role="img"
            aria-label={`Your ${country.name} card: ${status}, ${slip.matchup}, to win $${slip.toWin}`}
          />
          <div className="result-actions">
            <button className="btn btn-primary" onClick={handleDownload}>
              Download PNG
            </button>
            <button className="btn btn-ghost" onClick={handleCopyCaption}>
              {copied ? "Copied" : "Copy caption"}
            </button>
            <button className="btn btn-ghost" onClick={handleShare}>
              Share
            </button>
          </div>
          {/* TODO phase two: Higgsfield motion card call goes here.
              Send the finished card plus portrait to the motion API and
              return a short video loop for stories. */}
          <p className="note">{caption}</p>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={resetBooth}>
              Run it back
            </button>
          </div>
        </section>
      )}

      <footer className="foot">
        Peer to peer. Zero vig. <span>novig.us</span>
        <a className="foot-link" href="how-it-was-built.html">
          How it was built
        </a>
      </footer>

      {loading && (
        <div className="overlay" role="status" aria-live="polite">
          <div className="spinner" aria-hidden="true" />
          <p className="loading-line">{loadingLine}</p>
        </div>
      )}
    </main>
  );
}

interface CaptureScreenProps {
  onPhoto: (dataUrl: string, from: string) => void;
  onBack: () => void;
  error: string | null;
}

function CaptureScreen({ onPhoto, onBack, error }: CaptureScreenProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [cameraFailed, setCameraFailed] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [poseIdx, setPoseIdx] = useState(0);

  useEffect(() => {
    const timer = setInterval(
      () => setPoseIdx((i) => (i + 1) % POSE_PROMPTS.length),
      2300
    );
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
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
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
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
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Mirror the capture so it matches the preview the user posed with.
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    onPhoto(canvas.toDataURL("image/jpeg", 0.92), "capture_snap");
  }, [onPhoto]);

  const onFile = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      if (!["image/jpeg", "image/png"].includes(file.type)) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          onPhoto(reader.result, "capture_upload");
        }
      };
      reader.readAsDataURL(file);
    },
    [onPhoto]
  );

  return (
    <section aria-label="Take your photo">
      <h2 className="headline" style={{ fontSize: "clamp(34px, 9vw, 52px)" }}>
        <strong>STRIKE A POSE</strong>
      </h2>

      {!cameraFailed ? (
        <div className="cam-wrap">
          {/* The preview is mirrored via CSS so users see themselves selfie style. */}
          <video ref={videoRef} playsInline muted autoPlay aria-label="Camera preview" />
          <p className="pose-line" aria-live="polite">
            {POSE_PROMPTS[poseIdx]}
          </p>
        </div>
      ) : (
        <p className="note">{CAMERA_FAIL_NOTE}</p>
      )}

      {error && (
        <p className="error-note" role="alert">
          {error}
        </p>
      )}

      <div className="btn-row">
        {!cameraFailed && (
          <button
            className="btn btn-primary"
            onClick={snap}
            disabled={!cameraReady}
          >
            Snap it
          </button>
        )}
        <button
          className={cameraFailed ? "btn btn-primary" : "btn btn-ghost"}
          onClick={() => fileRef.current?.click()}
        >
          Upload a photo
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png"
          className="visually-hidden"
          onChange={onFile}
          aria-label="Upload a photo"
          tabIndex={-1}
        />
        <button className="btn btn-ghost" onClick={onBack}>
          Back
        </button>
      </div>
    </section>
  );
}
