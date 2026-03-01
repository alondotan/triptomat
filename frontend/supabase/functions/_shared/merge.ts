/** Returns true if a value is considered "present" (not null, undefined, or empty string). */
export function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

/**
 * Merge two objects: new wins when both have a value.
 * If incoming field is null/undefined/empty-string, the old value is preserved.
 * Arrays are replaced entirely by the new value.
 */
export function mergeWithNewWins(old: any, incoming: any): any {
  if (!hasValue(incoming)) return old;
  if (typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  if (typeof old !== 'object' || old === null || Array.isArray(old)) return incoming;
  const result = { ...old };
  for (const key of Object.keys(incoming)) {
    result[key] = mergeWithNewWins(old[key], incoming[key]);
  }
  return result;
}
