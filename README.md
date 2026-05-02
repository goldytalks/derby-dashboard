# Kentucky Derby 2026 Dashboard

Mobile-first analytics dashboard for the 152nd Kentucky Derby. React + Vite, deployable to Vercel.

## Run locally

```
npm install
npm run dev
```

Opens at http://localhost:5173

## Deploy to Vercel

```
npx vercel --prod
```

Connect to a GitHub repo for auto-deploys on every push.

## Redeploy after changes

```
git add . && git commit -m "update" && git push
```

## Data sources

- Live odds: DK Horse tote (snapshot 5:23 PM ET, May 2 2026)
- Beyer Speed Figures: Daily Racing Form
- Post position history: Churchill Downs 40-year archive
- Future live data: theracingapi.com North America add-on (£49.99/mo)
- Live odds proxy: theOddsAPI.com via Vercel serverless function
