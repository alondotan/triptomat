import type { SourceRefs } from '@/types/trip';

export { supabase } from '@/integrations/supabase/client';

export function hasValue(v: unknown): boolean {
  return v !== null && v !== undefined && v !== '';
}

export function mergeWithNewWins(old: unknown, incoming: unknown): unknown {
  if (!hasValue(incoming)) return old;
  if (typeof incoming !== 'object' || Array.isArray(incoming)) return incoming;
  if (typeof old !== 'object' || old === null || Array.isArray(old)) return incoming;
  const result: Record<string, unknown> = { ...(old as Record<string, unknown>) };
  for (const key of Object.keys(incoming as Record<string, unknown>)) {
    result[key] = mergeWithNewWins(
      (old as Record<string, unknown>)[key],
      (incoming as Record<string, unknown>)[key],
    );
  }
  return result;
}

/** Levenshtein edit distance between two strings. O(m·n) time, O(n) space. */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const row: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = i;
    for (let j = 1; j <= n; j++) {
      const temp = row[j];
      row[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(row[j - 1], row[j], prev);
      prev = temp;
    }
  }
  return row[n];
}

/**
 * Fuzzy name match for deduplication.
 *
 * Rules (in order):
 * 1. Exact match (case-insensitive) → true
 * 2. Substring: shorter string is contained in longer — only when shorter ≥ 4 chars,
 *    to avoid generic words ("Bar", "The", "Spa") matching unrelated names.
 * 3. Levenshtein: catches typos ("Bankok" ↔ "Bangkok") for similarly-lengthed
 *    strings (length ratio ≥ 0.75), allowing 1 edit for short names and 2 for longer.
 */
export function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  if (x === y) return true;

  const shorter = x.length <= y.length ? x : y;
  const longer  = x.length <= y.length ? y : x;

  // Substring match — require shorter ≥ 4 chars to filter out generic words
  if (shorter.length >= 4 && longer.includes(shorter)) return true;

  // Levenshtein — only for similarly-lengthed strings to avoid false positives
  if (shorter.length >= 4 && shorter.length / longer.length >= 0.75) {
    const maxEdits = shorter.length <= 5 ? 1 : 2;
    if (levenshtein(x, y) <= maxEdits) return true;
  }

  return false;
}

export function mergeSourceRefs(a: SourceRefs, b: SourceRefs): SourceRefs {
  const merged: SourceRefs = {
    email_ids: [...new Set([...(a.email_ids || []), ...(b.email_ids || [])])],
    recommendation_ids: [...new Set([...(a.recommendation_ids || []), ...(b.recommendation_ids || [])])],
  };
  const mapListIds = [...new Set([...(a.map_list_ids || []), ...(b.map_list_ids || [])])];
  if (mapListIds.length > 0) merged.map_list_ids = mapListIds;
  return merged;
}

/** Returns true if sourceRefs has no remaining sources of any kind. */
export function isSourceRefsEmpty(refs: SourceRefs): boolean {
  return (
    (!refs.email_ids || refs.email_ids.length === 0) &&
    (!refs.recommendation_ids || refs.recommendation_ids.length === 0) &&
    (!refs.map_list_ids || refs.map_list_ids.length === 0)
  );
}

export const STATUS_PRIORITY: Record<string, number> = {
  booked: 6, visited: 5, skipped: 4, scheduled: 3, planned: 2, interested: 1, suggested: 0,
};

/** @deprecated Use STATUS_PRIORITY — values are identical. */
export const TRANSPORT_STATUS_PRIORITY = STATUS_PRIORITY;
