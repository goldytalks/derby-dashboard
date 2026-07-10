# Codex development guide

This file records how to run and verify the current Novig Booth in Codex. The public booth is now the same hosted-generation application locally and on Vercel; it no longer depends on a filesystem job watcher or a face-compositing contingency.

## Current architecture

The active flow is deterministic:

1. Pick a team.
2. Pass the live hosted-provider preflight.
3. Open the camera and take one photo.
4. Send one correlated generation request.
5. Accept only the matching cohesive AI portrait.
6. Render that portrait inside the square Gallery Slip.

`app/page.tsx` never substitutes a team preview, the original camera frame, or a local template for a generated result. Team previews under `public/templates/ai/` appear only on the pick screen.

## Run locally

Requirements:

- Node.js 20.9+
- npm
- a browser with camera permission for real-photo checks
- a configured hosted provider and valid release-canary proof

```bash
npm install
cp .env.local.example .env.local
npm run dev -- --hostname 127.0.0.1
```

Open `http://127.0.0.1:3000/`. Use `?cfb=1` for College Football. Use `?fixture=1` only to replace the physical webcam frame with the committed synthetic test frame; fixture mode still calls the real hosted generator and cannot fake a finished portrait.

## Hosted generation contract

Before camera access, the page requests:

```text
GET /api/generate?teamCode=<allowlisted-team-code>
```

The response is ready only when:

- a server-side provider is configured;
- the exact deployed artifact, prompt suite, model, provider configuration, and validation rules passed the protected canary in under 42 seconds;
- that proof is still inside its seven-day validity window; and
- the live credential and billing probe succeeds.

After capture, the page sends:

```json
{
  "jobId": "browser-generated-uuid",
  "selectionKey": "frozen-selection-uuid",
  "imageBase64": "data:image/jpeg;base64,...",
  "teamCode": "USC"
}
```

The server owns the prompt. It validates the team, image, payload size, output MIME, output size, generation time, decoded pixels, and job correlation. A successful response must echo the same `jobId`, `selectionKey`, and `teamCode` with `status: complete` and one new square image.

## Cohesive portrait requirement

`lib/server/team-prompts.ts` defines all eighteen treatments. Every prompt requires the model to render the face, hair, neck, shoulders, costume, props, background, light, shadows, texture, grain, and camera perspective as one photograph. It explicitly rejects face swaps, face windows, floating heads, mismatched scale, and pasted source pixels.

The server and browser both reject visually unchanged output. The final canvas receives only the validated generated image. The old face-landmark runtime, hosted body plates, and USC helmet plate are intentionally absent so they cannot re-enter the result path.

## Release canary

The protected canary uses a server-owned synthetic image and the same provider path, prompts, timeout, correlation, and decoded-pixel validation as a fan request.

```bash
BOOTH_CANARY_SECRET=... node scripts/run-image-canary.mjs \
  --url https://your-preview.vercel.app \
  --team USC \
  --model google/gemini-3.1-flash-image
```

A successful run writes its generated image to a private temporary file and prints the server-only verification environment values for that exact release. Inspect the output visually before recording those values or promoting the deployment.

## Persistence and recovery

Only a validated generated portrait may be persisted. The browser makes a bounded storage attempt before displaying the result:

- the generated image goes into same-origin Cache Storage;
- small job, team, game, mode, and frozen-selection metadata goes into tab-scoped session storage;
- entries expire after 30 minutes and are explicitly purged;
- **Next fan**, a mode switch, or a new selection removes only that tab's correlated result.

The raw camera capture is never persisted. If storage is unavailable or slow, the validated result still renders in memory but is not refresh-restorable.

## Historical local bridge

`/api/codex-image-job` and `.codex/booth-image-job/` remain workspace history from the earlier agent-assisted prototype. The current public page does not call or poll that route. They must not be used as a result fallback or as evidence that the hosted provider is ready.

## Verification

```bash
npm run lint
npm run build
npm run check:cohesive
npm audit --omit=dev
git diff --check
```

Then run:

- the complete `?fixture=1` path;
- a real-camera France result;
- a real-camera Belgium result;
- a real-camera Spain result;
- a real-camera USC result;
- Save Slip and refresh restoration;
- browser-console and Vercel runtime-log checks.

Do not promote the release until all four portraits are visibly cohesive and each completes inside the booth deadline.
