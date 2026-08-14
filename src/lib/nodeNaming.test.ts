import { describe, it, expect } from 'vitest';
import { nextCopyName } from './nodeNaming';

describe('nextCopyName', () => {
  it('increments a trailing number', () => {
    expect(nextCopyName('Sphere 1', [])).toBe('Sphere 2');
    expect(nextCopyName('Box 9', [])).toBe('Box 10');
  });

  it('appends " 1" when there is no trailing number', () => {
    expect(nextCopyName('Sphere', [])).toBe('Sphere 1');
    expect(nextCopyName('Imported Part', [])).toBe('Imported Part 1');
  });

  it('preserves the separator before the number', () => {
    expect(nextCopyName('Part-1', [])).toBe('Part-2');
  });

  it('only treats digits at the very end as the counter', () => {
    expect(nextCopyName('2 Boxes', [])).toBe('2 Boxes 1');
  });

  it('skips past a name already in use', () => {
    // Scene already has "Sphere 1", "Sphere 2", "Sphere 3" — duplicating
    // "Sphere 1" must not collide with the existing "Sphere 2".
    expect(nextCopyName('Sphere 1', ['Sphere 1', 'Sphere 2', 'Sphere 3'])).toBe('Sphere 4');
  });

  it('keeps skipping through a run of consecutive taken names', () => {
    expect(nextCopyName('Box 1', ['Box 2', 'Box 3', 'Box 4'])).toBe('Box 5');
  });

  it('accepts a Set as well as an array', () => {
    expect(nextCopyName('Sphere 1', new Set(['Sphere 2']))).toBe('Sphere 3');
  });
});
