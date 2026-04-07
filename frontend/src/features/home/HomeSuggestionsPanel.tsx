import { useState } from 'react';
import { Sparkles, Plus, Loader2, Check, Heart } from 'lucide-react';
import { SubCategoryIcon } from '@/shared/components/SubCategoryIcon';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/utils';
import { usePOI } from '@/features/poi/POIContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { POIDetailDialog } from '@/features/poi/POIDetailDialog';
import { useResolvedImage } from '@/shared/hooks/useResolvedImage';
import { useToggleLike } from '@/shared/hooks/useToggleLike';
import type { PointOfInterest } from '@/types/trip';
import type { PanelItem } from './panelItems';

const LOCKED_STATUSES = ['planned', 'scheduled', 'booked', 'visited', 'skipped'] as const;

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
  hearting: boolean;
  selected: boolean;
  onSelect: () => void;
  onAdd: (item: PanelItem) => void;
  onHeart: (item: PanelItem) => void;
  onOpenDetails: (poi: PointOfInterest) => void;
  isPreviewMode?: boolean;
}

function SuggestionCard({ item, adding, hearting, selected, onSelect, onAdd, onHeart, onOpenDetails, isPreviewMode }: SuggestionCardProps) {
  const inPlan = !!item.poiId;
  const isLiked = item.poi?.status === 'interested';
  const isLocked = !!item.poi && (LOCKED_STATUSES as readonly string[]).includes(item.poi.status);

  const { url: imgUrl, onError: onImageError } = useResolvedImage({ imageUrl: item.imageUrl }, item.name);

  // Deterministic gradient fallback based on name
  const gradientHue = (item.name.charCodeAt(0) * 37 + (item.name.charCodeAt(1) || 0) * 13) % 360;

  return (
    <div
      onClick={onSelect}
      onDoubleClick={() => { if (item.poi) onOpenDetails(item.poi); }}
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
      {imgUrl ? (
        <img
          src={imgUrl}
          alt={item.name}
          className="w-full h-full object-cover"
          onError={onImageError}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center" style={{ background: `hsl(${gradientHue}, 55%, 45%)` }}>
          {(item.poi?.placeType || item.poi?.activityType)
            ? <SubCategoryIcon type={(item.poi.placeType || item.poi.activityType)!} size={32} className="text-white/70" />
            : null}
        </div>
      )}

      {/* Dark gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />

      {/* Name */}
      <div className="absolute bottom-0 left-0 right-0 px-2 pb-1.5">
        <p className="text-white text-[10px] font-semibold leading-tight line-clamp-2">
          {item.name}
        </p>
      </div>

      {/* Heart button — top-left */}
      <Button
        size="icon"
        className={cn(
          'absolute top-1.5 left-1.5 h-5 w-5 rounded-full shadow',
          isLocked ? 'bg-black/20 opacity-40 cursor-not-allowed' : 'bg-black/40 hover:bg-black/60',
        )}
        variant="ghost"
        onClick={e => { e.stopPropagation(); if (!isLocked && !isPreviewMode) onHeart(item); }}
        disabled={hearting || isLocked || isPreviewMode}
        title={isLocked ? 'Cannot change' : isLiked ? 'Remove from favorites' : 'Add to favorites'}
      >
        {hearting
          ? <Loader2 size={9} className="animate-spin text-white" />
          : <Heart size={9} className={isLiked ? 'text-red-400 fill-red-400' : 'text-white/70'} />}
      </Button>

      {/* Status / add button — top-right */}
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
  const { toggleLike } = useToggleLike();
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [heartingIds, setHeartingIds] = useState<Set<string>>(new Set());
  const [dialogPOI, setDialogPOI] = useState<PointOfInterest | null>(null);

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

  const handleHeart = async (item: PanelItem) => {
    console.log('[handleHeart] called', { id: item.id, name: item.name, hasPoi: !!item.poi, isTemp: item.isTemporary });
    if (heartingIds.has(item.id)) return;
    setHeartingIds(prev => new Set([...prev, item.id]));
    try {
      if (item.poi) {
        await toggleLike(item.poi);
      } else {
        // Temporary suggestion — create as interested
        if (!activeTrip) {
          console.warn('[handleHeart] no activeTrip, aborting');
          return;
        }
        console.log('[handleHeart] creating POI for temporary item:', item.name);
        const result = await addPOI({
          tripId: activeTrip.id,
          category: 'attraction',
          name: item.name,
          status: 'interested',
          location: item.coordinates
            ? { coordinates: { lat: item.coordinates[0], lng: item.coordinates[1] } }
            : {},
          sourceRefs: { recommendation_ids: [], email_ids: [], map_list_ids: [] },
          details: { notes: { raw_notes: 'Added from AI chat suggestion' } },
          isCancelled: false,
          isPaid: false,
        });
        console.log('[handleHeart] addPOI result:', result);
      }
    } catch (err) {
      console.error('[handleHeart] error:', err);
    } finally {
      setHeartingIds(prev => { const n = new Set(prev); n.delete(item.id); return n; });
    }
  };

  return (
    <>
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
                  hearting={heartingIds.has(item.id)}
                  selected={isSelected}
                  onSelect={() => onSelectName(isSelected ? null : item.name)}
                  onAdd={handleAdd}
                  onHeart={handleHeart}
                  onOpenDetails={setDialogPOI}
                  isPreviewMode={isPreviewMode}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>

    <POIDetailDialog
      poi={dialogPOI ?? undefined}
      open={!!dialogPOI}
      onOpenChange={(open) => { if (!open) setDialogPOI(null); }}
    />
    </>
  );
}
