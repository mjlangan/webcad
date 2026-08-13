import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { defaultExclude } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  optimizeDeps: {
    // manifold-3d ships an Emscripten WASM loader that resolves its .wasm via
    // import.meta.url; pre-bundling it breaks that resolution.
    exclude: ['manifold-3d'],
  },
  test: {
    environment: 'node',
    // Vitest's default include glob would otherwise also pick up e2e/**/*.spec.ts
    // and scripts/**/*.spec.ts (Playwright specs, run separately via
    // `npm run test:e2e` / `npm run generate:thumbnails`).
    exclude: [...defaultExclude, 'e2e/**', 'scripts/**'],
  },
})
