import { useEffect } from 'react';
import { GeoJSON, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import type { GeoJSON as GeoJSONType } from 'geojson';
import type { NavigationNode, ChildRegion } from '@/hooks/useCountryMapData';

interface BoundaryLayerProps {
  currentNode: NavigationNode | null;
  currentBoundary: GeoJSONType.Geometry | null;
  childRegions: ChildRegion[];
  navigateTo: (node: NavigationNode) => void;
  showCities?: boolean;
}

const REGION_COLOR = '#3498db';
const OUTLINE_COLOR = '#444';

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
      // Try to fit all child boundaries (e.g. country outlines at root level)
      const withBoundary = childRegions.filter((c) => c.boundary);
      if (withBoundary.length > 0) {
        const fc: GeoJSON.FeatureCollection = {
          type: 'FeatureCollection',
          features: withBoundary.map((c) => ({ type: 'Feature' as const, geometry: c.boundary!, properties: {} })),
        };
        map.fitBounds(L.geoJSON(fc).getBounds().pad(0.05));
      } else {
        const coords = childRegions
          .filter((c) => c.center)
          .map((c) => c.center!);
        if (coords.length > 0) {
          map.fitBounds(L.latLngBounds(coords.map((c) => L.latLng(c[0], c[1]))).pad(0.1), { maxZoom: 13 });
        }
      }
    }
  }, [currentBoundary, childRegions, map]);

  return null;
}

export function BoundaryLayer({
  currentNode,
  currentBoundary,
  childRegions,
  navigateTo,
  showCities = true,
}: BoundaryLayerProps) {
  if (!currentNode) return null;

  const nodeKey = currentNode.id;

  return (
    <>
      <FitToNode currentBoundary={currentBoundary} childRegions={childRegions} />

      {/* Current node boundary as dashed outline — always visible */}
      {currentBoundary && (
        <GeoJSON
          key={`outline-${nodeKey}`}
          data={{ type: 'Feature', geometry: currentBoundary, properties: {} } as GeoJSON.Feature}
          style={{ color: OUTLINE_COLOR, weight: 3, fillOpacity: 0.02, fillColor: OUTLINE_COLOR, dashArray: '8,5' }}
        />
      )}

      {/* Child region boundaries — always visible; city center dots toggled by showCities */}
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

            {showCities && child.center && (
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

    </>
  );
}
