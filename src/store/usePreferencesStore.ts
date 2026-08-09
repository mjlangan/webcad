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

const UNIT_CONVERSIONS: Record<string, number> = {
  mm: 1, cm: 10, m: 1000, in: 25.4, '"': 25.4, ft: 304.8, "'": 304.8,
};

/** Parses a typed numeric string (optionally suffixed, e.g. "5cm", "2in")
 *  into a scene-space mm value. A bare number is interpreted in `unit`. */
export function parseUnitValue(input: string, unit: UnitSystem): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  const match = s.match(/^(-?\d*\.?\d+)(mm|cm|m|in|ft|"|')?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const factor = UNIT_CONVERSIONS[match[2] ?? unit];
  if (factor === undefined) return null;
  return num * factor;
}
