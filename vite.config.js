import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Vercel serves from / ; GitHub Pages serves from /derby-dashboard/.
  base: process.env.GITHUB_PAGES === 'true' ? '/derby-dashboard/' : '/',
})
