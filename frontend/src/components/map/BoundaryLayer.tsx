import { useEffect } from 'react';
import { GeoJSON, CircleMarker, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSON as GeoJSONType } from 'geojson';
import type { NavigationNode, ChildRegion } from '@/hooks/useCountryMapData';
import type { CountryPlace } from '@/services/tripLocationService';

interface BoundaryLayerProps {
  currentNode: NavigationNode | null;
  currentBoundary: GeoJSONType.Geometry | null;
  childRegions: ChildRegion[];
  topAttractions: CountryPlace[];
  typeIconMap: Record<string, string>;
  navigateTo: (node: NavigationNode) => void;
  likedPlaceIds?: Set<string>;
  onToggleLike?: (place: CountryPlace) => void;
}

const REGION_COLOR = '#3498db';
const OUTLINE_COLOR = '#444';

const createAttractionIcon = (iconName: string = 'location_on') =>
  new L.DivIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:#e94560;color:white;box-shadow:0 2px 6px rgba(0,0,0,0.3);border:2px solid white;cursor:pointer;">
      <span class="material-symbols-outlined" style="font-size:16px;">${iconName}</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

function FitToNode({
  currentBoundary,
  childRegions,
}: {
  currentBoundary: GeoJSONType.Geometry | null;
  childRegions: ChildRegion[];
}) {
  const map = useMap();

  useEffect(() => {
    if (currentBoundary) {
      const layer = L.geoJSON({ type: 'Feature', geometry: currentBoundary, properties: {} } as GeoJSON.Feature);
      map.fitBounds(layer.getBounds().pad(0.05));
    } else {
      const coords = childRegions
        .filter((c) => c.center)
        .map((c) => c.center!);
      if (coords.length > 0) {
        map.fitBounds(L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1]))).pad(0.1), { maxZoom: 13 });
      }
    }
  }, [currentBoundary, childRegions, map]);

  return null;
}

export function BoundaryLayer({
  currentNode,
  currentBoundary,
  childRegions,
  topAttractions,
  typeIconMap,
  navigateTo,
  likedPlaceIds,
  onToggleLike,
}: BoundaryLayerProps) {
  if (!currentNode) return null;

  const nodeKey = currentNode.id;

  return (
    <>
      <FitToNode currentBoundary={currentBoundary} childRegions={childRegions} />

      {/* Current node boundary as dashed outline */}
      {currentBoundary && (
        <GeoJSON
          key={`outline-${nodeKey}`}
          data={{ type: 'Feature', geometry: currentBoundary, properties: {} } as GeoJSON.Feature}
          style={{ color: OUTLINE_COLOR, weight: 3, fillOpacity: 0.02, fillColor: OUTLINE_COLOR, dashArray: '8,5' }}
        />
      )}

      {/* Child region boundaries */}
      {childRegions.map((child) => {
        const canNavigate = child.node.children.length > 0 || !!child.boundary || (child.node.topAttractions?.length ?? 0) > 0;

        return (
          <span key={child.node.id}>
            {child.boundary && (
              <GeoJSON
                key={`region-${child.node.id}`}
                data={{ type: 'Feature', geometry: child.boundary, properties: {} } as GeoJSON.Feature}
                style={{
                  color: REGION_COLOR,
                  weight: 3,
                  fillOpacity: 0.12,
                  fillColor: REGION_COLOR,
                  ...(canNavigate ? { cursor: 'pointer' } : {}),
                }}
                eventHandlers={canNavigate ? { click: () => navigateTo(child.node) } : undefined}
              >
                <Tooltip direction="center">{child.node.name}</Tooltip>
              </GeoJSON>
            )}

            {child.center && (
              <CircleMarker
                center={child.center}
                radius={child.boundary ? 4 : 7}
                pathOptions={{
                  color: REGION_COLOR,
                  fillColor: child.boundary ? REGION_COLOR : '#fff',
                  fillOpacity: child.boundary ? 0.8 : 0.9,
                  weight: 2,
                }}
                eventHandlers={canNavigate ? { click: () => navigateTo(child.node) } : undefined}
              >
                <Tooltip direction="top" offset={[0, -8]}>{child.node.name}</Tooltip>
              </CircleMarker>
            )}
          </span>
        );
      })}

      {/* Top attraction markers */}
      {topAttractions.map((place) => {
        if (!place.coordinates) return null;
        return (
          <Marker
            key={`attr-${place.id}`}
            position={[place.coordinates.lat, place.coordinates.lng]}
            icon={createAttractionIcon(typeIconMap[place.subCategory] || 'location_on')}
          >
            <Popup maxWidth={300} minWidth={280} className="attraction-popup">
              <div>
                {place.photo_url && (
                  <div style={{ position: 'relative' }}>
                    <img
                      src={place.photo_url}
                      alt=""
                      style={{ width: '100%', height: 160, objectFit: 'cover', display: 'block' }}
                    />
                    {onToggleLike && (
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleLike(place); }}
                        style={{
                          position: 'absolute', top: 8, right: 8,
                          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(4px)',
                          border: 'none', borderRadius: '50%', width: 30, height: 30,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', padding: 0,
                          color: likedPlaceIds?.has(place.id) ? '#ef4444' : 'rgba(255,255,255,0.75)',
                          transition: 'color 0.2s',
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={likedPlaceIds?.has(place.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                        </svg>
                      </button>
                    )}
                  </div>
                )}
                {!place.photo_url && onToggleLike && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 8px 0' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleLike(place); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                        color: likedPlaceIds?.has(place.id) ? '#ef4444' : 'rgba(255,255,255,0.5)',
                        transition: 'color 0.2s',
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={likedPlaceIds?.has(place.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    </button>
                  </div>
                )}
                <div style={{ padding: '10px 12px' }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{place.name}</div>
                  {place.subCategory && (
                    <span style={{
                      display: 'inline-block', background: '#fce4ec', color: '#e94560',
                      padding: '1px 6px', borderRadius: 3, fontSize: 11, marginBottom: 6,
                    }}>
                      {typeIconMap[place.subCategory] && (
                        <span className="material-symbols-outlined" style={{ fontSize: 12, verticalAlign: 'middle', marginRight: 2 }}>
                          {typeIconMap[place.subCategory]}
                        </span>
                      )}
                      {place.subCategory}
                    </span>
                  )}
                  {place.rating && (
                    <div style={{ color: '#f9a825', fontSize: 12, marginBottom: 4 }}>
                      {'★'.repeat(Math.round(place.rating))}{'☆'.repeat(5 - Math.round(place.rating))}
                      <span style={{ color: '#666', fontSize: 11, marginLeft: 4 }}>
                        {place.rating} ({(place.user_ratings_total || 0).toLocaleString()})
                      </span>
                    </div>
                  )}
                  {place.description && (
                    <div style={{ fontSize: 11, color: '#555', lineHeight: 1.4, marginBottom: 4 }}>{place.description}</div>
                  )}
                  {place.address && (
                    <div style={{ fontSize: 11, color: '#888' }}>{place.address}</div>
                  )}
                </div>
              </div>
            </Popup>
            <Tooltip direction="top" offset={[0, -14]}>{place.name}</Tooltip>
          </Marker>
        );
      })}
    </>
  );
}
