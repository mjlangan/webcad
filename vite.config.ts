import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { defaultExclude } from 'vitest/config'
import { visualizer } from 'rollup-plugin-visualizer'

// Vite bundles each Web Worker (`?worker` imports) as its own separate Rollup
// build using `worker.plugins`, distinct from the main app's `plugins` array —
// so the visualizer has to be attached in both places to see worker contents
// (csg.worker/split.worker, and the manifold-3d/three-bvh-csg code they pull in).
let workerBuildIndex = 0;

// https://vite.dev/config/
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [
    react(),
    // `ANALYZE=1 npm run build` opens an interactive treemap of the main app
    // bundle at dist/stats.html.
    process.env.ANALYZE ? visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }) : undefined,
  ],
  worker: {
    plugins: () => [
      // Each worker gets its own Rollup build/writeBundle call, so give each a
      // distinct output file (dist/stats-worker-0.html, -1.html, ...) rather than
      // overwriting a shared one.
      process.env.ANALYZE ? visualizer({
        filename: `dist/stats-worker-${workerBuildIndex++}.html`,
        gzipSize: true,
        brotliSize: true,
        template: 'treemap',
      }) : undefined,
    ],
  },
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
