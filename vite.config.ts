import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { defaultExclude } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  test: {
    environment: 'node',
    // Vitest's default include glob would otherwise also pick up e2e/**/*.spec.ts
    // and scripts/**/*.spec.ts (Playwright specs, run separately via
    // `npm run test:e2e` / `npm run generate:thumbnails`).
    exclude: [...defaultExclude, 'e2e/**', 'scripts/**'],
  },
})
