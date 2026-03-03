import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import {
  calculateDayRoute,
  type RouteLeg,
  type RouteStats,
  type RouteStop,
  type LegOverride,
} from '@/services/routeService';

interface UseRouteCalculationResult {
  legs: RouteLeg[];
  stats: RouteStats | null;
  isCalculating: boolean;
  isStale: boolean;
  error: string | null;
  calculate: (mode?: 'car' | 'walk') => Promise<void>;
  reset: () => void;
  setManualDuration: (fromStopId: string, minutes: number) => void;
}

/**
 * Hook that manages route calculation state for a list of stops.
 * Marks results as stale when the stop list changes.
 *
 * @param overrides — per-leg transport overrides (visual mode, OSRM mode, known duration).
 */
export function useRouteCalculation(
  stops: RouteStop[],
  overrides?: Map<string, LegOverride>,
): UseRouteCalculationResult {
  const [legs, setLegs] = useState<RouteLeg[]>([]);
  const [stats, setStats] = useState<RouteStats | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualDurations, setManualDurations] = useState<Map<string, number>>(new Map());

  // Track the stop IDs string to detect changes
  const stopKey = stops.map(s => s.id).join(',');
  const lastCalcKey = useRef('');

  // Mark as stale when stops change after a calculation
  useEffect(() => {
    if (lastCalcKey.current && lastCalcKey.current !== stopKey) {
      setIsStale(true);
    }
  }, [stopKey]);

  // Merge manual durations into overrides
  const effectiveOverrides = useMemo(() => {
    if (!overrides && manualDurations.size === 0) return undefined;
    const merged = new Map(overrides);
    for (const [key, dur] of manualDurations) {
      const existing = merged.get(key);
      if (existing && existing.durationMin == null) {
        merged.set(key, { ...existing, durationMin: dur });
      }
    }
    return merged;
  }, [overrides, manualDurations]);

  const setManualDuration = useCallback((fromStopId: string, minutes: number) => {
    setManualDurations(prev => {
      const next = new Map(prev);
      next.set(fromStopId, minutes);
      return next;
    });
    setIsStale(true);
  }, []);

  const reset = useCallback(() => {
    setLegs([]);
    setStats(null);
    setIsStale(false);
    setError(null);
    setManualDurations(new Map());
    lastCalcKey.current = '';
  }, []);

  const calculate = useCallback(async (mode: 'car' | 'walk' = 'car') => {
    if (stops.length < 2) {
      setLegs([]);
      setStats({ stops: stops.length, totalDistanceKm: 0, totalTravelMin: 0, totalStayMin: stops.reduce((s, st) => s + st.durationMin, 0) });
      setIsStale(false);
      setError(null);
      return;
    }

    setIsCalculating(true);
    setError(null);

    try {
      const result = await calculateDayRoute(stops, mode, effectiveOverrides);
      setLegs(result.legs);
      setStats(result.stats);
      setIsStale(false);
      lastCalcKey.current = stopKey;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Route calculation failed');
    } finally {
      setIsCalculating(false);
    }
  }, [stops, stopKey, effectiveOverrides]);

  return { legs, stats, isCalculating, isStale, error, calculate, reset, setManualDuration };
}
