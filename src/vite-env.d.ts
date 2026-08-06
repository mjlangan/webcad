/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set only when built with `vite build --mode e2e` (see .env.e2e) — never present in the real production build. */
  readonly VITE_E2E?: string;
}
