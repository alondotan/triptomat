import { useMemo } from 'react';
import { useTripList } from '@/context/TripListContext';
import { useWorldTree, type WorldTreeNode } from '@/hooks/useWorldTree';

const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'united states of america',
  'uk': 'united kingdom',
  'uae': 'united arab emirates',
};

/** Find a node in the world tree by country name (with alias + partial matching) */
function findCountryNode(node: WorldTreeNode, countryName: string): WorldTreeNode | null {
  const lower = COUNTRY_ALIASES[countryName.toLowerCase()] || countryName.toLowerCase();
  let partialMatch: WorldTreeNode | null = null;

  if (node.type === 'country') {
    const nodeLower = node.name.toLowerCase();
    if (nodeLower === lower) return node;
    if (node.name_he.toLowerCase() === lower) return node;
    if (!partialMatch && (nodeLower.startsWith(lower) || lower.startsWith(nodeLower))) {
      partialMatch = node;
    }
  }
  for (const child of node.children ?? []) {
    const found = findCountryNode(child, countryName);
    if (found) return found;
  }
  return partialMatch;
}

export const HERO_HEIGHT = 220;
export const HERO_HEIGHT_MOBILE = 140;

/** Hook to get the destination hero image URL for the active trip */
export function useDestinationImageUrl(): string | null {
  const { trips, activeTripId } = useTripList();
  const { tree } = useWorldTree();
  const activeTrip = useMemo(() => trips.find(t => t.id === activeTripId) || null, [trips, activeTripId]);

  return useMemo(() => {
    if (!tree || !activeTrip?.countries?.length) return null;
    for (const country of activeTrip.countries) {
      const countryNode = findCountryNode(tree, country);
      if (!countryNode) continue;
      if (countryNode.image) return countryNode.image;
      for (const child of countryNode.children ?? []) {
        if (child.image) return child.image;
      }
    }
    return null;
  }, [tree, activeTrip]);
}

export function DestinationHero() {
  const { trips, activeTripId } = useTripList();
  const activeTrip = useMemo(() => trips.find(t => t.id === activeTripId) || null, [trips, activeTripId]);
  const imageUrl = useDestinationImageUrl();

  if (!imageUrl) return null;

  return (
    <>
      {/* Desktop hero */}
      <div
        className="hidden md:block relative shrink-0 overflow-hidden"
        style={{ height: HERO_HEIGHT }}
      >
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="container px-6 pb-8">
            <h1 className="text-2xl font-bold text-white drop-shadow-lg">
              {activeTrip?.name}
            </h1>
            {activeTrip?.countries && activeTrip.countries.length > 0 && (
              <p className="text-sm text-white/80 mt-1 drop-shadow">
                {activeTrip.countries.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Mobile hero — compact */}
      <div
        className="md:hidden relative shrink-0 overflow-hidden"
        style={{ height: HERO_HEIGHT_MOBILE }}
      >
        <img
          src={imageUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        <div className="absolute inset-0 flex items-end">
          <div className="px-4 pb-3">
            <h1 className="text-lg font-bold text-white drop-shadow-lg">
              {activeTrip?.name}
            </h1>
            {activeTrip?.countries && activeTrip.countries.length > 0 && (
              <p className="text-xs text-white/80 drop-shadow">
                {activeTrip.countries.join(' · ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
