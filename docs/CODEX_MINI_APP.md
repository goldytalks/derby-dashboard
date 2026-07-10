# Codex Mini-App operating guide

This document explains how the current Novig Booth runs locally without placing an external image API credential in the website.

## Purpose

The Mini-App gives an event operator a complete photobooth prototype inside Codex:

- a real browser camera,
- an event slate,
- team-specific styling,
- built-in image editing,
- a square Gallery Slip,
- and a repeatable browser fixture.

The local architecture is intentionally agent-assisted. It is for creative testing, booth-flow validation, prompt development, and stakeholder demos. It is not the production hosted architecture and does not provide a provider latency SLA.

## Prerequisites

- macOS with Codex desktop
- Node.js 20.9+
- npm
- a browser with camera permission for real-photo tests
- the Codex task kept active while built-in Image Gen jobs are running

## Start the Mini-App

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000/` in the Codex in-app browser.

The interface offers World Cup and CFB modes. A direct link can preselect CFB with `?cfb=1`. Add `fixture=1` to use a synthetic camera frame.

## Fan experience

1. The fan chooses a team.
2. The app runs a local readiness check before requesting camera access.
3. The fan taps the single shutter button.
4. The browser validates dimensions, normalizes the image, and freezes the selected matchup values.
5. The app creates one job and moves directly to processing.
6. Codex completes that exact image job.
7. The app renders the generated portrait inside one 1080 × 1080 Gallery Slip.
8. The fan can save the slip or reset for the next person.

No confirmation or manual import action appears between capture and result.

## Job contract

`POST /api/codex-image-job` accepts:

```json
{
  "imageBase64": "data:image/jpeg;base64,...",
  "countryCode": "USC",
  "matchup": "USC vs San José State"
}
```

The route validates the image, creates a UUID, and returns metadata shaped like:

```json
{
  "id": "3fcd6f8a-...",
  "status": "queued",
  "countryCode": "USC",
  "countryName": "USC",
  "matchup": "USC vs San José State",
  "inputPath": "/absolute/path/input-3fcd6f8a.jpg",
  "promptPath": "/absolute/path/prompt-3fcd6f8a.txt",
  "resultPath": "/absolute/path/result-3fcd6f8a.png",
  "createdAt": "2026-07-10T...Z"
}
```

Files are written under `.codex/booth-image-job/`:

```text
job.json                    latest-job compatibility pointer
job-<id>.json               immutable metadata for one fan
input-<id>.<ext>            normalized camera frame
prompt-<id>.txt             exact team edit prompt
result-<id>.png             generated output expected by the browser
```

`job.json` is only a convenience pointer. The browser always polls by its own job ID.

## Codex image-processing loop

For each new queued job:

1. Read `job-<id>.json`.
2. Inspect its `inputPath` so the exact fan photo is visible.
3. Read its `promptPath`.
4. Use Codex built-in Image Gen in edit mode with the input image attached.
5. Preserve identity, face, hair, expression, gaze, and skin tone.
6. Apply only the requested team wardrobe, props, and scene.
7. Save the generated PNG to that job's `resultPath`.
8. Verify the API returns the same ID and `status: complete`.
9. Verify the framed slip uses the generated portrait.

The application detects completion from the presence and revision of the exact result file. Replacing a result file with an improved edit updates that session without creating a new job.

## Status API

Poll one job:

```text
GET /api/codex-image-job?id=<jobId>
```

Possible responses:

- `200 queued` — metadata exists, result does not.
- `200 complete` — metadata and matching image exist; response includes `imageBase64`.
- `409 stale` — that ID is not available.

Use metadata-only polling when image bytes are unnecessary:

```text
GET /api/codex-image-job?id=<jobId>&meta=1
```

The complete response includes a `resultRevision` derived from modification time and size. This allows a better edit to replace an earlier result reliably.

## Persistence and recovery

The browser stores the active session under one versioned local-storage key. It includes:

- mode,
- team code,
- frozen slip values,
- selected game,
- job metadata,
- and normalized captured image.

On refresh, the app restores the same session and resumes polling. Historical job files remain available. Only an explicit **Next fan** action clears the browser's active pointer.

## Readiness check

Before camera access, the app requests:

```text
GET /api/codex-image-job?preflight=1&countryCode=<code>
```

The local check confirms:

- the team exists,
- the app is not running in Vercel's hosted environment,
- the local job directory is writable,
- and the browser has Canvas support.

This proves that the Mini-App can create and render a local job. It does not prove that an external provider or Codex generation will finish inside a production deadline.

## Fast contingency portraits

The app can prepare a themed local portrait plate while the full edit is queued. This exists to prevent an indefinite loader during prototype testing. It must never be an untouched camera frame.

The USC plate uses a detailed open-face Trojan helmet, bronze armor, cardinal cape, and Coliseum background. The live face is composited inside the empty helmet opening. A later full generated portrait replaces it when available.

This contingency is a prototype behavior, not the hosted quality strategy. Production should use the two-lane generation design in `HOSTED_RUNTIME_PLAN.md`.

## Fixture mode

`?fixture=1` creates a synthetic camera frame without exposing any test control in the UI.

Use it to verify:

- team selection,
- preflight,
- camera state,
- single-submit protection,
- processing animation,
- result rendering,
- save and reset actions,
- and responsive layout.

Fixture mode does not prove real camera permission, identity fidelity, provider availability, or provider latency.

## Safety and privacy

- Local job files are ignored by Git.
- Do not commit captured fan photos or generated per-fan results.
- Do not expose filesystem paths in the public interface.
- Do not reuse one fan's image as another fan's result.
- Do not send a photo to an external service unless the event's privacy notice covers that provider.
- Keep all hosted credentials server-side.

## Troubleshooting

### Camera does not open

- Confirm the site is on `localhost` or `127.0.0.1`.
- Confirm browser camera permission.
- Reload and tap **Try camera again**.
- Use `?fixture=1` only to isolate the UI from hardware permission.

### Processing does not finish

- Inspect `.codex/booth-image-job/job.json` for the active ID.
- Confirm the corresponding `job-<id>.json`, input, and prompt exist.
- Confirm Codex wrote a non-empty PNG to that job's exact `resultPath`.
- Request the metadata-only status URL and confirm `status: complete`.
- Never substitute a different job's result.

### A stale photo appears

- Confirm the browser is polling with `?id=<activeJobId>`.
- Confirm no script is overwriting `job.json` and then reading it as the active session.
- Confirm the result filename contains the same UUID as the input and metadata.

## Validation

```bash
npm run lint
npm run build
git diff --check
```

Then run the full fixture path for at least one World Cup team and one CFB team. For a real-photo release check, run a fresh camera capture and verify the person's generated portrait appears inside the saved square PNG.

