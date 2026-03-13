import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { useTransport } from '@/context/TransportContext';
import { useCountryMapData } from '@/hooks/useCountryMapData';
import { BoundaryLayer } from '@/components/map/BoundaryLayer';
import { MapBreadcrumb } from '@/components/map/MapBreadcrumb';
import { AppLayout } from '@/components/layout';
import { Badge } from '@/components/ui/badge';
import type { POIStatus } from '@/types/trip';
import type { CountryPlace } from '@/services/tripLocationService';
import { getSubCategoryLabel, getCategoryLabel } from '@/lib/subCategoryConfig';
import 'leaflet/dist/leaflet.css';

delete (L.Icon.Default.prototype as any)._getIconUrl;

const createDotIcon = (color: string, size = 22) => new L.DivIcon({
  className: '',
  html: `<div style="background:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35);"></div>`,
  iconSize: [size, size],
  iconAnchor: [size / 2, size / 2],
});

const createTransportIcon = (color: string) => new L.DivIcon({
  className: '',
  html: `<div style="background:${color};width:16px;height:16px;border-radius:3px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const POI_COLORS: Record<string, string> = {
  accommodation: '#0e7490',
  eatery: '#ea580c',
  attraction: '#16a34a',
  service: '#7c3aed',
};

const TRANSPORT_COLORS: Record<string, string> = {
  flight: '#1d4ed8',
  train: '#b45309',
  ferry: '#0891b2',
  bus: '#65a30d',
  taxi: '#d97706',
  car_rental: '#6b7280',
  default: '#64748b',
};

const ALL_STATUSES: POIStatus[] = ['suggested', 'interested', 'planned', 'scheduled', 'booked', 'visited', 'skipped'];

function FitBounds({ coordinates }: { coordinates: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (coordinates.length > 0) {
      const bounds = L.latLngBounds(coordinates.map(c => L.latLng(c[0], c[1])));
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, coordinates]);
  return null;
}

const MapPage = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { pois, addPOI, updatePOI } = usePOI();
  const { transportation } = useTransport();
  const [statusFilters, setStatusFilters] = useState<Set<POIStatus | 'all'>>(new Set(['all']));
  const [legendOpen, setLegendOpen] = useState(false);

  const countries = activeTrip?.countries || [];
  const mapData = useCountryMapData(countries);

  const LEGEND_ITEMS = [
    { color: POI_COLORS.accommodation, label: t('mapPage.legendAccommodation') },
    { color: POI_COLORS.eatery, label: t('mapPage.legendEatery') },
    { color: POI_COLORS.attraction, label: t('mapPage.legendAttraction') },
    { color: POI_COLORS.service, label: t('mapPage.legendService') },
    { color: '#1d4ed8', label: t('mapPage.legendTransportStop'), square: true },
    { color: '#3498db', label: t('mapPage.legendRegionBoundary'), outline: true },
    { color: '#e94560', label: t('mapPage.legendTopAttraction'), star: true },
  ];

  const toggleStatusFilter = (s: POIStatus | 'all') => {
    setStatusFilters(prev => {
      const next = new Set(prev);
      if (s === 'all') return new Set(['all']);
      next.delete('all');
      if (next.has(s)) next.delete(s); else next.add(s);
      return next.size === 0 ? new Set(['all']) : next;
    });
  };

  // ── POI markers ──────────────────────────────────────────────
  const allPoiMarkers = useMemo(() => pois
    .filter(p => p.location.coordinates?.lat && p.location.coordinates?.lng)
    .map(p => ({
      position: [p.location.coordinates!.lat, p.location.coordinates!.lng] as [number, number],
      name: p.name,
      sub: [p.subCategory ? getSubCategoryLabel(p.subCategory) : getCategoryLabel(p.category), p.location.city].filter(Boolean).join(' · '),
      status: p.status,
      color: POI_COLORS[p.category] ?? '#64748b',
    })), [pois]);

  const poiMarkers = statusFilters.has('all')
    ? allPoiMarkers
    : allPoiMarkers.filter(m => statusFilters.has(m.status));

  // Status counts for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allPoiMarkers.length };
    allPoiMarkers.forEach(m => { counts[m.status] = (counts[m.status] || 0) + 1; });
    return counts;
  }, [allPoiMarkers]);

  // ── Map-attraction like (heart) ────────────────────────────
  const LIKED_STATUSES = ['interested', 'planned', 'scheduled', 'booked', 'visited'];
  const likedPlaceIds = useMemo(() => {
    const likedNames = new Set(
      pois.filter(p => LIKED_STATUSES.includes(p.status)).map(p => p.name.toLowerCase()),
    );
    return new Set(
      mapData.topAttractions.filter(a => likedNames.has(a.name.toLowerCase())).map(a => a.id),
    );
  }, [pois, mapData.topAttractions]);

  const handleToggleAttractionLike = useCallback(async (place: CountryPlace) => {
    if (!activeTrip) return;
    const existingPoi = pois.find(p => p.name.toLowerCase() === place.name.toLowerCase());
    if (existingPoi) {
      // Same logic as POICard: toggle suggested <-> interested, ignore higher statuses
      if (['planned', 'scheduled', 'booked', 'visited', 'skipped'].includes(existingPoi.status)) return;
      const newStatus = existingPoi.status === 'interested' ? 'suggested' : 'interested';
      await updatePOI({ ...existingPoi, status: newStatus });
    } else {
      await addPOI({
        tripId: activeTrip.id,
        category: 'attraction',
        subCategory: place.subCategory || undefined,
        name: place.name,
        status: 'interested',
        location: {
          address: place.address || undefined,
          coordinates: place.coordinates,
        },
        sourceRefs: { email_ids: [], recommendation_ids: [] },
        details: place.description ? { notes: { user_summary: place.description } } : {},
        isCancelled: false,
        isPaid: false,
        imageUrl: place.photo_url || undefined,
      });
    }
  }, [activeTrip, pois, addPOI, updatePOI]);

  if (!activeTrip) {
    return <AppLayout hideHero><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  // ── Transport markers & route lines ──────────────────────────
  type TransportStop = {
    position: [number, number];
    label: string;
    route: string;
    color: string;
  };
  type RouteLine = { positions: [number, number][]; color: string };

  const transportStops: TransportStop[] = [];
  const routeLines: RouteLine[] = [];

  transportation.forEach(t => {
    const color = TRANSPORT_COLORS[t.category] ?? TRANSPORT_COLORS.default;
    t.segments.forEach(seg => {
      const fromCoords = seg.from.coordinates;
      const toCoords = seg.to.coordinates;
      const route = `${seg.from.name} → ${seg.to.name}`;
      const label = `${t.category.charAt(0).toUpperCase() + t.category.slice(1)}: ${route}`;

      if (fromCoords?.lat && fromCoords?.lng) {
        transportStops.push({ position: [fromCoords.lat, fromCoords.lng], label, route, color });
      }
      if (toCoords?.lat && toCoords?.lng) {
        transportStops.push({ position: [toCoords.lat, toCoords.lng], label, route, color });
      }
      if (fromCoords?.lat && fromCoords?.lng && toCoords?.lat && toCoords?.lng) {
        routeLines.push({
          positions: [[fromCoords.lat, fromCoords.lng], [toCoords.lat, toCoords.lng]],
          color,
        });
      }
    });
  });

  const allCoordinates: [number, number][] = [
    ...poiMarkers.map(m => m.position),
    ...transportStops.map(s => s.position),
  ];

  const hasBoundaryNav = !!mapData.currentNode;
  const defaultCenter: [number, number] = allCoordinates.length > 0 ? allCoordinates[0] : [48.8566, 2.3522];
  const totalOnMap = poiMarkers.length + transportStops.length;

  return (
    <AppLayout hideHero fillHeight>
      <div className="flex flex-col flex-1 min-h-0 gap-2 md:gap-4">
        {/* Header row */}
        <div className="flex items-center justify-between shrink-0">
          <h2 className="text-xl md:text-2xl font-bold">{t('mapPage.title')}</h2>
          <span className="text-sm text-muted-foreground">{t('mapPage.itemsOnMap', { count: totalOnMap })}</span>
        </div>

        {/* Status filter chips */}
        <div className="flex gap-1.5 flex-wrap shrink-0">
          <Badge
            variant={statusFilters.has('all') ? 'default' : 'outline'}
            className="cursor-pointer text-xs"
            onClick={() => toggleStatusFilter('all')}
          >
            {t('common.all')} ({statusCounts.all || 0})
          </Badge>
          {ALL_STATUSES.map(s =>
            statusCounts[s] ? (
              <Badge
                key={s}
                variant={statusFilters.has(s) ? 'default' : 'outline'}
                className="cursor-pointer text-xs"
                onClick={() => toggleStatusFilter(s)}
              >
                {t(`status.${s}`)} ({statusCounts[s]})
              </Badge>
            ) : null
          )}
        </div>

        {/* Map container: fixed 520px on desktop, fill remaining space on mobile */}
        <div className="relative rounded-xl overflow-hidden border shadow-sm flex-1 min-h-0 md:flex-none md:h-[520px]" style={{ isolation: 'isolate' }}>
          <MapContainer center={defaultCenter} zoom={5} className="h-full w-full" scrollWheelZoom>
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Fit bounds: defer to BoundaryLayer when navigating, otherwise use POI coords */}
            {!hasBoundaryNav && allCoordinates.length > 0 && <FitBounds coordinates={allCoordinates} />}

            {/* Boundary navigation layer */}
            <BoundaryLayer
              currentNode={mapData.currentNode}
              currentBoundary={mapData.currentBoundary}
              childRegions={mapData.childRegions}
              topAttractions={mapData.topAttractions}
              typeIconMap={mapData.typeIconMap}
              navigateTo={mapData.navigateTo}
              likedPlaceIds={likedPlaceIds}
              onToggleLike={handleToggleAttractionLike}
            />

            {/* Route lines */}
            {routeLines.map((line, i) => (
              <Polyline
                key={i}
                positions={line.positions}
                color={line.color}
                weight={2}
                dashArray="6 4"
                opacity={0.6}
              />
            ))}

            {/* POI markers */}
            {poiMarkers.map((m, i) => (
              <Marker key={`poi-${i}`} position={m.position} icon={createDotIcon(m.color)}>
                <Popup>
                  <div className="text-sm space-y-0.5">
                    <div className="font-semibold">{m.name}</div>
                    <div className="text-muted-foreground text-xs">{m.sub}</div>
                    <div className="text-xs capitalize" style={{ color: m.color }}>{m.status}</div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Transport stop markers */}
            {transportStops.map((s, i) => (
              <Marker key={`tr-${i}`} position={s.position} icon={createTransportIcon(s.color)}>
                <Popup>
                  <div className="text-sm space-y-0.5">
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.route}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          {/* Breadcrumb navigation */}
          {hasBoundaryNav && (
            <MapBreadcrumb
              breadcrumbs={mapData.breadcrumbs}
              onJumpTo={mapData.jumpTo}
              onBack={mapData.goBack}
              canGoBack={mapData.canGoBack}
            />
          )}

          {/* Collapsible Legend */}
          <div className="absolute bottom-4 right-4 z-[1000] bg-white/90 backdrop-blur-sm rounded-lg shadow text-xs">
            <button
              onClick={() => setLegendOpen(o => !o)}
              className="flex items-center gap-1.5 px-3 py-2 w-full font-medium text-gray-700"
            >
              <span>{t('mapPage.legend')}</span>
              {legendOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
            {legendOpen && (
              <div className="px-3 pb-2.5 space-y-1.5">
                {LEGEND_ITEMS.map(item => (
                  <div key={item.label} className="flex items-center gap-2">
                    <div style={{
                      background: (item as any).outline ? 'transparent' : (item as any).star ? '#e94560' : item.color,
                      width: (item as any).star ? 16 : item.square ? 12 : 14,
                      height: (item as any).star ? 16 : item.square ? 12 : 14,
                      borderRadius: item.square ? 3 : (item as any).outline ? 3 : '50%',
                      border: (item as any).outline ? `2px solid ${item.color}` : '2px solid white',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
                      flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontSize: 10,
                    }}>
                      {(item as any).star ? '★' : ''}
                    </div>
                    <span className="text-gray-700">{item.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {totalOnMap === 0 && !hasBoundaryNav && (
          <p className="text-sm text-muted-foreground text-center shrink-0">
            {t('mapPage.noItems')}
          </p>
        )}
      </div>
    </AppLayout>
  );
};

export default MapPage;
