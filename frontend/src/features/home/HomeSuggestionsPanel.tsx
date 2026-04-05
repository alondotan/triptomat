import { useState, useEffect } from 'react';
import { Sparkles, Plus, Loader2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { usePOI } from '@/features/poi/POIContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import type { PanelItem } from './panelItems';

interface HomeSuggestionsPanelProps {
  items: PanelItem[];
  selectedName: string | null;
  onSelectName: (name: string | null) => void;
  /** When true, disables add-to-trip button (snapshot/preview mode) */
  isPreviewMode?: boolean;
}

interface SuggestionCardProps {
  item: PanelItem;
  adding: boolean;
  selected: boolean;
  onSelect: () => void;
  onAdd: (item: PanelItem) => void;
  isPreviewMode?: boolean;
}

function SuggestionCard({ item, adding, selected, onSelect, onAdd, isPreviewMode }: SuggestionCardProps) {
  const inPlan = !!item.poiId;

  // Start with POI image if available, then try Wikipedia, then gradient
  const [imgUrl, setImgUrl] = useState<string | null>(item.imageUrl ?? null);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgUrl(item.imageUrl ?? null);
    setImgError(false);

    if (item.imageUrl) return; // already have image

    // Wikipedia REST API fallback
    let active = true;
    const wikiName = item.name.replace(/ /g, '_');
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!active) return;
        const url = data?.originalimage?.source || data?.thumbnail?.source || null;
        if (url) setImgUrl(url);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [item.name, item.imageUrl]);

  // Deterministic gradient fallback based on name
  const gradientHue = (item.name.charCodeAt(0) * 37 + (item.name.charCodeAt(1) || 0) * 13) % 360;

  return (
    <div
      onClick={onSelect}
      className={cn(
        'relative shrink-0 w-[140px] rounded-xl overflow-hidden border transition-all cursor-pointer',
        selected
          ? 'ring-2 ring-primary border-primary'
          : inPlan
            ? 'border-green-400 ring-1 ring-green-400 hover:ring-primary hover:border-primary'
            : 'border-border hover:border-amber-400',
      )}
      style={{ height: '100px' }}
    >
      {/* Image */}
      {imgUrl && !imgError ? (
        <img
          src={imgUrl}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full" style={{ background: `hsl(${gradientHue}, 55%, 45%)` }} />
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5">
        <p className="text-white text-[10px] font-semibold leading-tight line-clamp-2">
          {item.name}
        </p>
      </div>

      {/* Status / add button */}
      {inPlan ? (
        <div className="absolute top-1.5 right-1.5 bg-green-500 rounded-full p-0.5">
          <Check size={9} className="text-white" />
        </div>
      ) : (
        <Button
          size="icon"
          className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full bg-white/90 hover:bg-white text-foreground shadow"
          variant="ghost"
          onClick={e => { e.stopPropagation(); onAdd(item); }}
          disabled={adding || isPreviewMode}
          title={isPreviewMode ? 'Exit preview to add' : 'Add to trip'}
        >
          {adding
            ? <Loader2 size={9} className="animate-spin text-foreground" />
            : <Plus size={9} className="text-foreground" />}
        </Button>
      )}
    </div>
  );
}

export function HomeSuggestionsPanel({ items, selectedName, onSelectName, isPreviewMode = false }: HomeSuggestionsPanelProps) {
  const { addPOI } = usePOI();
  const { activeTrip } = useActiveTrip();
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());

  const handleAdd = async (item: PanelItem) => {
    if (!activeTrip || addingIds.has(item.id)) return;
    setAddingIds(prev => new Set([...prev, item.id]));
    try {
      await addPOI({
        tripId: activeTrip.id,
        category: 'attraction',
        name: item.name,
        status: 'suggested',
        location: item.coordinates
          ? { coordinates: { lat: item.coordinates[0], lng: item.coordinates[1] } }
          : {},
        sourceRefs: { recommendation_ids: [], email_ids: [], map_list_ids: [] },
        details: { notes: { raw_notes: 'Added from AI chat suggestion' } },
        isCancelled: false,
        isPaid: false,
      });
    } catch {
      // ignore
    } finally {
      setAddingIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  };

  return (
    <div className="flex items-stretch h-full overflow-hidden">
      {/* Vertical label */}
      <div className="shrink-0 flex flex-col items-center justify-center gap-1 px-3 border-r bg-muted/30">
        <Sparkles size={12} className="text-amber-500" />
        <span
          className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Suggestions
        </span>
        {items.length > 0 && (
          <span className="text-[9px] text-muted-foreground bg-muted rounded-full px-1">
            {items.length}
          </span>
        )}
      </div>

      {/* Horizontal scroll */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        {items.length === 0 ? (
          <div className="h-full flex items-center px-6 gap-2 text-muted-foreground">
            <Sparkles size={14} className="text-muted-foreground/30 shrink-0" />
            <p className="text-xs">Ask the AI for recommendations and they'll appear here.</p>
          </div>
        ) : (
          <div className="flex gap-2 p-2 h-full items-center" style={{ minWidth: 'max-content' }}>
            {items.map(item => {
              const isSelected = selectedName?.toLowerCase() === item.name.toLowerCase();
              return (
                <SuggestionCard
                  key={item.id}
                  item={item}
                  adding={addingIds.has(item.id)}
                  selected={isSelected}
                  onSelect={() => onSelectName(isSelected ? null : item.name)}
                  onAdd={handleAdd}
                  isPreviewMode={isPreviewMode}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
