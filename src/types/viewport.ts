export type CameraPreset = 'home' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface ViewportActions {
  setPreset: (preset: CameraPreset) => void;
  focusSelection: () => void;
}
