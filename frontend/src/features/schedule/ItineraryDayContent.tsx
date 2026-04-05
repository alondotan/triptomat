import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { format } from 'date-fns';
import {
  useDroppable,
  useDraggable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Building2, Sun, Moon, Clock, Lightbulb, CalendarDays,
  Plane, Train, Ship, Car, Bus, X, Plus, Navigation, GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubCategoryIcon } from '@/shared/components/SubCategoryIcon';
import { DaySection, type LocationSuggestion } from '@/features/schedule/DaySection';
import type { PointOfInterest } from '@/types/trip';


// ─── Shared types ─────────────────────────────────────────────────────────────

export interface PotentialActivity {
  id: string;
  order: number;
  type: 'poi' | 'collection';
  schedule_state?: 'potential' | 'scheduled';
  time_window?: { start?: string; end?: string };
  poi: PointOfInterest;
}

export interface ScheduleCellItem {
  activityId: string;
  label: string;
  sublabel?: string;
  category?: string;
  duration?: string;
  notes?: string;
  imageUrl?: string;
}

export interface ScheduleCellData {
  id: string;
  type: 'activity' | 'transport' | 'group';
  time?: string;
  endTime?: string;
  label: string;
  sublabel?: string;
  category?: string;
  activityId?: string;
  transportId?: string;
  groupItems?: ScheduleCellItem[];
  duration?: string;
  notes?: string;
  imageUrl?: string;
}

export interface AccommodationOption {
  is_selected: boolean;
  poi_id: string;
  notes?: string;
  poi: PointOfInterest;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ItineraryDayContentProps {
  selectedDayNum: number;
  tripDays: Date[];

  // Drag state (from parent DndContext in Index.tsx)
  isDragging: boolean;
  isOverPotential: boolean;
  isOverNewSchedule: boolean;
  isScheduledBeingDragged: boolean;

  // Section 1
  prevDayAccommodations: AccommodationOption[];

  // Section 2: Potential Activities
  potentialActivities: PotentialActivity[];
  availableActivities: { id: string; label: string; sublabel: string; city?: string; status?: string }[];
  locationContext?: string;
  countries: string[];
  onMoveActivityToDay: (id: string, targetDayNum: number) => Promise<void>;
  onRemoveActivity: (id: string) => Promise<void>;
  onAddActivity: (id: string, nights?: number, createBooking?: boolean) => Promise<void>;
  onCreateNewActivity: (data: Record<string, string>, createBooking?: boolean) => Promise<void>;

  // Section 3: Detailed Schedule
  scheduleCells: ScheduleCellData[];
  availableTransport: { id: string; label: string; sublabel: string }[];
  locationSuggestions: LocationSuggestion[];
  onRemoveTransport: (id: string) => Promise<void>;
  onAddTransport: (id: string) => Promise<void>;
  onCreateNewTransport: (data: Record<string, string>) => Promise<void>;

  // Section 4: Evening Accommodation
  dayAccommodations: AccommodationOption[];
  availableAccom: { id: string; label: string; sublabel: string; city?: string; status?: string }[];
  onToggleAccommodationSelected: (poiId: string, selected: boolean) => void;
  onRemoveAccommodation: (id: string) => Promise<void>;
  onAddAccommodation: (id: string, nights?: number, createBooking?: boolean) => Promise<void>;
  onCreateNewAccommodation: (data: Record<string, string>, createBooking?: boolean) => Promise<void>;
  maxNights: number;
}

// ─── Section header wrapper ────────────────────────────────────────────────────

function SectionBlock({
  icon, title, colorClass, action, children,
}: {
  icon: React.ReactNode;
  title: string;
  colorClass: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${colorClass}`}>
          {icon}
          <span>{title}</span>
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Transport icon ────────────────────────────────────────────────────────────

function TransportIcon({ category }: { category?: string }) {
  switch (category) {
    case 'flight': return <Plane size={13} />;
    case 'train': return <Train size={13} />;
    case 'ferry': return <Ship size={13} />;
    case 'bus': return <Bus size={13} />;
    case 'car_rental': return <Car size={13} />;
    default: return <Navigation size={13} />;
  }
}

// ─── Drag preview (exported — used by Index.tsx DragOverlay) ──────────────────

export function DragPreview({ label, category }: { label: string; category?: string }) {
  return (
    <div className="flex items-center gap-2 bg-card border border-primary/50 rounded-xl px-2.5 py-2 shadow-lg cursor-grabbing rotate-1 max-w-[220px]">
      <GripVertical size={13} className="text-muted-foreground/40 shrink-0" />
      {category && <SubCategoryIcon type={category} size={13} className="text-muted-foreground shrink-0" />}
      <p className="text-sm font-medium truncate">{label}</p>
    </div>
  );
}

// ─── Potential drop zone ──────────────────────────────────────────────────────

function PotentialDropZone({ isOver }: { isOver: boolean }) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: 'potential-drop-zone' });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 border-dashed transition-all duration-200 flex items-center justify-center py-2 text-xs font-medium ${
        isOver
          ? 'border-amber-500/80 bg-amber-500/10 text-amber-600'
          : 'border-amber-500/30 text-amber-600/60'
      }`}
    >
      {isOver ? t('timeline.releaseToReturn') : t('timeline.dragToReturn')}
    </div>
  );
}

// ─── Sortable potential activity ──────────────────────────────────────────────

function SortableActivityItem({
  activity, onRemove,
}: {
  activity: PotentialActivity;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: activity.id,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined, transition }}
      className={`group flex items-center gap-1.5 bg-muted/40 rounded-xl px-2 py-2 border transition-colors ${
        isDragging ? 'opacity-40 border-primary/40' : 'border-border/30 hover:border-border/60'
      }`}
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 touch-none select-none"
        aria-label={t('timeline.drag')}
      >
        <GripVertical size={14} />
      </button>

      {activity.poi.imageUrl && !imgError ? (
        <img src={activity.poi.imageUrl} alt="" width={32} height={32} className="w-8 h-8 rounded object-cover shrink-0" onError={() => setImgError(true)} />
      ) : activity.poi.placeType || poi.activityType ? (
        <SubCategoryIcon type={activity.poi.placeType || poi.activityType} size={13} className="text-muted-foreground shrink-0" />
      ) : null}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{activity.poi.name}</p>
        {(activity.poi.placeType || poi.activityType || activity.poi.location?.city) && (
          <p className="text-[10px] text-muted-foreground truncate">
            {[activity.poi.placeType || poi.activityType, activity.poi.location?.city].filter(Boolean).join(' · ')}
          </p>
        )}
        {activity.poi.details?.activity_details?.duration && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
            <Clock size={9} className="shrink-0" />
            {activity.poi.details.activity_details.duration}
          </p>
        )}
        {activity.poi.details?.notes?.user_summary && (
          <p className="text-[10px] text-muted-foreground/70 truncate italic">
            {activity.poi.details.notes.user_summary}
          </p>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(activity.id)}
        aria-label={t('timeline.remove')}
        className="shrink-0 p-0.5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Transport add dialog ─────────────────────────────────────────────────────

const TRANSPORT_CAT_KEYS = [
  { value: 'flight', key: 'transportCategory.airplane' },
  { value: 'train', key: 'transportCategory.train' },
  { value: 'bus', key: 'transportCategory.bus' },
  { value: 'ferry', key: 'transportCategory.ferry' },
  { value: 'taxi', key: 'transportCategory.taxi' },
  { value: 'car_rental', key: 'transportCategory.carRental' },
  { value: 'other', key: 'transportCategory.otherTransportation' },
];

function TransportLocationInput({ value, onChange, placeholder, suggestions }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suggestions?: LocationSuggestion[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions?.filter(s =>
    !value || s.label.toLowerCase().includes(value.toLowerCase())
  ) || [];

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        aria-label={placeholder}
        name={`transport-location-${placeholder}`}
        required
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-right px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2"
              onMouseDown={() => { onChange(s.label); setOpen(false); }}
            >
              <span className="text-xs text-muted-foreground shrink-0">
                {s.type === 'airport' ? '✈️' : s.type === 'accommodation' ? '🏨' : '📍'}
              </span>
              <span className="text-sm truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddTransportDialog({
  availableTransport, locationSuggestions, onAdd, onCreateNew,
}: {
  availableTransport: { id: string; label: string; sublabel: string }[];
  locationSuggestions: LocationSuggestion[];
  onAdd: (id: string) => Promise<void>;
  onCreateNew: (data: Record<string, string>) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('flight');
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onCreateNew({ category, fromName, toName });
      setOpen(false);
      setFromName(''); setToName('');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1 text-xs h-7">
          <Plus size={12} /> {t('timeline.addTransport')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>{t('timeline.addTransport')}</DialogTitle></DialogHeader>
        <Tabs defaultValue={availableTransport.length > 0 ? 'existing' : 'new'}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">{t('timeline.chooseExisting')}</TabsTrigger>
            <TabsTrigger value="new" className="flex-1">{t('timeline.createNew')}</TabsTrigger>
          </TabsList>
          <TabsContent value="existing">
            {availableTransport.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">{t('timeline.noItemsAvailable')}</p>
            ) : (
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {availableTransport.map(t => (
                  <button
                    key={t.id}
                    onClick={async () => { await onAdd(t.id); setOpen(false); }}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <p className="text-sm font-medium">{t.label}</p>
                    {t.sublabel && <p className="text-xs text-muted-foreground">{t.sublabel}</p>}
                  </button>
                ))}
              </div>
            )}
          </TabsContent>
          <TabsContent value="new">
            <form onSubmit={handleCreate} className="space-y-3 pt-2">
              <div className="space-y-1">
                <Label className="text-xs">{t('timeline.type')}</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSPORT_CAT_KEYS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{t(c.key)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('timeline.origin')}</Label>
                <TransportLocationInput value={fromName} onChange={setFromName} placeholder="" suggestions={locationSuggestions} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t('timeline.destination')}</Label>
                <TransportLocationInput value={toName} onChange={setToName} placeholder="" suggestions={locationSuggestions} />
              </div>
              <Button type="submit" className="w-full" size="sm" disabled={submitting || !fromName || !toName}>
                {submitting ? t('createTrip.creating') : t('timeline.createAndAdd')}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Locked (timed) new-schedule item ────────────────────────────────────────

function LockedNewSchedItem({
  activityId, label, sublabel, category, time, endTime, duration, notes, imageUrl, onRemove,
}: {
  activityId: string;
  label: string;
  sublabel?: string;
  category?: string;
  time: string;
  endTime?: string;
  duration?: string;
  notes?: string;
  imageUrl?: string;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  return (
    <div className="rounded-xl border-2 overflow-hidden border-amber-400/60 bg-amber-50/5">
      <div className="px-2.5 py-0.5 border-b border-amber-400/30 flex items-center gap-1.5">
        <Clock size={9} className="text-amber-500/70" />
        <span className="text-[10px] text-amber-500/70 font-mono">{time}</span>
        {endTime && <span className="text-[10px] text-amber-500/40">– {endTime}</span>}
      </div>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="shrink-0 w-[18px]" />
        {imageUrl && !imgError ? (
          <img src={imageUrl} alt="" width={32} height={32} className="w-8 h-8 rounded object-cover shrink-0" onError={() => setImgError(true)} />
        ) : category ? (
          <SubCategoryIcon type={category} size={13} className="text-muted-foreground shrink-0" />
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>}
          {duration && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} className="shrink-0" />
              {duration}
            </p>
          )}
          {notes && (
            <p className="text-[10px] text-muted-foreground/70 truncate italic">{notes}</p>
          )}
        </div>
        <button
          onClick={() => onRemove(activityId)}
          aria-label={t('timeline.remove')}
          className="shrink-0 p-0.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── Sortable new-schedule item ───────────────────────────────────────────────

function SortableNewSchedItem({
  activityId, label, sublabel, category, time, endTime, duration, notes, imageUrl, onRemove,
}: {
  activityId: string;
  label: string;
  sublabel?: string;
  category?: string;
  time?: string;
  endTime?: string;
  duration?: string;
  notes?: string;
  imageUrl?: string;
  onRemove: (id: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [imgError, setImgError] = useState(false);
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `newsched-${activityId}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl border-2 overflow-hidden transition-opacity ${
        isDragging ? 'opacity-40' : ''
      } ${time ? 'border-amber-400/60 bg-amber-50/5' : 'border-border/30 bg-background/50'}`}
    >
      {time && (
        <div className="px-2.5 py-0.5 border-b border-amber-400/30 flex items-center gap-1.5">
          <Clock size={9} className="text-amber-500/70" />
          <span className="text-[10px] text-amber-500/70 font-mono">{time}</span>
          {endTime && <span className="text-[10px] text-amber-500/40">– {endTime}</span>}
        </div>
      )}
      <div className="flex items-center gap-2 px-2.5 py-2">
        <button
          {...attributes}
          {...listeners}
          className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 touch-none select-none"
          aria-label={t('timeline.drag')}
        >
          <GripVertical size={13} />
        </button>
        {imageUrl && !imgError ? (
          <img src={imageUrl} alt="" width={32} height={32} className="w-8 h-8 rounded object-cover shrink-0" onError={() => setImgError(true)} />
        ) : category ? (
          <SubCategoryIcon type={category} size={13} className="text-muted-foreground shrink-0" />
        ) : null}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>}
          {duration && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <Clock size={9} className="shrink-0" />
              {duration}
            </p>
          )}
          {notes && (
            <p className="text-[10px] text-muted-foreground/70 truncate italic">{notes}</p>
          )}
        </div>
        <button
          onClick={() => onRemove(activityId)}
          aria-label={t('timeline.remove')}
          className="shrink-0 p-0.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
        >
          <X size={11} />
        </button>
      </div>
    </div>
  );
}

// ─── New-schedule drop gap ────────────────────────────────────────────────────

function NewSchedDropGap({ index }: { index: number }) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: `newsched-gap-${index}` });
  return (
    <div
      ref={setNodeRef}
      data-newsched-gap-index={index}
      style={{ marginTop: '-8px', marginBottom: '-8px' }}
      className={`relative z-20 transition-all duration-150 ${
        isOver
          ? 'h-12 rounded-xl border-2 border-dashed border-primary/50 bg-primary/10 flex items-center justify-center'
          : 'h-4'
      }`}
    >
      {isOver && <p className="text-[10px] text-primary/70 font-medium">{t('timeline.dropHere')}</p>}
      {!isOver && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center gap-2 px-2 pointer-events-none opacity-20">
          <div className="flex-1 h-px border-t border-dashed border-primary/40" />
          <span className="text-[9px] text-primary/60 shrink-0">+</span>
          <div className="flex-1 h-px border-t border-dashed border-primary/40" />
        </div>
      )}
    </div>
  );
}

// ─── New-style schedule zone ───────────────────────────────────────────────────

function NewScheduleDropZone({
  scheduleCells, onRemoveActivity, onRemoveTransport, isActive, isOver, showGaps,
}: {
  scheduleCells: ScheduleCellData[];
  onRemoveActivity: (id: string) => Promise<void>;
  onRemoveTransport: (id: string) => Promise<void>;
  isActive: boolean;
  isOver: boolean;
  showGaps: boolean;
}) {
  const { t } = useTranslation();
  const { setNodeRef } = useDroppable({ id: 'new-schedule-zone', disabled: !isActive });

  return (
    <div
      ref={setNodeRef}
      className={`min-h-[80px] rounded-xl border-2 p-2 transition-all ${
        isOver
          ? 'border-primary/60 border-dashed bg-primary/5'
          : isActive
            ? 'border-primary/20 border-dashed'
            : 'border-border/30 bg-muted/10'
      }`}
    >
      {scheduleCells.length === 0 ? (
        <p className={`text-xs px-1 py-2 text-center ${isOver ? 'text-primary/80 font-medium' : 'text-muted-foreground'}`}>
          {isOver ? t('timeline.dropHere') : t('timeline.dragPotentialHere')}
        </p>
      ) : (
        <div className="space-y-1.5">
          {showGaps && <NewSchedDropGap index={0} />}
          {scheduleCells.map((cell, cellIdx) => {
              let cellNode: React.ReactNode = null;

              if (cell.type === 'transport') {
                cellNode = (
                  <div className="rounded-xl border-2 overflow-hidden border-border/40 bg-background/50">
                    {cell.time && (
                      <div className="px-2.5 py-0.5 border-b border-border/20 flex items-center gap-1.5">
                        <Clock size={9} className="text-muted-foreground/60" />
                        <span className="text-[10px] font-mono text-muted-foreground/80">{cell.time}</span>
                        {cell.endTime && <span className="text-[10px] text-muted-foreground/40">– {cell.endTime}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-2 px-2.5 py-2">
                      <div className="shrink-0 w-[18px]" />
                      <span className="shrink-0 text-muted-foreground">
                        <TransportIcon category={cell.category} />
                      </span>
                      <p className="flex-1 text-xs font-semibold truncate">{cell.label}</p>
                      {cell.sublabel && <p className="text-[10px] text-muted-foreground truncate max-w-[80px]">{cell.sublabel}</p>}
                      {cell.transportId && (
                        <button
                          onClick={() => onRemoveTransport(cell.transportId!)}
                          aria-label={t('timeline.remove')}
                          className="shrink-0 p-0.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded transition-colors"
                        >
                          <X size={11} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              } else if (cell.type === 'activity' && cell.activityId) {
                if (cell.time) {
                  cellNode = (
                    <LockedNewSchedItem
                      activityId={cell.activityId}
                      label={cell.label}
                      sublabel={cell.sublabel}
                      category={cell.category}
                      time={cell.time}
                      endTime={cell.endTime}
                      duration={cell.duration}
                      notes={cell.notes}
                      imageUrl={cell.imageUrl}
                      onRemove={onRemoveActivity}
                    />
                  );
                } else {
                  cellNode = (
                    <SortableNewSchedItem
                      activityId={cell.activityId}
                      label={cell.label}
                      sublabel={cell.sublabel}
                      category={cell.category}
                      duration={cell.duration}
                      notes={cell.notes}
                      imageUrl={cell.imageUrl}
                      onRemove={onRemoveActivity}
                    />
                  );
                }
              } else if (cell.type === 'group' && cell.groupItems) {
                cellNode = (
                  <div className="rounded-xl border-2 border-primary/40 bg-primary/5 overflow-hidden">
                    <div className="px-2.5 py-1 border-b border-primary/20 flex items-center gap-1.5">
                      <span className="text-[10px] text-primary/70 font-semibold">{cell.label}</span>
                      <span className="text-[10px] text-primary/40">· {cell.groupItems.length} {t('common.items')}</span>
                    </div>
                    <div className="p-1 space-y-0.5">
                      {cell.groupItems.map(gi => (
                        <SortableNewSchedItem
                          key={gi.activityId}
                          activityId={gi.activityId}
                          label={gi.label}
                          sublabel={gi.sublabel}
                          category={gi.category}
                          duration={gi.duration}
                          notes={gi.notes}
                          imageUrl={gi.imageUrl}
                          onRemove={onRemoveActivity}
                        />
                      ))}
                    </div>
                  </div>
                );
              }

              if (!cellNode) return null;
              return (
                <div key={cell.id}>
                  <div data-newsched-cell={cellIdx}>{cellNode}</div>
                  {showGaps && <NewSchedDropGap index={cellIdx + 1} />}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ItineraryDayContent({
  selectedDayNum, tripDays,
  isDragging, isOverPotential, isOverNewSchedule, isScheduledBeingDragged,
  prevDayAccommodations,
  potentialActivities, availableActivities, locationContext, countries,
  onMoveActivityToDay, onRemoveActivity, onAddActivity, onCreateNewActivity,
  scheduleCells, availableTransport, locationSuggestions,
  onRemoveTransport, onAddTransport, onCreateNewTransport,
  dayAccommodations, availableAccom, onToggleAccommodationSelected,
  onRemoveAccommodation, onAddAccommodation, onCreateNewAccommodation, maxNights,
}: ItineraryDayContentProps) {
  const { t } = useTranslation();
  const morningAccom = prevDayAccommodations.find(a => a.is_selected) ?? prevDayAccommodations[0];

  return (
    <div className="space-y-6">

      {/* ── Section 1: Where I wake up ──────────────────────────────── */}
      <SectionBlock icon={<Sun size={12} />} title={t('timeline.wakeUp')} colorClass="text-warning">
        {selectedDayNum === 1 ? (
          <div className="px-3 py-2.5 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/40">
            {t('timeline.firstDay')}
          </div>
        ) : morningAccom ? (
          <div className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5 border border-border/40">
            <Building2 size={15} className="text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{morningAccom.poi.name}</p>
              {morningAccom.poi.location?.city && (
                <p className="text-xs text-muted-foreground">{morningAccom.poi.location.city}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="px-3 py-2.5 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/40">
            {t('timeline.noAccommodationSet', { day: selectedDayNum - 1 })}
          </div>
        )}
      </SectionBlock>

      {/* ── Section 2: Potential Activities ─────────────────────────── */}
      <SectionBlock icon={<Lightbulb size={12} />} title={t('timeline.potentialActivities')} colorClass="text-info">
        {/* Drop zone shown when dragging a scheduled item back */}
        {isScheduledBeingDragged && (
          <PotentialDropZone isOver={isOverPotential} />
        )}

        <SortableContext items={potentialActivities.map(a => a.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {potentialActivities.length === 0 && !isScheduledBeingDragged && (
              <p className="text-xs text-muted-foreground px-1">{t('timeline.dragActivityToSchedule')}</p>
            )}
            {potentialActivities.map(activity => (
              <SortableActivityItem
                key={activity.id}
                activity={activity}
                onRemove={onRemoveActivity}
              />
            ))}
          </div>
        </SortableContext>

        {/* Add activity button */}
        <div className="mt-1.5">
          <DaySection
            title="" icon={null as any}
            hideHeader hideEmptyState
            entityType="activity"
            items={[]}
            onRemove={() => {}}
            availableItems={availableActivities}
            onAdd={onAddActivity}
            onCreateNew={onCreateNewActivity}
            addLabel={t('timeline.addActivity')}
            locationContext={locationContext}
            countries={countries}

            showBookingMissionOption
          />
        </div>
      </SectionBlock>

      {/* ── Section 2.5: Schedule ─────────────────────────────────────── */}
      <SectionBlock
        icon={<CalendarDays size={12} />}
        title={t('timeline.schedule')}
        colorClass="text-primary"
        action={
          <AddTransportDialog
            availableTransport={availableTransport}
            locationSuggestions={locationSuggestions}
            onAdd={onAddTransport}
            onCreateNew={onCreateNewTransport}
          />
        }
      >
        <NewScheduleDropZone
          scheduleCells={scheduleCells}
          onRemoveActivity={onRemoveActivity}
          onRemoveTransport={onRemoveTransport}
          isActive={isDragging && !isScheduledBeingDragged}
          isOver={isOverNewSchedule}
          showGaps={isDragging}
        />
      </SectionBlock>

      {/* ── Section 4: Evening Accommodation ────────────────────────── */}
      <SectionBlock icon={<Moon size={12} />} title={t('timeline.sleepAt')} colorClass="text-info">
        <DaySection
          title="" icon={null as any}
          hideHeader
          entityType="accommodation"
          items={dayAccommodations.map(d => ({
            id: d.poi_id,
            label: d.poi.name,
            sublabel: d.poi.location?.city || '',
            status: d.poi.status,
            isSelected: d.is_selected,
            placeType: d.poi.placeType || '',
          }))}
          onRemove={onRemoveAccommodation}
          availableItems={availableAccom}
          onAdd={onAddAccommodation}
          onCreateNew={onCreateNewAccommodation}
          onToggleSelected={onToggleAccommodationSelected}
          addLabel={t('timeline.addAccommodation')}
          maxNights={maxNights}
          showBookingMissionOption
          locationContext={locationContext}
          countries={countries}
        />
      </SectionBlock>

    </div>
  );
}
