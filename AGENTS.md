# Codex instructions for Novig Booth

This repository is a Codex Mini-App. The local website creates image-edit jobs; Codex built-in Image Gen completes them. Do not add a provider credential merely to make the local flow work.

## Product invariants

- Preserve the public path: choose a team, take one photo, processing, finished slip.
- Never show the untouched camera frame as a finished portrait.
- Never let one job's result complete another job.
- Preserve captured photos and completed results across code updates and refreshes.
- Keep `?dev=1` visually identical to the public booth.
- Keep all developer paths, job IDs, provider details, and filesystem paths out of public UI.
- Use only the approved taglines listed in `README.md`.

## Local job loop

Jobs are written to `.codex/booth-image-job/` and ignored by Git.

For every queued `job-<id>.json`:

1. Read the metadata file.
2. Confirm `status` is `queued`.
3. Inspect the exact `inputPath` and `promptPath` from that metadata.
4. Run Codex built-in Image Gen as an identity-preserving edit of that exact input.
5. Preserve the real face, hair, expression, gaze, skin tone, and recognizability.
6. Apply the requested team costume, props, and background.
7. Do not add logos, readable text, watermarks, weapons, or unrelated people.
8. Write a PNG to the exact `resultPath` from the same metadata file.
9. Confirm `GET /api/codex-image-job?id=<id>&meta=1` returns `status: complete`.
10. Confirm the generated portrait appears inside the framed square slip.

Never copy an earlier result into a later job. Never delete historical job files while another fan may still be using them.

## Verification before handoff

Run:

```bash
npm run lint
npm run build
git diff --check
```

Use `?fixture=1` to verify the complete click path without camera permission. Verify the real camera path separately when camera access is available. A fixture result proves UI orchestration, not provider quality or production latency.

## Hosted boundary

The local filesystem job route is not the production architecture. Do not claim that it works on Vercel. Follow `docs/HOSTED_RUNTIME_PLAN.md` when implementing hosted generation, storage, webhooks, concurrency, and latency monitoring.
