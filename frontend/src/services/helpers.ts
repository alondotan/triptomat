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

export function fuzzyMatch(a: string, b: string): boolean {
  if (!a || !b) return false;
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
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

export const TRANSPORT_STATUS_PRIORITY: Record<string, number> = {
  booked: 6, visited: 5, skipped: 4, scheduled: 3, planned: 2, interested: 1, suggested: 0,
};
