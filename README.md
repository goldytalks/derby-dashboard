# Novig Booth: Get Capped

A Cup photobooth for Novig, the peer to peer prediction market with zero vig. Snap a selfie, the booth dresses you in your nation's colors with one signature prop, and your trading slip gets printed on a shareable poster card with a promo code and a scannable QR.

## Deploy

Run `vercel`, then add `GEMINI_API_KEY` in the project settings. Done.

## Local

```bash
npm install
npm run dev
```

No env vars needed to demo: without `GEMINI_API_KEY` the API runs in mock mode and returns your original photo after a short wait, so the full flow works end to end.

## Notes

- `app/api/generate/route.ts` does not write uploads to a database or file store. In AI mode, photos are sent to Google Gemini and are handled under the connected Gemini API plan. Paid Gemini services can log prompts and responses for abuse monitoring unless zero data retention is approved for the project.
- The route limits decoded inputs and outputs to 3 MB so their base64 JSON payloads stay below Vercel Functions' 4.5 MB request and response limit.
- Card compositing is pure canvas in `lib/composite.ts` with the portrait printed as a real photo, country themes and costume prompts in `lib/prompts.ts`, and all product copy in `lib/copy.ts`.
- Formats: Story 1080x1920 and Square 1080x1080, both downloadable as PNG.
