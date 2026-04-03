import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { AppLayout } from '@/shared/components/layout';
import { AIChatCore } from '@/features/chat/AIChatCore';
import { HomeMapPanel } from '@/features/home/HomeMapPanel';
import { HomeSuggestionsPanel } from '@/features/home/HomeSuggestionsPanel';
import { OverviewItineraryPanel } from '@/features/overview/OverviewItineraryPanel';
import { loadFestivalData } from '@/features/geodata/festivalService';
import { loadCountryData } from '@/features/trip/tripLocationService';
import { suggestionsFromToolCall, type ChatSuggestion } from '@/features/home/chatSuggestions';
import type { TripContext } from '@/features/chat/AIChatSheet';

// Simple month-name helper for festival period labels
function monthsLabel(months?: number[]): string | undefined {
  if (!months?.length) return undefined;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map(m => names[m - 1]).filter(Boolean).join('/');
}

let nextSuggId = 1;

const HomePage = () => {
  const { t } = useTranslation();
  const { activeTrip, tripLocationTree } = useActiveTrip();
  const { pois } = usePOI();

  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const [festivals, setFestivals] = useState<TripContext['festivals']>([]);
  // name (lowercase) → image URL, built from country geodata places (triggers re-render for suggestions panel)
  const [placeImageMap, setPlaceImageMap] = useState<Map<string, string>>(new Map());
  // Tourist region markers for empty-state map display
  const [regionMarkers, setRegionMarkers] = useState<Array<{ id: string; name: string; pos?: [number, number]; boundary?: import('geojson').Geometry }>>([]);
  // name (lowercase) → [lat, lng] from geodata — ref so handleItineraryUpdate can read without stale closure
  const placeCoordMapRef = useRef<Map<string, [number, number]>>(new Map());
  // Cross-panel selection: the currently highlighted place name (lowercase)
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const seenNamesRef = useRef<Set<string>>(new Set());

  // Load festival data + geodata place images/coords for trip countries
  useEffect(() => {
    if (!activeTrip?.countries?.length) return;
    let cancelled = false;
    (async () => {
      const festivalResult: NonNullable<TripContext['festivals']> = [];
      const imageMap = new Map<string, string>();
      const coordMap = new Map<string, [number, number]>();
      const regions: Array<{ id: string; name: string; pos: [number, number] }> = [];

      for (const country of activeTrip.countries) {
        const [festData, countryData] = await Promise.all([
          loadFestivalData(country),
          loadCountryData(country),
        ]);
        if (cancelled) return;

        if (festData) {
          festData.public_holidays.forEach(h => {
            festivalResult.push({ name: h.name, country, period: h.date?.slice(0, 2) ? `Month ${h.date.slice(0, 2)}` : undefined });
          });
          festData.cultural_festivals.forEach(f => {
            festivalResult.push({ name: f.name, country, period: monthsLabel(f.typical_months) });
          });
        }

        if (countryData?.places) {
          for (const place of countryData.places) {
            if (!place.name) continue;
            const key = place.name.toLowerCase();
            if (place.image) imageMap.set(key, place.image);
            if (place.coordinates) coordMap.set(key, [place.coordinates.lat, place.coordinates.lng]);
          }
        }

        if (countryData?.locations) {
          const boundaries = countryData.boundaries as Record<string, unknown> | undefined;
          for (const loc of countryData.locations) {
            const boundary = boundaries?.[loc.id];
            const pos: [number, number] | undefined = loc.coordinates
              ? [loc.coordinates.lat, loc.coordinates.lng]
              : undefined;
            if (pos || boundary) {
              regions.push({ id: loc.id, name: loc.name, pos, boundary: boundary as import('geojson').Geometry | undefined });
            }
          }
        }
      }

      if (!cancelled) {
        setFestivals(festivalResult);
        setPlaceImageMap(imageMap);
        placeCoordMapRef.current = coordMap;
        setRegionMarkers(regions);
      }
    })();
    return () => { cancelled = true; };
  }, [activeTrip?.countries?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build enriched TripContext — memoised to avoid re-renders
  const tripContext = useMemo<TripContext | null>(() => {
    if (!activeTrip) return null;
    return {
      tripId: activeTrip.id,
      tripName: activeTrip.name,
      countries: activeTrip.countries,
      startDate: activeTrip.startDate,
      endDate: activeTrip.endDate,
      numberOfDays: activeTrip.numberOfDays,
      status: activeTrip.status,
      currency: activeTrip.currency,
      locations: (tripLocationTree ?? []).flatMap(n => [
        n.site,
        ...(n.sub_sites ?? []).flatMap(s => [s.site, ...(s.sub_sites ?? []).map(c => c.site)]),
      ]),
      existingPOIs: pois
        .slice(0, 60)
        .map(p => ({ name: p.name, category: p.category, status: p.status, city: p.location?.city })),
      festivals,
    };
  }, [activeTrip, tripLocationTree, pois, festivals]);

  // Shared helper: add a list of place-name suggestions to the panel + map
  const addSuggestionsToPanel = useCallback((
    items: Array<{ name: string; location?: string; day?: number }>,
    messageIndex: number,
  ) => {
    const fresh = items.filter(s => !seenNamesRef.current.has(s.name.toLowerCase()));
    if (!fresh.length) return;
    fresh.forEach(s => seenNamesRef.current.add(s.name.toLowerCase()));
    setSuggestions(prev => {
      const prevFromOtherMessages = prev.filter(s => s.sourceMessageIndex !== messageIndex);
      return [
        ...prevFromOtherMessages,
        ...fresh.map(s => ({
          ...s,
          id: String(nextSuggId++),
          coordinates: placeCoordMapRef.current.get(s.name.toLowerCase()),
          sourceMessageIndex: messageIndex,
        })),
      ];
    });
  }, []);

  // Called when set_itinerary fires — structured itinerary update
  const handleItineraryUpdate = useCallback((
    places: Array<{ name: string; day?: number; location?: string }>,
    messageIndex: number,
  ) => {
    const parsed = suggestionsFromToolCall(places, messageIndex);
    addSuggestionsToPanel(parsed, messageIndex);
  }, [addSuggestionsToPanel]);

  // Called when suggest_places fires — non-destructive recommendations
  const handleSuggestPlaces = useCallback((
    places: Array<{ name: string; category: string; city?: string; country?: string; why?: string }>,
    messageIndex: number,
  ) => {
    const items = places
      .filter(p => p.name && p.name.length >= 2)
      .map(p => ({ name: p.name, location: p.city }));
    addSuggestionsToPanel(items, messageIndex);
  }, [addSuggestionsToPanel]);

  // Clear suggestions when trip changes
  const lastTripIdRef = useRef(activeTrip?.id);
  useEffect(() => {
    if (activeTrip?.id !== lastTripIdRef.current) {
      lastTripIdRef.current = activeTrip?.id;
      setSuggestions([]);
      seenNamesRef.current.clear();
      setSelectedName(null);
    }
  }, [activeTrip?.id]);

  if (!activeTrip || !tripContext) {
    return (
      <AppLayout hideHero>
        <div className="text-center py-16 text-muted-foreground text-sm">
          {t('common.noTripSelected')}
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout hideHero fillHeight hideFAB>
      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex flex-col flex-1 min-h-0 -mx-6 overflow-hidden">

        {/* Main 3 columns */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Map */}
          <div className="w-[34%] shrink-0 h-full p-3">
            <HomeMapPanel
              suggestions={suggestions}
              countries={activeTrip.countries}
              regionMarkers={regionMarkers}
              selectedName={selectedName}
              onSelectName={setSelectedName}
            />
          </div>

          {/* CENTER: Chat */}
          <div className="flex-1 min-w-0 flex flex-col border-x h-full">
            <AIChatCore
              tripContext={tripContext}
              className="flex-1 min-h-0"
              onItineraryUpdate={handleItineraryUpdate}
              onSuggestPlaces={handleSuggestPlaces}
              instantApply
            />
          </div>

          {/* RIGHT: Schedule */}
          <div className="w-[260px] shrink-0 h-full border-l overflow-y-auto">
            <OverviewItineraryPanel selectedName={selectedName} onSelectName={setSelectedName} />
          </div>
        </div>

        {/* Bottom: Suggestions horizontal strip */}
        <div className="shrink-0 border-t h-[116px]">
          <HomeSuggestionsPanel
            suggestions={suggestions}
            placeImageMap={placeImageMap}
            selectedName={selectedName}
            onSelectName={setSelectedName}
          />
        </div>
      </div>

      {/* ── Mobile: stacked chat (full screen) ── */}
      <div className="lg:hidden flex flex-col flex-1 min-h-0 overflow-hidden">
        <AIChatCore
          tripContext={tripContext}
          compact
          className="flex-1 min-h-0"
          onItineraryUpdate={handleItineraryUpdate}
          instantApply
        />
        {suggestions.length > 0 && (
          <div className="shrink-0 max-h-40 border-t overflow-hidden">
            <HomeSuggestionsPanel
              suggestions={suggestions}
              placeImageMap={placeImageMap}
              selectedName={selectedName}
              onSelectName={setSelectedName}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default HomePage;
