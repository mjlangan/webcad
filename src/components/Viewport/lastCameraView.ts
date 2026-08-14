/**
 * Holds the most recent camera pose across a Viewport remount (e.g. toggling
 * projection mode remounts the whole three.js setup via a `key` change on
 * <Viewport>), so the next mount can restore the same view instead of
 * resetting to the default framing. Module-level rather than store state:
 * it's a one-shot handoff between an unmounting and mounting Viewport
 * instance, not app state anything else needs to read or react to.
 */
export interface CameraView {
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
}

let lastView: CameraView | null = null;

export function saveCameraView(view: CameraView): void {
  lastView = view;
}

export function getCameraView(): CameraView | null {
  return lastView;
}
