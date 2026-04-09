import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { loadCountryData, buildDescriptionMap } from '@/features/trip/tripLocationService';

type DescEntry = { name_he?: string; description?: string; description_he?: string; image?: string };

/** Loads country JSON data and returns a map of location name/id → description entry.
 *  Shared hook so country data is loaded once across components. */
export function useLocationDescriptions(): Map<string, DescEntry> {
  const { activeTrip } = useActiveTrip();
  const [map, setMap] = useState<Map<string, DescEntry>>(new Map());

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const countries = activeTrip?.countries;
    if (!countries?.length) return;
    Promise.all(countries.map(c => loadCountryData(c))).then(results => {
      setMap(buildDescriptionMap(results));
    });
  }, [activeTrip?.countries?.join(',')]);  // eslint-disable-line react-hooks/exhaustive-deps

  return map;
}

/** Returns a function that translates a location name to Hebrew when in Hebrew mode.
 *  Falls back to the original name if no translation is found. */
export function useLocalizeLocation(): (name: string | null | undefined) => string {
  const { i18n } = useTranslation();
  const map = useLocationDescriptions();
  return useCallback(
    (name: string | null | undefined): string => {
      if (!name) return '';
      if (i18n.language !== 'he') return name;
      return map.get(name)?.name_he ?? name;
    },
    [map, i18n.language],
  );
}
