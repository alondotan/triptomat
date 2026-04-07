import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Heart, Pencil } from 'lucide-react';
import { SubCategoryIcon } from '@/shared/components/SubCategoryIcon';
import { POIDetailDialog } from './POIDetailDialog';
import { getSubCategoryEntry, getSubCategoryLabel } from '@/shared/lib/subCategoryConfig';
import { usePOI } from '@/features/poi/POIContext';
import { useToggleLike } from '@/shared/hooks/useToggleLike';
import { useResolvedImage } from '@/shared/hooks/useResolvedImage';
import type { PointOfInterest } from '@/types/trip';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}'`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}:${m.toString().padStart(2, '0')}`;
}

const STATUS_KEYS: Record<string, string> = {
  suggested: 'status.suggested',
  interested: 'status.interested',
  planned: 'status.planned',
  scheduled: 'status.scheduled',
  booked: 'status.booked',
  visited: 'status.visited',
  skipped: 'status.skipped',
};

interface POICardProps {
  poi: PointOfInterest;
  level: 1 | 2 | 3;
  /** Level 2: enables inline editing of notes/duration */
  editable?: boolean;
  /** Level 2 only: when provided, shows "Add transport" button at bottom */
  onAddTransport?: () => void;
  /** Level 2: called when the card body is clicked (for map highlight). If provided, body click no longer opens the dialog. */
  onSelect?: () => void;
  /** Level 2: visual highlight ring */
  isSelected?: boolean;
  className?: string;
}

export function POICard({
  poi,
  level,
  editable = false,
  onAddTransport,
  onSelect,
  isSelected,
  className = '',
}: POICardProps) {
  const { t } = useTranslation();
  const { updatePOI } = usePOI();
  const { toggleLike } = useToggleLike();
  const [dialogOpen, setDialogOpen] = useState(false);
  const { url: resolvedImage, onError: onImageError } = useResolvedImage({ imageUrl: poi.imageUrl }, poi.name);

  // Level 2 inline edit state
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [durationValue, setDurationValue] = useState(''); // minutes as string while editing

  const iconName = getSubCategoryEntry(poi.placeType || poi.activityType || '')?.icon;

  const handleStartEditNotes = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNotesValue(poi.details.notes?.user_summary || '');
    setEditingNotes(true);
  };

  const handleStartEditDuration = (e: React.MouseEvent) => {
    e.stopPropagation();
    const dur = poi.details.activity_details?.duration;
    setDurationValue(dur != null ? String(dur) : '');
    setEditingDuration(true);
  };

  const handleSaveNotes = async () => {
    await updatePOI({
      ...poi,
      details: { ...poi.details, notes: { ...poi.details.notes, user_summary: notesValue } },
    });
    setEditingNotes(false);
  };

  const handleSaveDuration = async () => {
    const minutes = parseInt(durationValue, 10);
    await updatePOI({
      ...poi,
      details: {
        ...poi.details,
        activity_details: { ...poi.details.activity_details, duration: isNaN(minutes) ? undefined : minutes },
      },
    });
    setEditingDuration(false);
  };

  // ─── Level 1: icon + name only (drag overlay) ─────────────────────────────
  if (level === 1) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {iconName
          ? <span className="material-symbols-outlined text-sm shrink-0" aria-hidden="true">{iconName}</span>
          : <SubCategoryIcon type={poi.placeType || poi.activityType || ''} size={14} className="shrink-0" />
        }
        <span className="text-sm font-medium truncate">{poi.name}</span>
      </div>
    );
  }

  // ─── Level 2: compact card content ────────────────────────────────────────
  if (level === 2) {
    const currentDuration = poi.details.activity_details?.duration;
    const currentNotes = poi.details.notes?.user_summary;

    const handleCardClick = onSelect ?? (() => setDialogOpen(true));

    return (
      <>
        {resolvedImage && (
          <button
            type="button"
            aria-label={t('poiCard.enlargeImage')}
            className={`bg-transparent border-0 p-0 cursor-pointer shrink-0 ${isSelected ? 'ring-2 ring-primary' : ''} rounded-lg`}
            onClick={handleCardClick}
          >
            <img
              src={resolvedImage}
              alt=""
              width={56}
              height={56}
              className="w-14 h-14 rounded-lg object-cover"
              onError={onImageError}
            />
          </button>
        )}
        <button
          type="button"
          className={`flex flex-col gap-0.5 flex-1 min-w-0 cursor-pointer bg-transparent border-0 p-0 text-start ${isSelected ? 'text-primary' : ''} ${className}`}
          onClick={handleCardClick}
          onDoubleClick={() => setDialogOpen(true)}
        >
          {/* Name row */}
          <div className="flex items-center gap-2">
            {!resolvedImage && (iconName
              ? <span className="material-symbols-outlined text-sm shrink-0" aria-hidden="true">{iconName}</span>
              : <SubCategoryIcon type={poi.placeType || poi.activityType || ''} size={14} className="shrink-0" />
            )}
            <span className="text-sm font-medium truncate">{poi.name}</span>
          </div>

          {/* Duration */}
          {editable ? (
            editingDuration ? (
              <div
                className="flex flex-col gap-1"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <div className="flex flex-wrap gap-1">
                  {[15, 30, 45, 60, 90, 120, 180].map(preset => (
                    <button
                      key={preset}
                      type="button"
                      className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                        durationValue === String(preset)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border hover:border-primary/60 hover:bg-muted'
                      }`}
                      onClick={() => { setDurationValue(String(preset)); }}
                    >
                      {formatDuration(preset)}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1 items-center">
                  <input
                    type="number"
                    min="1"
                    name="duration"
                    aria-label={t('poiCard.addDuration')}
                    className="text-xs border rounded px-1.5 py-0.5 w-16 bg-background"
                    value={durationValue}
                    onChange={e => setDurationValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveDuration(); if (e.key === 'Escape') setEditingDuration(false); }}
                    placeholder={t('poiDetail.minutes')}
                    autoFocus
                  />
                  <button type="button" className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded" onClick={handleSaveDuration}>
                    {t('common.save')}
                  </button>
                  <button type="button" className="text-xs px-2 py-0.5 border border-border rounded hover:bg-muted" onClick={() => setEditingDuration(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer w-fit bg-transparent border-0 p-0"
                onClick={handleStartEditDuration}
              >
                <Clock size={11} />
                <span>{currentDuration != null ? formatDuration(currentDuration) : t('poiCard.addDuration')}</span>
              </button>
            )
          ) : currentDuration != null && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock size={11} />
              <span>{formatDuration(currentDuration)}</span>
            </div>
          )}

          {/* Notes */}
          {editable ? (
            editingNotes ? (
              <div
                className="flex flex-col gap-1"
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
              >
                <textarea
                  name="notes"
                  aria-label={t('poiDetail.notes')}
                  className="text-xs border rounded px-1.5 py-0.5 w-full resize-none bg-background"
                  value={notesValue}
                  onChange={e => setNotesValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Escape') setEditingNotes(false); }}
                  rows={2}
                  autoFocus
                />
                <div className="flex gap-1 items-center">
                  <button type="button" className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded" onClick={handleSaveNotes}>
                    {t('common.save')}
                  </button>
                  <button type="button" className="text-xs px-2 py-0.5 border border-border rounded hover:bg-muted" onClick={() => setEditingNotes(false)}>
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-muted-foreground/70 italic truncate cursor-pointer hover:text-muted-foreground w-fit max-w-full bg-transparent border-0 p-0 text-start"
                onClick={handleStartEditNotes}
              >
                {currentNotes || t('poiCard.addNote')}
              </button>
            )
          ) : currentNotes && (
            <p className="text-xs text-muted-foreground/70 italic truncate">{currentNotes}</p>
          )}

          {onAddTransport && (
            <div className="flex justify-center pt-1" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
              <button
                type="button"
                className="text-[11px] text-muted-foreground/60 hover:text-primary border border-dashed border-muted-foreground/30 hover:border-primary/50 rounded-full px-3 py-0.5 transition-colors"
                onClick={onAddTransport}
              >
                + {t('poiCard.addTransport')}
              </button>
            </div>
          )}
        </button>

        {onSelect && (
          <button
            type="button"
            aria-label={t('common.edit')}
            className="shrink-0 p-1 mt-0.5 text-muted-foreground/50 hover:text-primary transition-colors self-start"
            onClick={(e) => { e.stopPropagation(); setDialogOpen(true); }}
          >
            <Pencil size={12} />
          </button>
        )}

        {dialogOpen && (
          <POIDetailDialog poi={poi} open={dialogOpen} onOpenChange={setDialogOpen} />
        )}
      </>
    );
  }

  // ─── Level 3: compact tile (POIs page — horizontal scroll) ──────────────
  const isNew = Date.now() - new Date(poi.createdAt).getTime() < 90 * 60 * 1000;

  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await toggleLike(poi);
  };

  return (
    <>
      <button
        type="button"
        className={`cursor-pointer group ${poi.isCancelled ? 'opacity-50' : ''} ${className} bg-transparent border-0 p-0 text-start w-full`}
        onClick={() => setDialogOpen(true)}
      >
        {/* Square image with heart overlay */}
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-muted">
          {resolvedImage ? (
            <img src={resolvedImage} alt={poi.name} width={400} height={300} className="w-full h-full object-cover" onError={onImageError} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <SubCategoryIcon type={poi.placeType || poi.activityType || ''} size={32} className="text-muted-foreground/40" />
            </div>
          )}
          {/* New badge */}
          {isNew && (
            <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-green-500 text-white rounded-full leading-none z-10">
              {t('common.new')}
            </span>
          )}
          {/* Heart button overlay */}
          <button
            aria-label={t('poiCard.favorite')}
            onClick={handleToggleLike}
            className={`absolute top-1.5 right-1.5 p-1 rounded-full bg-black/30 backdrop-blur-sm transition-colors ${
              poi.status === 'interested' || poi.status === 'planned' || poi.status === 'scheduled' ? 'text-red-500' :
              poi.status === 'booked' || poi.status === 'visited' || poi.status === 'skipped' ? 'text-white/40 cursor-default' :
              'text-white/70 hover:text-red-400'
            }`}
            title={['planned', 'scheduled', 'booked', 'visited', 'skipped'].includes(poi.status) ? t(STATUS_KEYS[poi.status]) : poi.status === 'interested' ? t('poiCard.removeInterest') : t('poiCard.interestedInThis')}
          >
            <Heart
              size={14}
              fill={poi.status !== 'suggested' ? 'currentColor' : 'none'}
            />
          </button>
        </div>

        {/* Details below image */}
        <div className="mt-1.5 space-y-0.5">
          <p className="text-sm font-medium truncate">{poi.name}</p>
          {poi.location.city && (
            <p className="text-xs text-muted-foreground truncate">{poi.location.city}</p>
          )}
          {(poi.placeType || poi.activityType) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground/70">
              <SubCategoryIcon type={poi.placeType || poi.activityType} size={11} />
              <span className="truncate">{getSubCategoryLabel(poi.placeType || poi.activityType)}</span>
            </div>
          )}
        </div>
      </button>

      {dialogOpen && (
        <POIDetailDialog poi={poi} open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
    </>
  );
}
