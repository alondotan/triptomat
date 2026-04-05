import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { DraftDay, DraftPlace } from '@/types/itineraryDraft';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { AppLayout } from '@/shared/components/layout';
import { AIChatCore } from '@/features/chat/AIChatCore';
import { HomeMapPanel } from '@/features/home/HomeMapPanel';
import { HomeSuggestionsPanel } from '@/features/home/HomeSuggestionsPanel';
import { OverviewItineraryPanel } from '@/features/overview/OverviewItineraryPanel';
import { loadFestivalData } from '@/features/geodata/festivalService';
import { loadCountryData } from '@/features/trip/tripLocationService';
import { suggestionsFromToolCall, type ChatSuggestion } from '@/features/home/chatSuggestions';
import {
  panelItemsFromItinerary,
  panelItemsFromSuggestions,
  type PanelItem,
  type SelectedLevel,
  type ContextMode,
} from '@/features/home/panelItems';
import type { TripContext } from '@/features/chat/AIChatSheet';

const CATEGORY_MAP: Record<string, DraftPlace['category']> = {
  accommodation: 'accommodation',
  eatery: 'eatery',
  attraction: 'attraction',
  service: 'service',
};

// Simple month-name helper for festival period labels
function monthsLabel(months?: number[]): string | undefined {
  if (!months?.length) return undefined;
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return months.map(m => names[m - 1]).filter(Boolean).join('/');
}

let nextSuggId = 1;

const HomePage = () => {
  const { t } = useTranslation();
  const { activeTrip, tripLocationTree, tripLocations, tripPlaces } = useActiveTrip();
  const { pois } = usePOI();
  const { itineraryDays } = useItinerary();

  const [suggestions, setSuggestions] = useState<ChatSuggestion[]>([]);
  const [festivals, setFestivals] = useState<TripContext['festivals']>([]);
  const [locationsFlat, setLocationsFlat] = useState<string[]>([]);
  const [allPlaces, setAllPlaces] = useState<Array<{ name: string; category: string }>>([]);
  // name (lowercase) → image URL, built from country geodata places
  const [placeImageMap, setPlaceImageMap] = useState<Map<string, string>>(new Map());
  // Tourist region markers for empty-state map display
  const [regionMarkers, setRegionMarkers] = useState<Array<{ id: string; name: string; pos?: [number, number]; boundary?: import('geojson').Geometry }>>([]);
  // name (lowercase) → [lat, lng] from geodata — ref so handleItineraryUpdate can read without stale closure
  const placeCoordMapRef = useRef<Map<string, [number, number]>>(new Map());
  // Cross-panel selection: the currently highlighted place name (lowercase)
  const [selectedName, setSelectedName] = useState<string | null>(null);
  // Selected tree level — drives filtering of map + objects list
  const [selectedLevel, setSelectedLevel] = useState<SelectedLevel>({ type: 'trip' });
  // Context mode: itinerary (AI set_itinerary) vs recommendation (AI suggest_places)
  const [contextMode, setContextMode] = useState<ContextMode>('empty');
  const seenNamesRef = useRef<Set<string>>(new Set());
  // Snapshot preview: set when user clicks "View plan snapshot" in chat
  const [previewSnapshot, setPreviewSnapshot] = useState<DraftDay[] | null>(null);

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

        const flatLocs: string[] = [];
        const flatPlaces: Array<{ name: string; category: string }> = [];
        for (const country of activeTrip.countries) {
          const cd = await loadCountryData(country);
          if (!cd) continue;
          function collectCityNames(locs: typeof cd.locations): void {
            for (const loc of (locs || [])) {
              if (loc.name) flatLocs.push(loc.name);
              if ((loc as { children?: typeof cd.locations }).children?.length) {
                collectCityNames((loc as { children: typeof cd.locations }).children);
              }
            }
          }
          collectCityNames(cd.locations ?? []);
          (cd.places ?? []).forEach((p: { name?: string; category?: string }) => {
            if (p.name) flatPlaces.push({ name: p.name, category: p.category || 'attraction' });
          });
        }
        if (!cancelled) {
          setLocationsFlat([...new Set(flatLocs)]);
          setAllPlaces(flatPlaces);
        }
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
        .filter(p => p.location?.city)
        .slice(0, 200)
        .map(p => ({ name: p.name, category: p.category, status: p.status, city: p.location?.city })),
      festivals,
      locationsFlat,
      allPlaces,
    };
  }, [activeTrip, tripLocationTree, pois, festivals, locationsFlat, allPlaces]);

  // Derive live itinerary as DraftDay[] — used by OverviewItineraryPanel and panelItems
  const liveDays = useMemo<DraftDay[]>(() => {
    const poiMap = new Map(pois.map(p => [p.id, p]));
    const placeLocMap = new Map(
      tripPlaces.map(tp => {
        const loc = tripLocations.find(l => l.id === tp.tripLocationId);
        return [tp.id, loc?.name ?? ''];
      })
    );
    return itineraryDays.map(day => ({
      dayNumber: day.dayNumber,
      date: day.date,
      locationContext: (day.tripPlaceId && placeLocMap.get(day.tripPlaceId)) || undefined,
      places: (day.activities || [])
        .filter(a => a.type === 'poi' && poiMap.has(a.id))
        .sort((a, b) => a.order - b.order)
        .map(a => {
          const poi = poiMap.get(a.id)!;
          return {
            name: poi.name,
            category: CATEGORY_MAP[poi.category || ''] || 'attraction',
            placeType: poi.placeType || poi.activityType || undefined,
            city: poi.location?.city,
            existingPoiId: a.id,
            time: a.time_window?.start,
          };
        }),
    }));
  }, [itineraryDays, pois, tripLocations, tripPlaces]);

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
    setContextMode('itinerary');
  }, [addSuggestionsToPanel]);

  // Called when suggest_places fires — non-destructive recommendations
  const handleSuggestPlaces = useCallback((
    places: Array<{ name: string; category: string; sub_category?: string; location_id?: string; location_name?: string; city?: string; country?: string; why?: string }>,
    messageIndex: number,
  ) => {
    const items = places
      .filter(p => p.name && p.name.length >= 2)
      .map(p => ({ name: p.name, location: p.location_name ?? p.city }));
    addSuggestionsToPanel(items, messageIndex);
    setContextMode('recommendation');
  }, [addSuggestionsToPanel]);

  // Handle level selection from the tree — also syncs selectedName for activity level
  const handleSelectLevel = useCallback((level: SelectedLevel) => {
    setSelectedLevel(level);
    if (level.type === 'activity') setSelectedName(level.name);
  }, []);

  // Auto-switch to itinerary mode on first load when there are live days
  useEffect(() => {
    if (contextMode === 'empty' && liveDays.length > 0) {
      setContextMode('itinerary');
    }
  }, [liveDays.length, contextMode]);

  // Clear state when trip changes
  const lastTripIdRef = useRef(activeTrip?.id);
  useEffect(() => {
    if (activeTrip?.id !== lastTripIdRef.current) {
      lastTripIdRef.current = activeTrip?.id;
      setSuggestions([]);
      seenNamesRef.current.clear();
      setSelectedName(null);
      setSelectedLevel({ type: 'trip' });
      setContextMode('empty');
    }
  }, [activeTrip?.id]);

  // Derive snapshot suggestions from previewSnapshot days
  const snapshotSuggestions = useMemo<ChatSuggestion[]>(() => {
    if (!previewSnapshot) return suggestions;
    let id = 0;
    return previewSnapshot
      .flatMap(d => d.places)
      .filter(p => p.name && p.isSpecificPlace !== false)
      .map(p => ({
        id: `snap-${id++}-${p.name}`,
        name: p.name!,
        location: p.locationName ?? p.city,
        coordinates: placeCoordMapRef.current.get(p.name!.toLowerCase()),
        sourceMessageIndex: -1,
      }));
  }, [previewSnapshot, suggestions]);

  // Unified panel items for map + suggestions strip
  // placeCoordMapRef.current is a ref — intentionally not in deps (changes with geodata load)
  const panelItems = useMemo<PanelItem[]>(() => {
    if (previewSnapshot) {
      return panelItemsFromSuggestions(snapshotSuggestions, pois, placeImageMap, placeCoordMapRef.current);
    }
    if (contextMode === 'itinerary' && liveDays.length > 0) {
      return panelItemsFromItinerary(liveDays, pois, selectedLevel);
    }
    return panelItemsFromSuggestions(suggestions, pois, placeImageMap, placeCoordMapRef.current);
  }, [contextMode, liveDays, pois, selectedLevel, suggestions, placeImageMap, previewSnapshot, snapshotSuggestions]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!activeTrip || !tripContext) {
    return (
      <AppLayout hideHero>
        <div className="text-center py-16 text-muted-foreground text-sm">
          {t('common.noTripSelected')}
        </div>
      </AppLayout>
    );
  }

  const displayDays = previewSnapshot ?? liveDays;

  return (
    <AppLayout hideHero fillHeight hideFAB>
      {/* ── Desktop layout ── */}
      <div className="hidden lg:flex flex-col flex-1 min-h-0 -mx-6 overflow-hidden">

        {/* Preview banner */}
        {previewSnapshot && (
          <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-1.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs">
            <span>Viewing a past plan snapshot — changes are not saved</span>
            <button
              onClick={() => setPreviewSnapshot(null)}
              className="flex items-center gap-1 font-medium hover:text-amber-900"
            >
              <X size={12} /> Return to current plan
            </button>
          </div>
        )}

        {/* Main 3 columns */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* LEFT: Map */}
          <div className="w-[34%] shrink-0 h-full p-3">
            <HomeMapPanel
              items={panelItems}
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
              onViewSnapshot={setPreviewSnapshot}
              instantApply
            />
          </div>

          {/* RIGHT: Schedule */}
          <div className="w-[260px] shrink-0 h-full border-l overflow-y-auto">
            <OverviewItineraryPanel
              selectedName={selectedName}
              onSelectName={setSelectedName}
              overrideDays={displayDays}
              selectedLevel={selectedLevel}
              onSelectLevel={handleSelectLevel}
            />
          </div>
        </div>

        {/* Bottom: Suggestions horizontal strip */}
        <div className="shrink-0 border-t h-[116px]">
          <HomeSuggestionsPanel
            items={panelItems}
            selectedName={selectedName}
            onSelectName={setSelectedName}
            isPreviewMode={!!previewSnapshot}
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
          onViewSnapshot={setPreviewSnapshot}
          instantApply
        />
        {panelItems.length > 0 && (
          <div className="shrink-0 max-h-40 border-t overflow-hidden">
            <HomeSuggestionsPanel
              items={panelItems}
              selectedName={selectedName}
              onSelectName={setSelectedName}
              isPreviewMode={!!previewSnapshot}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default HomePage;
