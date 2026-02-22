import { useState } from 'react';
import { format } from 'date-fns';
import {
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Building2, Sun, Moon, Clock, Lightbulb,
  Plane, Train, Ship, Car, Bus, X, Plus, Navigation, GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { DaySection, type LocationSuggestion } from '@/components/DaySection';
import type { PointOfInterest } from '@/types/trip';
import type { SiteNode } from '@/hooks/useCountrySites';

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
  isOverSchedule: boolean;
  isOverPotential: boolean;
  isScheduledBeingDragged: boolean;

  // Section 1
  prevDayAccommodations: AccommodationOption[];

  // Section 2: Potential Activities
  potentialActivities: PotentialActivity[];
  availableActivities: { id: string; label: string; sublabel: string; city?: string; status?: string }[];
  locationContext?: string;
  countries: string[];
  tripSitesHierarchy: SiteNode[];
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
      {isOver ? 'שחרר להחזרה לפוטנציאל' : '↑ גרור לכאן להחזרה לפוטנציאל'}
    </div>
  );
}

// ─── Schedule drop zone ───────────────────────────────────────────────────────

function ScheduleDropZone({ isActive, isOver, disabled, children }: {
  isActive: boolean;
  isOver: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: 'schedule-drop-zone', disabled });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-xl transition-all duration-200 ${
        isOver
          ? 'ring-2 ring-primary/60 ring-dashed bg-primary/8 p-2'
          : isActive
            ? 'ring-1 ring-primary/20 ring-dashed p-1'
            : ''
      }`}
    >
      {isOver && (
        <p className="text-xs text-primary/80 text-center py-2 font-medium">
          שחרר כאן להוספה ללו"ז
        </p>
      )}
      {children}
    </div>
  );
}

// ─── Schedule drop gap ────────────────────────────────────────────────────────

function ScheduleDropGap({ index }: { index: number }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap-${index}` });
  return (
    <div
      ref={setNodeRef}
      className={`relative z-20 transition-all duration-150 ${
        isOver
          ? 'h-12 rounded-xl border-2 border-dashed border-primary/50 bg-primary/10 flex items-center justify-center'
          : 'h-7'
      }`}
    >
      {isOver && <p className="text-[10px] text-primary/70 font-medium">שחרר כאן</p>}
      {!isOver && (
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center gap-2 px-2 opacity-30">
          <div className="flex-1 h-px border-t border-dashed border-primary/40" />
          <span className="text-[9px] text-primary/60 shrink-0">+</span>
          <div className="flex-1 h-px border-t border-dashed border-primary/40" />
        </div>
      )}
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
        aria-label="גרור"
      >
        <GripVertical size={14} />
      </button>

      {activity.poi.subCategory && (
        <SubCategoryIcon type={activity.poi.subCategory} size={13} className="text-muted-foreground shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{activity.poi.name}</p>
        {(activity.poi.subCategory || activity.poi.location?.city) && (
          <p className="text-[10px] text-muted-foreground truncate">
            {[activity.poi.subCategory, activity.poi.location?.city].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {/* Remove */}
      <button
        onClick={() => onRemove(activity.id)}
        className="shrink-0 p-0.5 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ─── Sortable scheduled activity card (no dot — dot added by parent) ──────────

function SortableScheduledItem({
  activityId, label, sublabel, category, time, endTime, onRemove,
}: {
  activityId: string;
  label: string;
  sublabel?: string;
  category?: string;
  time?: string;
  endTime?: string;
  onRemove: (id: string) => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sched-${activityId}`,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined, transition }}
      className={`flex items-start gap-2 bg-muted/30 rounded-xl px-2.5 py-2 border border-border/20 transition-opacity ${
        isDragging ? 'opacity-40' : ''
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 cursor-grab active:cursor-grabbing p-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 touch-none select-none mt-0.5"
        aria-label="גרור"
      >
        <GripVertical size={13} />
      </button>

      <div className="shrink-0 w-10 text-right pt-0.5">
        {time
          ? <span className="text-[10px] font-mono text-primary">{time}</span>
          : <span className="text-[10px] text-muted-foreground/40">—</span>
        }
      </div>

      <div className="flex-1 min-w-0 flex items-start gap-1.5">
        {category && (
          <span className="shrink-0 mt-0.5 text-muted-foreground">
            <SubCategoryIcon type={category} size={13} className="text-muted-foreground" />
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold truncate">{label}</p>
          {sublabel && <p className="text-[10px] text-muted-foreground truncate">{sublabel}</p>}
          {endTime && <p className="text-[10px] text-muted-foreground">עד {endTime}</p>}
        </div>
      </div>

      <button
        onClick={() => onRemove(activityId)}
        title="הסר"
        className="shrink-0 mt-0.5 p-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
      >
        <X size={11} />
      </button>
    </div>
  );
}

// ─── Group cell (multiple untimed activities with a smart label) ──────────────

function GroupCell({
  label, items, onRemove,
}: {
  label: string;
  items: ScheduleCellItem[];
  onRemove: (id: string) => Promise<void>;
}) {
  return (
    <div className="relative flex items-start gap-3">
      <div className="shrink-0 mt-3 w-3.5 h-3.5 rounded-full border-2 border-background z-10 bg-muted-foreground/40" />
      <div className="flex-1 bg-muted/20 rounded-xl border border-border/20 overflow-hidden">
        <div className="flex items-center gap-2 px-2.5 py-1.5 bg-muted/30 border-b border-border/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/70">{label}</span>
          <span className="text-[10px] text-muted-foreground/40">· זמן חופשי</span>
        </div>
        <div className="space-y-1 p-1.5">
          {items.map(item => (
            <SortableScheduledItem
              key={item.activityId}
              activityId={item.activityId}
              label={item.label}
              sublabel={item.sublabel}
              category={item.category}
              onRemove={onRemove}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Transport add dialog ─────────────────────────────────────────────────────

const TRANSPORT_CATS = [
  { value: 'flight', label: 'טיסה' },
  { value: 'train', label: 'רכבת' },
  { value: 'bus', label: 'אוטובוס' },
  { value: 'ferry', label: 'מעבורת' },
  { value: 'taxi', label: 'מונית' },
  { value: 'car_rental', label: 'השכרת רכב' },
  { value: 'other', label: 'אחר' },
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
          <Plus size={12} /> הוסף תחבורה
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>הוסף תחבורה</DialogTitle></DialogHeader>
        <Tabs defaultValue={availableTransport.length > 0 ? 'existing' : 'new'}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">בחר קיים</TabsTrigger>
            <TabsTrigger value="new" className="flex-1">צור חדש</TabsTrigger>
          </TabsList>
          <TabsContent value="existing">
            {availableTransport.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">אין תחבורה זמינה</p>
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
                <Label className="text-xs">סוג</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRANSPORT_CATS.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">מוצא *</Label>
                <TransportLocationInput value={fromName} onChange={setFromName} placeholder="תל אביב" suggestions={locationSuggestions} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">יעד *</Label>
                <TransportLocationInput value={toName} onChange={setToName} placeholder="בנגקוק" suggestions={locationSuggestions} />
              </div>
              <Button type="submit" className="w-full" size="sm" disabled={submitting || !fromName || !toName}>
                {submitting ? 'יוצר...' : 'צור והוסף'}
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export function ItineraryDayContent({
  selectedDayNum, tripDays,
  isDragging, isOverSchedule, isOverPotential, isScheduledBeingDragged,
  prevDayAccommodations,
  potentialActivities, availableActivities, locationContext, countries, tripSitesHierarchy,
  onMoveActivityToDay, onRemoveActivity, onAddActivity, onCreateNewActivity,
  scheduleCells, availableTransport, locationSuggestions,
  onRemoveTransport, onAddTransport, onCreateNewTransport,
  dayAccommodations, availableAccom, onToggleAccommodationSelected,
  onRemoveAccommodation, onAddAccommodation, onCreateNewAccommodation, maxNights,
}: ItineraryDayContentProps) {

  const morningAccom = prevDayAccommodations.find(a => a.is_selected) ?? prevDayAccommodations[0];

  // Flat list of sched-{id} for SortableContext
  const scheduledItemIds = scheduleCells.flatMap(cell => {
    if (cell.type === 'activity' && cell.activityId) return [`sched-${cell.activityId}`];
    if (cell.type === 'group' && cell.groupItems) return cell.groupItems.map(gi => `sched-${gi.activityId}`);
    return [];
  });

  // Build schedule cells with drop gaps between every cell when dragging from potential
  const showGaps = isDragging && !isScheduledBeingDragged;
  const scheduleContent: React.ReactNode[] = [];

  if (showGaps) {
    scheduleContent.push(<ScheduleDropGap key="gap-0" index={0} />);
  }

  scheduleCells.forEach((cell, cellIdx) => {
    if (cell.type === 'activity' && cell.activityId) {
      scheduleContent.push(
        <div key={cell.id} className="relative flex items-start gap-3">
          <div className="shrink-0 mt-2.5 w-3.5 h-3.5 rounded-full border-2 border-background z-10 bg-muted-foreground/70" />
          <div className="flex-1">
            <SortableScheduledItem
              activityId={cell.activityId}
              label={cell.label}
              sublabel={cell.sublabel}
              category={cell.category}
              time={cell.time}
              endTime={cell.endTime}
              onRemove={onRemoveActivity}
            />
          </div>
        </div>
      );
    } else if (cell.type === 'group' && cell.groupItems) {
      scheduleContent.push(
        <GroupCell
          key={cell.id}
          label={cell.label}
          items={cell.groupItems}
          onRemove={onRemoveActivity}
        />
      );
    } else {
      // Transport cell (static)
      scheduleContent.push(
        <div key={cell.id} className="relative flex items-start gap-3">
          <div className="shrink-0 mt-2.5 w-3.5 h-3.5 rounded-full border-2 border-background z-10 bg-primary" />
          <div className="flex-1 flex items-start gap-2 bg-muted/30 rounded-xl px-2.5 py-2 border border-border/20">
            <div className="shrink-0 w-10 text-right pt-0.5">
              {cell.time
                ? <span className="text-[10px] font-mono text-primary">{cell.time}</span>
                : <span className="text-[10px] text-muted-foreground/40">—</span>
              }
            </div>
            <div className="flex-1 min-w-0 flex items-start gap-1.5">
              <span className="shrink-0 mt-0.5 text-muted-foreground">
                <TransportIcon category={cell.category} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{cell.label}</p>
                {cell.sublabel && <p className="text-[10px] text-muted-foreground truncate">{cell.sublabel}</p>}
                {cell.endTime && <p className="text-[10px] text-muted-foreground">עד {cell.endTime}</p>}
              </div>
            </div>
            {cell.transportId && (
              <button
                onClick={() => onRemoveTransport(cell.transportId!)}
                title="הסר"
                className="shrink-0 mt-0.5 p-1 rounded text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <X size={11} />
              </button>
            )}
          </div>
        </div>
      );
    }

    // Drop gap after each cell (index = cellIdx + 1 means "before cell at cellIdx+1")
    if (showGaps) {
      scheduleContent.push(<ScheduleDropGap key={`gap-${cellIdx + 1}`} index={cellIdx + 1} />);
    }
  });

  return (
    <div className="space-y-6">

      {/* ── Section 1: Where I wake up ──────────────────────────────── */}
      <SectionBlock icon={<Sun size={12} />} title="איפה אני קם" colorClass="text-warning">
        {selectedDayNum === 1 ? (
          <div className="px-3 py-2.5 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/40">
            יום ראשון — נקודת הזינוק
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
            לא הוגדרה לינה ליום {selectedDayNum - 1}
          </div>
        )}
      </SectionBlock>

      {/* ── Section 2: Potential Activities ─────────────────────────── */}
      <SectionBlock icon={<Lightbulb size={12} />} title="פעילויות פוטנציאליות" colorClass="text-info">
        {/* Drop zone shown when dragging a scheduled item back */}
        {isScheduledBeingDragged && (
          <PotentialDropZone isOver={isOverPotential} />
        )}

        <SortableContext items={potentialActivities.map(a => a.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-1.5">
            {potentialActivities.length === 0 && !isScheduledBeingDragged && (
              <p className="text-xs text-muted-foreground px-1">גרור פעילות ללו״ז — או הוסף מהרשימה</p>
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
            addLabel="הוסף פעילות"
            locationContext={locationContext}
            countries={countries}
            extraHierarchy={tripSitesHierarchy}
            showBookingMissionOption
          />
        </div>
      </SectionBlock>

      {/* ── Section 3: Detailed Schedule ────────────────────────────── */}
      <SectionBlock
        icon={<Clock size={12} />}
        title='לו"ז מפורט'
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
        <ScheduleDropZone isActive={isDragging && !isScheduledBeingDragged} isOver={isOverSchedule && scheduleContent.length === 0} disabled={isScheduledBeingDragged}>
          {scheduleCells.length === 0 ? (
            <p className="text-xs text-muted-foreground px-1">
              {isDragging && !isScheduledBeingDragged ? '' : 'גרור פעילות ללו״ז או הוסף תחבורה'}
            </p>
          ) : (
            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-[7px] top-3 bottom-3 w-px bg-border/50" />
              <SortableContext items={scheduledItemIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-2">
                  {scheduleContent}
                </div>
              </SortableContext>
            </div>
          )}
        </ScheduleDropZone>
      </SectionBlock>

      {/* ── Section 4: Evening Accommodation ────────────────────────── */}
      <SectionBlock icon={<Moon size={12} />} title="איפה אני ישן" colorClass="text-info">
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
            subCategory: d.poi.subCategory || '',
          }))}
          onRemove={onRemoveAccommodation}
          availableItems={availableAccom}
          onAdd={onAddAccommodation}
          onCreateNew={onCreateNewAccommodation}
          onToggleSelected={onToggleAccommodationSelected}
          addLabel="הוסף לינה"
          maxNights={maxNights}
          showBookingMissionOption
          locationContext={locationContext}
          countries={countries}
          extraHierarchy={tripSitesHierarchy}
        />
      </SectionBlock>

    </div>
  );
}
