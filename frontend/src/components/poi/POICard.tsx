import { useState } from 'react';
import { Clock, Heart, Trash2, CalendarDays } from 'lucide-react';
import { SubCategoryIcon } from '../shared/SubCategoryIcon';
import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { POIDetailDialog } from './POIDetailDialog';
import { BookingActions } from '../BookingActions';
import { getSubCategoryEntry } from '@/lib/subCategoryConfig';
import { usePOI } from '@/context/POIContext';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useFinance } from '@/context/FinanceContext';
import type { PointOfInterest, POIStatus } from '@/types/trip';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}'`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}ש'` : `${h}:${m.toString().padStart(2, '0')}`;
}

const statusLabels: Record<string, string> = {
  candidate: 'מועמד',
  in_plan: 'בתוכנית',
  matched: 'משודך',
  booked: 'הוזמן',
  visited: 'בוקר',
};

interface POICardProps {
  poi: PointOfInterest;
  level: 1 | 2 | 3;
  /** Level 2: enables inline editing of notes/duration. Level 3: shows delete button */
  editable?: boolean;
  /** Level 3 only: hide subCategory badge (e.g. when it's already shown as a group header) */
  showSubCategory?: boolean;
  /** Level 3 only: days the POI is assigned to */
  poiDaysMap?: Record<string, number[]>;
  /** Level 2 only: when provided, shows "הוסף תחבורה" button at bottom */
  onAddTransport?: () => void;
  className?: string;
}

export function POICard({
  poi,
  level,
  editable = false,
  showSubCategory = true,
  poiDaysMap,
  onAddTransport,
  className = '',
}: POICardProps) {
  const { updatePOI, deletePOI } = usePOI();
  const { activeTrip, sourceEmailMap } = useActiveTrip();
  const { formatDualCurrency } = useFinance();
  const [dialogOpen, setDialogOpen] = useState(false);

  // Level 2 inline edit state
  const [editingNotes, setEditingNotes] = useState(false);
  const [editingDuration, setEditingDuration] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [durationValue, setDurationValue] = useState(''); // minutes as string while editing

  const iconName = getSubCategoryEntry(poi.subCategory || '')?.icon;

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
          ? <span className="material-symbols-outlined text-sm shrink-0">{iconName}</span>
          : <SubCategoryIcon type={poi.subCategory || ''} size={14} className="shrink-0" />
        }
        <span className="text-sm font-medium truncate">{poi.name}</span>
      </div>
    );
  }

  // ─── Level 2: compact card content ────────────────────────────────────────
  if (level === 2) {
    const currentDuration = poi.details.activity_details?.duration;
    const currentNotes = poi.details.notes?.user_summary;

    return (
      <>
        <div
          className={`flex flex-col gap-0.5 flex-1 min-w-0 cursor-pointer ${className}`}
          onClick={() => setDialogOpen(true)}
        >
          {/* Name row */}
          <div className="flex items-center gap-2">
            {iconName
              ? <span className="material-symbols-outlined text-sm shrink-0">{iconName}</span>
              : <SubCategoryIcon type={poi.subCategory || ''} size={14} className="shrink-0" />
            }
            <span className="text-sm font-medium truncate">{poi.name}</span>
            {poi.location.city && (
              <span className="text-xs text-muted-foreground shrink-0">{poi.location.city}</span>
            )}
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
                    className="text-xs border rounded px-1.5 py-0.5 w-16 bg-background"
                    value={durationValue}
                    onChange={e => setDurationValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveDuration(); if (e.key === 'Escape') setEditingDuration(false); }}
                    placeholder="דקות..."
                    autoFocus
                  />
                  <button type="button" className="text-xs px-2 py-0.5 bg-primary text-primary-foreground rounded" onClick={handleSaveDuration}>
                    שמור
                  </button>
                  <button type="button" className="text-xs px-2 py-0.5 border border-border rounded hover:bg-muted" onClick={() => setEditingDuration(false)}>
                    ביטול
                  </button>
                </div>
              </div>
            ) : (
              <div
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={handleStartEditDuration}
              >
                <Clock size={11} />
                <span>{currentDuration != null ? formatDuration(currentDuration) : 'הוסף משך זמן...'}</span>
              </div>
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
              <textarea
                className="text-xs border rounded px-1.5 py-0.5 w-full resize-none bg-background"
                value={notesValue}
                onChange={e => setNotesValue(e.target.value)}
                onBlur={handleSaveNotes}
                onPointerDown={e => e.stopPropagation()}
                onClick={e => e.stopPropagation()}
                rows={2}
              />
            ) : (
              <p
                className="text-xs text-muted-foreground/70 italic truncate cursor-pointer hover:text-muted-foreground"
                onClick={handleStartEditNotes}
              >
                {currentNotes || 'הוסף הערה...'}
              </p>
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
                + הוסף תחבורה
              </button>
            </div>
          )}
        </div>

        {dialogOpen && (
          <POIDetailDialog poi={poi} open={dialogOpen} onOpenChange={setDialogOpen} />
        )}
      </>
    );
  }

  // ─── Level 3: full card (POIs page) ───────────────────────────────────────
  const handleToggleLike = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (poi.status === 'matched' || poi.status === 'booked' || poi.status === 'visited') return;
    const newStatus: POIStatus = poi.status === 'in_plan' ? 'candidate' : 'in_plan';
    await updatePOI({ ...poi, status: newStatus });
  };

  return (
    <>
      <Card
        className={`cursor-pointer hover:ring-1 hover:ring-primary/30 transition-all ${poi.isCancelled ? 'opacity-50' : ''} ${className}`}
        onClick={() => setDialogOpen(true)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={handleToggleLike}
                className={`shrink-0 transition-colors ${
                  poi.status === 'in_plan' || poi.status === 'matched' ? 'text-red-500' :
                  poi.status === 'booked' || poi.status === 'visited' ? 'text-muted-foreground/30 cursor-default' :
                  'text-muted-foreground/40 hover:text-red-400'
                }`}
                title={poi.status === 'matched' ? 'משודך ליום' : poi.status === 'in_plan' ? 'הסר מהתוכנית' : 'הוסף לתוכנית'}
              >
                <Heart
                  size={16}
                  fill={poi.status === 'in_plan' || poi.status === 'matched' ? 'currentColor' : 'none'}
                />
              </button>
              <CardTitle className="text-base">{poi.name}</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Badge variant={poi.status === 'booked' ? 'default' : 'secondary'} className="text-xs">
                {statusLabels[poi.status] || poi.status}
              </Badge>
              {poi.isCancelled && <Badge variant="destructive">בוטל</Badge>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {showSubCategory && poi.subCategory && (
            <Badge variant="outline" className="text-xs flex items-center gap-1">
              <SubCategoryIcon type={poi.subCategory} size={12} />
              {poi.subCategory}
            </Badge>
          )}

          {(poi.location.city || poi.location.country || poi.location.address) && (
            <p className="text-muted-foreground">
              <span className="material-symbols-outlined text-base align-middle ml-1">
                {iconName || 'location_on'}
              </span>
              {[poi.location.address, poi.location.city, poi.location.country].filter(Boolean).join(', ')}
            </p>
          )}

          {poi.details.cost && poi.details.cost.amount > 0 && (
            <p className="font-semibold text-primary">
              {formatDualCurrency(
                poi.details.cost.amount,
                poi.details.cost.currency || activeTrip?.currency || 'USD',
              )}
            </p>
          )}

          {poi.details.accommodation_details && (
            <div className="text-xs text-muted-foreground space-y-0.5">
              {poi.details.accommodation_details.checkin?.date && (
                <p>
                  Check-in: {poi.details.accommodation_details.checkin.date}{' '}
                  {poi.details.accommodation_details.checkin.hour || ''}
                </p>
              )}
              {poi.details.accommodation_details.checkout?.date && (
                <p>
                  Check-out: {poi.details.accommodation_details.checkout.date}{' '}
                  {poi.details.accommodation_details.checkout.hour || ''}
                </p>
              )}
            </div>
          )}

          {poi.details.notes?.user_summary && (
            <p className="text-xs text-muted-foreground italic">{poi.details.notes.user_summary}</p>
          )}

          {poiDaysMap && poiDaysMap[poi.id] && poiDaysMap[poi.id].length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <CalendarDays size={12} className="text-muted-foreground" />
              {poiDaysMap[poi.id].map(d => (
                <Badge key={d} variant="outline" className="text-[10px] px-1.5 py-0">
                  יום {d}
                </Badge>
              ))}
            </div>
          )}

          <div className="pt-2 flex justify-between items-center">
            <BookingActions
              orderNumber={poi.details.order_number}
              emailLinks={poi.sourceRefs.email_ids.map(id => ({ id, ...sourceEmailMap[id] }))}
            />
            {editable && (
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive h-7"
                onClick={e => { e.stopPropagation(); deletePOI(poi.id); }}
              >
                <Trash2 size={14} className="mr-1" /> מחק
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {dialogOpen && (
        <POIDetailDialog poi={poi} open={dialogOpen} onOpenChange={setDialogOpen} />
      )}
    </>
  );
}
