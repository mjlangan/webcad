/** Increments a trailing number once ("Sphere 1" -> "Sphere 2"), or appends " 1" if there isn't one. */
function incrementOnce(name: string): string {
  const match = name.match(/^(.*?)(\d+)$/);
  if (!match) return `${name} 1`;
  const [, base, digits] = match;
  return `${base}${Number(digits) + 1}`;
}

/**
 * Derives a copy/paste name from a source name: increments (or appends) a
 * trailing number, then keeps incrementing past any name already in
 * `existingNames` so the result never collides with a name already in use
 * (e.g. duplicating "Sphere 1" when "Sphere 2" already exists in the scene
 * produces "Sphere 3", not a second "Sphere 2").
 */
export function nextCopyName(name: string, existingNames: Iterable<string>): string {
  const taken = existingNames instanceof Set ? existingNames : new Set(existingNames);
  let candidate = incrementOnce(name);
  while (taken.has(candidate)) {
    candidate = incrementOnce(candidate);
  }
  return candidate;
}
