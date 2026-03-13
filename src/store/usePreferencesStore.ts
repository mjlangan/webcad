import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type UnitSystem = 'mm' | 'in';

interface PreferencesState {
  unitSystem: UnitSystem;
  setUnitSystem: (unit: UnitSystem) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      unitSystem: 'mm',
      setUnitSystem: (unitSystem) => set({ unitSystem }),
    }),
    { name: 'webcad-preferences' },
  ),
);

/** Convert a scene-unit (mm) value to the display unit. */
export function toDisplayUnit(mm: number, unit: UnitSystem): number {
  return unit === 'in' ? mm / 25.4 : mm;
}

/** Format a scene-unit (mm) value with unit suffix. */
export function formatUnit(mm: number, unit: UnitSystem, digits = 2): string {
  const v = toDisplayUnit(mm, unit);
  return unit === 'in' ? `${v.toFixed(digits + 1)} in` : `${v.toFixed(digits)} mm`;
}
