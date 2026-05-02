import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// CDN_RELATIVE: relative paths for raw.githack / jsDelivr (works from any URL prefix).
// GITHUB_PAGES : /derby-dashboard/ for username.github.io project pages.
// default      : / for Vercel.
const base =
  process.env.CDN_RELATIVE === 'true'
    ? './'
    : process.env.GITHUB_PAGES === 'true'
    ? '/derby-dashboard/'
    : '/'

export default defineConfig({
  plugins: [react()],
  base,
})
