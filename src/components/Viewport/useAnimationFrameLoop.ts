import { useEffect } from 'react';

/** Runs `callback` on every animation frame for as long as the component is mounted and `deps` don't change. */
export function useAnimationFrameLoop(callback: () => void, deps: unknown[]): void {
  useEffect(() => {
    let rafId: number;
    function loop() {
      callback();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
