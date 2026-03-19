export const MM_CONVERSIONS: Record<string, number> = {
  mm: 1, cm: 10, m: 1000, in: 25.4, '"': 25.4, ft: 304.8, "'": 304.8,
};

export function parseMmValue(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, '');
  const match = s.match(/^(-?\d*\.?\d+)(mm|cm|m|in|ft|"|')?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const factor = MM_CONVERSIONS[match[2] ?? 'mm'];
  if (factor === undefined) return null;
  return num * factor;
}

export function formatMm(value: number): string {
  return parseFloat(value.toFixed(4)).toString() + 'mm';
}
