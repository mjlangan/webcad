# CLAUDE.md

## Reproducing bugs / verifying fixes

When you need to prove a bug exists (or that a fix worked) by driving the actual
app in a browser, don't write a standalone Playwright/chromium-cli script from
scratch. Instead, add a throwaway spec file under `e2e/` (e.g.
`e2e/_verify-<thing>.spec.ts`) that uses the project's existing harness:

- `e2e/helpers/app.ts` — `gotoReady(page)` navigates and waits for the app +
  `window.__E2E__` bridge to be live.
- `e2e/helpers/scene.ts` — `addPrimitive`, `selectNode`, `addToSelection`,
  `getNode`, `getNodeIds`, `getNodeCount`.
- `e2e/helpers/gizmo.ts` — `canvasCenter`, `worldToPage`, `dragMouse`.
- `window.__E2E__` (see `src/lib/e2eBridge.ts`) exposes live internals for
  assertions — `three.{scene,camera,renderer}`, `store.getState()`,
  `rotateMarkers`, `worldToPagePx`.

Run it with `npx playwright test e2e/_verify-<thing>.spec.ts --reporter=list`.
The config (`playwright.config.ts`) already builds the app with the right
headless-WebGL flags (`--use-gl=angle --use-angle=swiftshader
--enable-unsafe-swiftshader`) and reuses a dev server, so this is faster and
more reliable than standing up your own browser driver.

To confirm a test actually catches the bug (not just that it passes), run it
once against the buggy code (`git stash` the fix, run, `git stash pop`) and
once with the fix applied — expect fail then pass.

Delete the throwaway spec when done unless it's worth keeping as a permanent
regression test.
