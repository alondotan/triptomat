import { useState, useCallback, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useTrip } from '@/context/TripContext';
import { updateItineraryDay, createItineraryDay } from '@/services/tripService';
import { LocationContextPicker } from '@/components/LocationContextPicker';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { eachDayOfInterval, parseISO, format } from 'date-fns';
import type { ItineraryActivity } from '@/types/trip';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  useDraggable,
  pointerWithin,
  closestCenter,
  type CollisionDetection,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Building2, GripVertical, Moon, Pencil, Sun } from 'lucide-react';
import { DaySection } from '@/components/DaySection';

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  label: string;
  emoji: string;
  time?: string;   // time_window.start for timed activities
  sublabel?: string; // city / subCategory
}

// Emoji by POI category
function categoryEmoji(category: string): string {
  switch (category) {
    case 'accommodation': return '🏨';
    case 'eatery':        return '🍽️';
    case 'attraction':    return '🏛️';
    case 'service':       return '🔧';
    default:              return '📍';
  }
}

// Emoji by transport category
function transportEmoji(category: string): string {
  switch (category) {
    case 'flight':      return '✈️';
    case 'train':       return '🚂';
    case 'ferry':       return '⛴️';
    case 'bus':         return '🚌';
    case 'taxi':        return '🚕';
    case 'car_rental':  return '🚗';
    default:            return '🚀';
  }
}

// ─── Group logic ───────────────────────────────────────────────────────────────

interface Group {
  id: string;
  items: Item[];
  isLocked: boolean;
}

function buildGroups(items: Item[], lockedIds: Set<string>): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;

  for (const item of items) {
    const locked = lockedIds.has(item.id);
    if (locked) {
      if (current) { groups.push(current); current = null; }
      groups.push({ id: `locked-${item.id}`, items: [item], isLocked: true });
    } else {
      if (!current) {
        current = { id: `unlocked-${item.id}`, items: [], isLocked: false };
      }
      current.items.push(item);
    }
  }
  if (current) groups.push(current);
  return groups;
}

// Convert "HH:mm" to minutes since midnight
function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function slotLabel(minutes: number): string {
  if (minutes < 12 * 60) return 'בוקר';
  if (minutes < 17 * 60) return 'צהריים';
  if (minutes < 21 * 60) return 'ערב';
  return 'לילה';
}

// Compute display label for a group given its position in the groups array
function groupLabel(groups: Group[], index: number): string {
  const group = groups[index];

  // Locked group: show the time of its single item
  if (group.isLocked) return group.items[0]?.time ?? '🔒';

  // Unlocked group: find surrounding locked neighbours
  const anyLocked = groups.some(g => g.isLocked);
  if (!anyLocked) return 'זמן חופשי';

  let prevTime: string | null = null;
  let nextTime: string | null = null;
  for (let i = index - 1; i >= 0; i--) {
    if (groups[i].isLocked && groups[i].items[0]?.time) { prevTime = groups[i].items[0].time!; break; }
  }
  for (let i = index + 1; i < groups.length; i++) {
    if (groups[i].isLocked && groups[i].items[0]?.time) { nextTime = groups[i].items[0].time!; break; }
  }

  // Midpoint of the free slot determines the label
  let mid: number;
  if (prevTime && nextTime) {
    mid = (timeToMinutes(prevTime) + timeToMinutes(nextTime)) / 2;
  } else if (!prevTime && nextTime) {
    mid = timeToMinutes(nextTime) / 2;           // slot starts at dawn
  } else if (prevTime && !nextTime) {
    mid = (timeToMinutes(prevTime) + 24 * 60) / 2; // slot ends at midnight
  } else {
    return 'זמן חופשי';
  }
  return slotLabel(mid);
}

// ─── Draggable potential item ──────────────────────────────────────────────────

function DraggableItem({ item, isBeingDragged }: { item: Item; isBeingDragged: boolean }) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2.5 bg-card border rounded-xl px-3 py-2.5 select-none transition-opacity ${
        isBeingDragged ? 'opacity-30' : 'cursor-grab hover:border-primary/40'
      }`}
      {...attributes}
      {...listeners}
    >
      <GripVertical size={14} className="text-muted-foreground/50 shrink-0" />
      <span className="text-base">{item.emoji}</span>
      <span className="text-sm font-medium">{item.label}</span>
    </div>
  );
}

// ─── Sortable scheduled item ───────────────────────────────────────────────────

function SortableScheduledItem({
  item, isLocked, onToggleLock,
}: {
  item: Item;
  isLocked: boolean;
  onToggleLock: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sched-${item.id}`,
    disabled: isLocked,
  });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
        transition,
      }}
      className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 transition-opacity ${
        isLocked ? 'bg-background/50' : 'bg-background/70'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <button
        {...attributes}
        {...(isLocked ? {} : listeners)}
        disabled={isLocked}
        className={`shrink-0 p-0.5 touch-none select-none transition-opacity ${
          isLocked
            ? 'opacity-20 cursor-not-allowed'
            : 'cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground'
        }`}
      >
        <GripVertical size={14} />
      </button>

      <span className="text-base">{item.emoji}</span>
      <span className={`flex-1 text-sm font-medium ${isLocked ? 'text-muted-foreground' : ''}`}>
        {item.label}
      </span>
    </div>
  );
}

// ─── Group frame ───────────────────────────────────────────────────────────────

function GroupFrame({ group, label, lockedIds, onToggleLock }: {
  group: Group;
  label: string;
  lockedIds: Set<string>;
  onToggleLock: (id: string) => void;
}) {
  return (
    <div>
      <span className={`text-[10px] font-semibold tracking-widest px-1 ${
        group.isLocked ? 'text-amber-500/70' : 'text-primary/70 uppercase'
      }`}>{label}</span>

      <SortableContext
        items={group.items.map(i => `sched-${i.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-1 mt-0.5">
          {group.items.map(item => (
            <SortableScheduledItem
              key={item.id}
              item={item}
              isLocked={lockedIds.has(item.id)}
              onToggleLock={onToggleLock}
            />
          ))}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Droppable day pill (real trip days) ─────────────────────────────────────

function DroppableDayPill({
  dayNum, day, isSelected, hasContent, onClick,
}: {
  dayNum: number;
  day: Date;
  isSelected: boolean;
  hasContent: boolean;
  onClick: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-drop-${dayNum}` });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={`flex flex-col items-center min-w-[56px] sm:min-w-[72px] px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border-2 transition-all text-xs sm:text-sm ${
        isSelected
          ? 'border-primary bg-primary text-primary-foreground font-semibold'
          : isOver
            ? 'border-primary/80 bg-primary/15 scale-105 shadow-md'
            : hasContent
              ? 'border-primary/30 bg-muted/50 hover:bg-muted'
              : 'border-transparent bg-muted/30 hover:bg-muted text-muted-foreground'
      }`}
    >
      <span className="text-[10px] sm:text-xs">{format(day, 'EEE')}</span>
      <span className="text-base sm:text-lg font-bold">{format(day, 'd')}</span>
      <span className="text-[9px] sm:text-[10px]">{format(day, 'MMM')}</span>
      {hasContent && !isSelected && <div className="w-1.5 h-1.5 rounded-full bg-current mt-1 opacity-60" />}
    </button>
  );
}

// ─── Drop gap (between groups) ─────────────────────────────────────────────────

function DropGap({ index, active }: { index: number; active: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: `gap-${index}`, disabled: !active });
  return (
    <div
      ref={setNodeRef}
      data-gap-index={index}
      className={`transition-all duration-150 rounded-xl ${
        isOver
          ? 'h-12 border-2 border-dashed border-primary/70 bg-primary/10 flex items-center justify-center'
          : active
            ? 'h-4 border border-dashed border-primary/20'
            : 'h-1'
      }`}
    >
      {isOver && <p className="text-xs font-medium text-primary/80">שחרר כאן</p>}
    </div>
  );
}

// ─── Potential drop zone ───────────────────────────────────────────────────────

function PotentialZone({ children, isScheduledDragging }: {
  children: React.ReactNode;
  isScheduledDragging: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'potential-zone', disabled: !isScheduledDragging });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[280px] border-2 rounded-xl p-3 transition-all space-y-1.5 ${
        isOver
          ? 'border-amber-400/80 border-dashed bg-amber-50/10'
          : isScheduledDragging
            ? 'border-amber-400/40 border-dashed'
            : 'border-border/30'
      } bg-muted/10`}
    >
      {isScheduledDragging && (
        <p className={`text-xs text-center py-1 ${isOver ? 'text-amber-500 font-medium' : 'text-muted-foreground/60'}`}>
          {isOver ? '↩ שחרר להחזרה לפוטנציאל' : '↩ גרור לכאן להחזרה לפוטנציאל'}
        </p>
      )}
      {children}
    </div>
  );
}

// ─── Schedule zone ─────────────────────────────────────────────────────────────

function ScheduleZone({ children, activePotentialDrag, isEmpty }: {
  children: React.ReactNode;
  activePotentialDrag: boolean;
  isEmpty: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'schedule-zone', disabled: !activePotentialDrag || !isEmpty });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[280px] border-2 rounded-xl p-3 transition-all ${
        isOver && isEmpty
          ? 'border-primary/60 border-dashed bg-primary/5'
          : activePotentialDrag && isEmpty
            ? 'border-primary/20 border-dashed'
            : 'border-border/30'
      } bg-muted/10`}
    >
      {children}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DndTestPage() {
  const { state, dispatch, loadTripData, addPOI, updatePOI, addMission } = useTrip();
  const [selectedDayNum, setSelectedDayNum] = useState(1);

  const tripDays = useMemo(() => {
    if (!state.activeTrip) return [];
    return eachDayOfInterval({
      start: parseISO(state.activeTrip.startDate),
      end: parseISO(state.activeTrip.endDate),
    });
  }, [state.activeTrip?.startDate, state.activeTrip?.endDate]);

  const locationSpans = useMemo(() => {
    if (tripDays.length === 0) return [];
    const spans: { location: string; startIdx: number; endIdx: number }[] = [];
    for (let i = 0; i < tripDays.length; i++) {
      const itDay = state.itineraryDays.find(d => d.dayNumber === i + 1);
      const loc = itDay?.locationContext || '';
      if (loc && spans.length > 0 && spans[spans.length - 1].location === loc && spans[spans.length - 1].endIdx === i - 1) {
        spans[spans.length - 1].endIdx = i;
      } else if (loc) {
        spans.push({ location: loc, startIdx: i, endIdx: i });
      }
    }
    return spans;
  }, [tripDays, state.itineraryDays]);

  const [potential, setPotential] = useState<Item[]>([]);
  const [scheduled, setScheduled] = useState<Item[]>([]);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  // ── Location editing (mirrors Index.tsx) ────────────────────────────────────
  const [locationContext, setLocationContext] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDaysForward, setLocationDaysForward] = useState(0);

  const locationDayWidth = typeof window !== 'undefined' ? (window.innerWidth < 640 ? 64 : 80) : 72;
  const selectedIdx = selectedDayNum - 1;
  const selectedSpan = locationSpans.find(s => s.startIdx <= selectedIdx && s.endIdx >= selectedIdx);

  const refreshDays = useCallback(async () => {
    if (state.activeTrip) await loadTripData(state.activeTrip.id);
  }, [state.activeTrip, loadTripData]);

  const updateLocationContext = useCallback(async () => {
    const totalDays = 1 + locationDaysForward;
    for (let i = 0; i < totalDays; i++) {
      const dayNum = selectedDayNum + i;
      if (dayNum > tripDays.length) break;
      let targetDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
      if (!targetDay && state.activeTrip) {
        const day = tripDays[dayNum - 1];
        targetDay = await createItineraryDay({
          tripId: state.activeTrip.id,
          dayNumber: dayNum,
          date: day ? format(day, 'yyyy-MM-dd') : undefined,
          locationContext: '',
          accommodationOptions: [],
          activities: [],
          transportationSegments: [],
        });
      }
      if (targetDay) await updateItineraryDay(targetDay.id, { locationContext });
    }
    setEditingLocation(false);
    setLocationDaysForward(0);
    await refreshDays();
  }, [locationContext, locationDaysForward, selectedDayNum, tripDays, state.itineraryDays, state.activeTrip, refreshDays]);

  // ── Accommodation (mirrors Index.tsx) ───────────────────────────────────────
  const currentItDay = useMemo(
    () => state.itineraryDays.find(d => d.dayNumber === selectedDayNum) ?? null,
    [state.itineraryDays, selectedDayNum],
  );

  const dayAccommodations = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.accommodationOptions
      .map(opt => ({ ...opt, poi: state.pois.find(p => p.id === opt.poi_id) }))
      .filter((opt): opt is typeof opt & { poi: NonNullable<typeof opt.poi> } => !!opt.poi);
  }, [currentItDay, state.pois]);

  const prevDayAccommodations = useMemo(() => {
    if (selectedDayNum <= 1) return [];
    const prevItDay = state.itineraryDays.find(d => d.dayNumber === selectedDayNum - 1);
    if (!prevItDay) return [];
    return prevItDay.accommodationOptions
      .map(opt => ({ ...opt, poi: state.pois.find(p => p.id === opt.poi_id) }))
      .filter((opt): opt is typeof opt & { poi: NonNullable<typeof opt.poi> } => !!opt.poi);
  }, [state.itineraryDays, state.pois, selectedDayNum]);

  const morningAccom = prevDayAccommodations.find(a => a.is_selected) ?? prevDayAccommodations[0];

  // Actual location of the current day — for DaySection suggestions (not the edit buffer)
  const currentDayLocation = currentItDay?.locationContext ?? '';

  const availableAccom = state.pois.filter(
    p => p.category === 'accommodation' && !p.isCancelled && !dayAccommodations.some(d => d.poi_id === p.id),
  );

  const toggleAccommodationSelected = useCallback(async (poiId: string, selected: boolean) => {
    if (!currentItDay) return;
    const updated = currentItDay.accommodationOptions.map(o => ({
      ...o, is_selected: o.poi_id === poiId ? selected : false,
    }));
    await updateItineraryDay(currentItDay.id, { accommodationOptions: updated });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const addAccommodation = useCallback(async (entityId: string, nights?: number) => {
    const nightCount = nights || 1;
    for (let i = 0; i < nightCount; i++) {
      const dayNum = selectedDayNum + i;
      if (dayNum > tripDays.length) break;
      let targetDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
      if (!targetDay && state.activeTrip) {
        const day = tripDays[dayNum - 1];
        targetDay = await createItineraryDay({
          tripId: state.activeTrip.id,
          dayNumber: dayNum,
          date: day ? format(day, 'yyyy-MM-dd') : undefined,
          locationContext: '',
          accommodationOptions: [],
          activities: [],
          transportationSegments: [],
        });
      }
      if (targetDay) {
        const existing = targetDay.accommodationOptions || [];
        if (!existing.some(o => o.poi_id === entityId)) {
          await updateItineraryDay(targetDay.id, {
            accommodationOptions: [...existing, { is_selected: false, poi_id: entityId }],
          });
        }
      }
    }
    const poi = state.pois.find(p => p.id === entityId);
    if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
      await updatePOI({ ...poi, status: 'matched' });
    }
    await refreshDays();
  }, [selectedDayNum, tripDays, state.itineraryDays, state.activeTrip, state.pois, updatePOI, refreshDays]);

  const removeAccommodation = useCallback(async (entityId: string) => {
    if (!currentItDay) return;
    await updateItineraryDay(currentItDay.id, {
      accommodationOptions: currentItDay.accommodationOptions.filter(o => o.poi_id !== entityId),
    });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const createNewAccommodation = useCallback(async (data: Record<string, string>, createBookingMission?: boolean) => {
    if (!state.activeTrip) return;
    const nights = parseInt(data._nights) || 1;
    const newPOI = await addPOI({
      tripId: state.activeTrip.id,
      category: 'accommodation',
      subCategory: data.subCategory || undefined,
      name: data.name,
      status: 'candidate',
      location: { city: data.city || undefined },
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      details: {},
      isCancelled: false,
      isPaid: false,
    });
    if (newPOI) {
      await addAccommodation(newPOI.id, nights);
      if (createBookingMission) {
        await addMission({
          tripId: state.activeTrip.id,
          title: `להזמין: ${data.name}`,
          description: 'accommodation',
          status: 'pending',
          contextLinks: [],
          reminders: [],
          objectLink: newPOI.id,
        });
      }
    }
  }, [state.activeTrip, addPOI, addAccommodation, addMission]);

  // ── Activity add (mirrors Index.tsx) ────────────────────────────────────────
  const dayActivityIds = useMemo(
    () => new Set(currentItDay?.activities.filter(a => a.type === 'poi').map(a => a.id) ?? []),
    [currentItDay],
  );

  const availableActivities = state.pois.filter(
    p => p.category !== 'accommodation' && !p.isCancelled && !dayActivityIds.has(p.id),
  );

  const addActivity = useCallback(async (entityId: string) => {
    if (!currentItDay) return;
    const existing = currentItDay.activities;
    if (existing.some(a => a.id === entityId)) return;
    await updateItineraryDay(currentItDay.id, {
      activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: entityId }],
    });
    const poi = state.pois.find(p => p.id === entityId);
    if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
      await updatePOI({ ...poi, status: 'matched' });
    }
    await refreshDays();
  }, [currentItDay, state.pois, updatePOI, refreshDays]);

  const removeActivity = useCallback(async (entityId: string) => {
    if (!currentItDay) return;
    await updateItineraryDay(currentItDay.id, {
      activities: currentItDay.activities.filter(a => a.id !== entityId),
    });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const createNewActivity = useCallback(async (data: Record<string, string>, createBookingMission?: boolean) => {
    if (!state.activeTrip) return;
    const newPOI = await addPOI({
      tripId: state.activeTrip.id,
      category: (data.category as any) || 'attraction',
      subCategory: data.subCategory || undefined,
      name: data.name,
      status: 'candidate',
      location: { city: data.city || undefined },
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      details: {},
      isCancelled: false,
      isPaid: false,
    });
    if (newPOI) {
      await addActivity(newPOI.id);
      if (createBookingMission) {
        await addMission({
          tripId: state.activeTrip.id,
          title: `להזמין: ${data.name}`,
          description: data.category,
          status: 'pending',
          contextLinks: [],
          reminders: [],
          objectLink: newPOI.id,
        });
      }
    }
  }, [state.activeTrip, addPOI, addActivity, addMission]);

  // ── Load real data for selected day ─────────────────────────────────────────
  // potential  = activities with schedule_state !== 'scheduled'
  // scheduled  = activities with schedule_state === 'scheduled'  (in DB array order)
  // lockedIds  = scheduled activities that have a time_window.start (timed anchor)
  useEffect(() => {
    const itDay = state.itineraryDays.find(d => d.dayNumber === selectedDayNum);
    console.log('[DndTest] selectedDayNum=', selectedDayNum, 'itDay=', itDay, 'allDays=', state.itineraryDays.map(d => d.dayNumber), 'pois#=', state.pois.length);
    if (!itDay) { setPotential([]); setScheduled([]); setLockedIds(new Set()); return; }
    console.log('[DndTest] activities=', itDay.activities);

    const newPotential: Item[] = [];
    const newScheduled: Item[] = [];
    const newLocked = new Set<string>();

    // ── POI activities ────────────────────────────────────────────────────────
    itDay.activities
      .filter(a => a.type === 'poi')
      .forEach(a => {
        const poi = state.pois.find(p => p.id === a.id);
        console.log('[DndTest] activity', a.id, 'schedule_state=', a.schedule_state, 'time_window=', a.time_window, '=> poi=', poi?.name ?? 'NOT FOUND');
        if (!poi) return;
        // time: prefer itinerary time_window, fallback to POI booking hour
        const bookingHour = poi.details?.booking?.reservation_hour;
        const time = a.time_window?.start ?? bookingHour ?? undefined;
        const item: Item = {
          id: a.id,
          label: poi.name,
          emoji: categoryEmoji(poi.category),
          time,
          sublabel: [poi.subCategory, poi.location?.city].filter(Boolean).join(' · '),
        };
        const isScheduled = a.schedule_state === 'scheduled' || !!time;
        if (isScheduled) {
          newScheduled.push(item);
          if (time) newLocked.add(a.id);
        } else {
          newPotential.push(item);
        }
      });

    // ── Transport segments ────────────────────────────────────────────────────
    // Each selected transport segment appears as a locked item on the day its
    // departure_time falls on. segment_id in the day record narrows to one
    // specific leg; if absent we include all segments of that transportation.
    itDay.transportationSegments.forEach(ts => {
      if (!ts.is_selected) return;
      const transport = state.transportation.find(t => t.id === ts.transportation_id);
      if (!transport) return;
      const segments = ts.segment_id
        ? transport.segments.filter(s => s.segment_id === ts.segment_id)
        : transport.segments;

      segments.forEach(seg => {
        const itemId = `trans_${transport.id}_${seg.segment_id ?? '0'}`;
        const timeLabel = seg.departure_time
          ? format(parseISO(seg.departure_time), 'HH:mm')
          : undefined;
        const item: Item = {
          id: itemId,
          label: `${seg.from.name} → ${seg.to.name}`,
          emoji: transportEmoji(transport.category),
          time: timeLabel,
          sublabel: [transport.booking?.carrier_name, seg.flight_or_vessel_number]
            .filter(Boolean).join(' '),
        };
        newScheduled.push(item);
        newLocked.add(itemId); // transport segments are always locked
      });
    });

    // Build final scheduled list by interleaving transport into POI order gaps.
    // POIs are sorted by their saved `order` field (reflects user DnD arrangement).
    // Transport segments are sorted by time and inserted into the gaps between POIs
    // based on the gap between consecutive POI order values.
    const poiArr = newScheduled.filter(i => !i.id.startsWith('trans_'));
    const transArr = newScheduled.filter(i => i.id.startsWith('trans_'));

    // Sort POIs by saved order (unordered items go to end)
    poiArr.sort((a, b) => {
      const oA = itDay.activities.find(act => act.id === a.id)?.order ?? 9999;
      const oB = itDay.activities.find(act => act.id === b.id)?.order ?? 9999;
      return oA - oB;
    });

    // Sort transport by departure time
    transArr.sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });

    // Interleave: insert transport items into gaps between POI order values.
    // A gap of N between consecutive order values means N-1 slots for transport.
    const merged: Item[] = [];
    const transQ = [...transArr];
    let prevOrder = 0;
    for (const poi of poiArr) {
      const poiOrder = itDay.activities.find(act => act.id === poi.id)?.order ?? 9999;
      const gapSlots = Math.max(0, poiOrder - prevOrder - 1);
      for (let i = 0; i < gapSlots && transQ.length > 0; i++) merged.push(transQ.shift()!);
      merged.push(poi);
      prevOrder = poiOrder;
    }
    // Remaining transport items go at the end
    merged.push(...transQ);

    setPotential(newPotential);
    setScheduled(merged);
    setLockedIds(newLocked);
  // resetKey forces reload when user presses Reset
  }, [selectedDayNum, state.itineraryDays, state.pois, state.transportation, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isScheduledDrag = activeId?.startsWith('sched-') ?? false;
  const isPotentialDrag = activeId !== null && !isScheduledDrag;
  const isAnyDragging = activeId !== null;

  const activeItem =
    isPotentialDrag
      ? potential.find(i => i.id === activeId)
      : isScheduledDrag
        ? scheduled.find(i => `sched-${i.id}` === activeId)
        : null;

  const addLog = (msg: string) => setLog(prev => [msg, ...prev].slice(0, 10));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  // Persist scheduled/potential arrays back to itineraryDay.activities + context
  const persistDayActivities = useCallback(async (newScheduled: Item[], newPotential: Item[]) => {
    const itDay = state.itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) return;

    const updatedActivities: ItineraryActivity[] = [];

    // Scheduled POIs in order, using full index across all items (including transport).
    // This preserves the interleaved position so transport gaps survive a reload.
    newScheduled.forEach((item, idx) => {
      if (item.id.startsWith('trans_')) return; // transport lives in transportationSegments, skip
      const existing = itDay.activities.find(a => a.id === item.id);
      updatedActivities.push({
        order: idx + 1, // full positional index including transport item slots
        type: 'poi',
        id: item.id,
        schedule_state: 'scheduled',
        ...(existing?.time_window ? { time_window: existing.time_window } : {}),
      });
    });

    // Potential POIs after scheduled
    const schedLen = updatedActivities.length;
    newPotential.forEach((item, idx) => {
      const existing = itDay.activities.find(a => a.id === item.id);
      updatedActivities.push({
        order: schedLen + idx + 1,
        type: 'poi',
        id: item.id,
        schedule_state: 'potential',
        ...(existing?.time_window ? { time_window: existing.time_window } : {}),
      });
    });

    // Preserve any collection-type activities we didn't touch
    const handledIds = new Set(updatedActivities.map(a => a.id));
    itDay.activities
      .filter(a => a.type !== 'poi' || !handledIds.has(a.id))
      .forEach(a => updatedActivities.push(a));

    // Update context in-memory so useEffect reloads correctly on day switch
    dispatch({
      type: 'SET_ITINERARY_DAYS',
      payload: state.itineraryDays.map(d =>
        d.id === itDay.id ? { ...d, activities: updatedActivities } : d,
      ),
    });

    // Persist to DB
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
  }, [selectedDayNum, state.itineraryDays, dispatch]);

  // Collision: day buckets > gaps (both drag types) > schedule-zone (potential only) > closestCenter
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const id = args.active.id.toString();
    const isSchedDrag = id.startsWith('sched-');
    const hits = pointerWithin(args);

    const dayHit = hits.find(c => c.id.toString().startsWith('day-drop-'));
    if (dayHit) return [dayHit];

    // Gaps are active for all drag types
    const gapHit = hits.find(c => c.id.toString().startsWith('gap-'));
    if (gapHit) return [gapHit];

    if (!isSchedDrag) {
      const zoneHit = hits.find(c => c.id === 'schedule-zone');
      if (zoneHit) return [zoneHit];
      if (hits.length > 0) return [hits[0]];
      return closestCenter(args);
    } else {
      const potentialHit = hits.find(c => c.id === 'potential-zone');
      if (potentialHit) return [potentialHit];
      return closestCenter(args);
    }
  }, []);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveId(e.active.id as string);
    addLog(`🟡 start: "${e.active.id}"`);
  }, []);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);

    if (!over) { addLog(`🔴 end: no target`); return; }

    const activeIdStr = active.id.toString();
    const overId = over.id.toString();
    addLog(`🟢 end: "${activeIdStr}" → "${overId}"`);

    // ── Day drop ──────────────────────────────────────────────────────────────
    if (overId.startsWith('day-drop-')) {
      const targetDayNum = parseInt(overId.replace('day-drop-', ''), 10);
      if (targetDayNum === selectedDayNum) return;

      const isSchedItem = activeIdStr.startsWith('sched-');
      const itemId = isSchedItem ? activeIdStr.replace('sched-', '') : activeIdStr;

      // Transport segments cannot be moved across days
      if (itemId.startsWith('trans_')) {
        addLog(`  ❌ סגמנט תחבורה לא ניתן להזזה`);
        return;
      }

      const item = isSchedItem ? scheduled.find(i => i.id === itemId) : potential.find(i => i.id === itemId);
      if (!item) return;

      const sourceDay = state.itineraryDays.find(d => d.dayNumber === selectedDayNum);
      const targetDay = state.itineraryDays.find(d => d.dayNumber === targetDayNum);
      if (!sourceDay || !targetDay) { addLog(`  ❌ יום לא נמצא`); return; }

      const newSourceActivities = sourceDay.activities.filter(a => a.id !== itemId);
      const nextOrder = targetDay.activities.length > 0
        ? Math.max(...targetDay.activities.map(a => a.order)) + 1
        : 1;
      const newActivity: ItineraryActivity = { order: nextOrder, type: 'poi', id: itemId, schedule_state: 'potential' };
      const newTargetActivities = [...targetDay.activities, newActivity];

      // Optimistic UI
      if (isSchedItem) setScheduled(prev => prev.filter(i => i.id !== itemId));
      else setPotential(prev => prev.filter(i => i.id !== itemId));

      // Update context in-memory
      dispatch({
        type: 'SET_ITINERARY_DAYS',
        payload: state.itineraryDays.map(d => {
          if (d.id === sourceDay.id) return { ...d, activities: newSourceActivities };
          if (d.id === targetDay.id) return { ...d, activities: newTargetActivities };
          return d;
        }),
      });

      // Persist to DB
      Promise.all([
        updateItineraryDay(sourceDay.id, { activities: newSourceActivities }),
        updateItineraryDay(targetDay.id, { activities: newTargetActivities }),
      ]).then(() => {
        addLog(`  📅 "${item.label}" → יום ${targetDayNum} ✓`);
      }).catch(err => {
        console.error('Failed to move activity:', err);
        addLog(`  ❌ שגיאה בשמירה`);
      });
      return;
    }

    // ── Scheduled item drag ───────────────────────────────────────────────────
    if (activeIdStr.startsWith('sched-')) {
      const itemId = activeIdStr.replace('sched-', '');

      // → Return to potential
      if (overId === 'potential-zone') {
        const item = scheduled.find(i => i.id === itemId);
        if (item) {
          const newScheduled = scheduled.filter(i => i.id !== itemId);
          const newPotential = [...potential, item];
          setScheduled(newScheduled);
          setPotential(newPotential);
          persistDayActivities(newScheduled, newPotential);
          addLog(`  ↩ returned "${item.label}" to potential`);
        }
        return;
      }

      // → Drop on gap (reposition between groups)
      if (overId.startsWith('gap-')) {
        const gapIndex = parseInt(overId.replace('gap-', ''), 10);
        const currentGroups = buildGroups(scheduled, lockedIds);
        let insertPos = 0;
        for (let i = 0; i < gapIndex; i++) insertPos += currentGroups[i].items.length;

        const oldIdx = scheduled.findIndex(i => i.id === itemId);
        if (oldIdx === -1) return;
        const item = scheduled[oldIdx];
        const next = scheduled.filter(i => i.id !== itemId);
        const adjustedPos = oldIdx < insertPos ? insertPos - 1 : insertPos;
        next.splice(adjustedPos, 0, item);
        setScheduled(next);
        persistDayActivities(next, potential);
        addLog(`  ↕ repositioned "${item.label}" (gap ${gapIndex})`);
        return;
      }

      // → Reorder within schedule via closestCenter (sched-* target)
      if (overId.startsWith('sched-')) {
        const overItemId = overId.replace('sched-', '');
        const oldIdx = scheduled.findIndex(i => i.id === itemId);
        const newIdx = scheduled.findIndex(i => i.id === overItemId);
        if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
          const newScheduled = arrayMove(scheduled, oldIdx, newIdx);
          setScheduled(newScheduled);
          persistDayActivities(newScheduled, potential);
          addLog(`  ↕ reordered: ${oldIdx} → ${newIdx}`);
        }
        return;
      }

      return;
    }

    // ── Potential item drag ───────────────────────────────────────────────────
    const itemId = activeIdStr;
    const item = potential.find(i => i.id === itemId);
    if (!item) { addLog(`  ⚠️ item not found`); return; }

    let arrayInsertPos: number;

    if (overId.startsWith('gap-')) {
      const gapGroupIndex = parseInt(overId.replace('gap-', ''), 10);
      const currentGroups = buildGroups(scheduled, lockedIds);
      arrayInsertPos = 0;
      for (let i = 0; i < gapGroupIndex; i++) arrayInsertPos += currentGroups[i].items.length;
    } else if (overId === 'schedule-zone') {
      arrayInsertPos = 0;
    } else {
      addLog(`  ⚠️ unrecognised target: ${overId}`);
      return;
    }

    const newPotential = potential.filter(i => i.id !== itemId);
    const newScheduled = [...scheduled];
    newScheduled.splice(arrayInsertPos, 0, item);
    setPotential(newPotential);
    setScheduled(newScheduled);
    persistDayActivities(newScheduled, newPotential);
    addLog(`  ↓ inserting "${item.label}" at position ${arrayInsertPos}`);
  }, [potential, scheduled, lockedIds, persistDayActivities]);

  const toggleLock = useCallback((id: string) => {
    setLockedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const reset = () => { setResetKey(k => k + 1); setLog([]); };

  const groups = buildGroups(scheduled, lockedIds);

  return (
    <AppLayout>
      <div className="flex flex-col gap-3 w-full px-4" dir="rtl">

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* ── Day pills + Location strip ───────────────────── */}
          {tripDays.length > 0 ? (
            <ScrollArea className="w-full">
              <div className="flex gap-2 pb-1">
                {tripDays.map((day, idx) => {
                  const dayNum = idx + 1;
                  const itDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
                  const hasContent = !!itDay && (
                    (itDay.activities?.length ?? 0) > 0 ||
                    (itDay.accommodationOptions?.length ?? 0) > 0
                  );
                  return (
                    <DroppableDayPill
                      key={dayNum}
                      dayNum={dayNum}
                      day={day}
                      isSelected={selectedDayNum === dayNum}
                      hasContent={hasContent}
                      onClick={() => setSelectedDayNum(dayNum)}
                    />
                  );
                })}
              </div>

              {/* Gantt-like location strip */}
              <div className="relative h-6 mt-1 mb-1">
                {locationSpans.map((span, i) => {
                  const left = span.startIdx * locationDayWidth;
                  const width = (span.endIdx - span.startIdx + 1) * locationDayWidth - 8;
                  const isSelected = selectedSpan === span;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => { setLocationContext(span.location); setEditingLocation(true); }}
                      disabled={!isSelected}
                      className={`absolute top-0 h-full rounded-md flex items-center px-2 overflow-hidden gap-1 transition-colors ${
                        isSelected
                          ? 'bg-secondary border border-primary/40 cursor-pointer hover:border-primary'
                          : 'bg-secondary border border-border cursor-default'
                      }`}
                      style={{ left: `${left}px`, width: `${width}px` }}
                    >
                      <span className="text-[11px] font-medium text-primary truncate">{span.location}</span>
                      {isSelected && <Pencil size={9} className="shrink-0 text-primary opacity-70" />}
                    </button>
                  );
                })}
                {!selectedSpan && (
                  <button
                    type="button"
                    onClick={() => { setLocationContext(''); setEditingLocation(true); }}
                    className="absolute top-0 h-full border border-dashed border-primary/40 rounded-md flex items-center justify-center px-2 text-[11px] text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                    style={{ left: `${selectedIdx * locationDayWidth}px`, width: `${locationDayWidth - 8}px` }}
                  >
                    + מיקום
                  </button>
                )}
              </div>

              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          ) : (
            <p className="text-xs text-muted-foreground">אין נסיעה פעילה</p>
          )}

          {/* Location picker */}
          {state.activeTrip && editingLocation && (
            <div className="w-full sm:w-80">
              <LocationContextPicker
                countries={state.activeTrip.countries}
                value={locationContext}
                onChange={setLocationContext}
                daysForward={locationDaysForward}
                onDaysForwardChange={setLocationDaysForward}
                maxDaysForward={tripDays.length - selectedDayNum}
                onSave={updateLocationContext}
                onCancel={() => { setEditingLocation(false); setLocationDaysForward(0); }}
                extraHierarchy={state.tripSitesHierarchy}
              />
            </div>
          )}

          {/* ── Two-column body ──────────────────────────────── */}
          {/* In RTL: first column appears on the right (potential), second on the left (timeline) */}
          <div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-4 items-start">

            {/* ── Right column: Potential + Add activity ─────── */}
            <div className="space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
                פוטנציאל ({potential.length})
              </p>
              <PotentialZone isScheduledDragging={isScheduledDrag}>
                {potential.length === 0 && !isScheduledDrag && (
                  <p className="text-xs text-muted-foreground py-4 text-center">כל הפריטים בלו"ז</p>
                )}
                {potential.map(item => (
                  <DraggableItem
                    key={item.id}
                    item={item}
                    isBeingDragged={activeId === item.id}
                  />
                ))}
              </PotentialZone>

              {/* Add activity button */}
              <DaySection
                title=""
                icon={null as any}
                hideHeader
                hideEmptyState
                entityType="activity"
                items={[]}
                onRemove={removeActivity}
                availableItems={availableActivities.map(p => ({
                  id: p.id,
                  label: p.name,
                  sublabel: p.location?.city || '',
                  city: p.location?.city,
                  status: p.status,
                }))}
                onAdd={addActivity}
                onCreateNew={createNewActivity}
                addLabel="הוסף פעילות"
                locationContext={currentDayLocation}
                countries={state.activeTrip?.countries}
                extraHierarchy={state.tripSitesHierarchy}
                showBookingMissionOption
              />
            </div>

            {/* ── Left column: Timeline (wake up → schedule → sleep) */}
            <div className="space-y-3">

              {/* Where I wake up */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Sun size={13} className="text-warning shrink-0" />
                  <p className="text-xs font-semibold text-warning">איפה אני קם</p>
                </div>
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
              </div>

              {/* Scheduled itinerary */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  לו"ז מסודר ({scheduled.length})
                </p>
                <ScheduleZone activePotentialDrag={isPotentialDrag} isEmpty={scheduled.length === 0}>
                  {scheduled.length === 0 && !isPotentialDrag && (
                    <p className="text-xs text-muted-foreground py-4 text-center">גרור פריט לכאן</p>
                  )}

                  <div className="relative space-y-0.5">
                    {/* Vertical timeline line */}
                    <div className="absolute right-2.5 top-0 bottom-0 w-px bg-border/60 pointer-events-none" />

                    {/* Gap before first group */}
                    <DropGap index={0} active={isAnyDragging} />

                    {groups.map((group, gi) => (
                      <div key={group.id} className="relative space-y-0.5">
                        {/* Orange dot centered on the line, at header height */}
                        <div className="absolute right-1.5 top-[8px] w-2 h-2 rounded-full bg-orange-400 pointer-events-none z-10" />
                        <div className="pr-6">
                          <GroupFrame
                            group={group}
                            label={groupLabel(groups, gi)}
                            lockedIds={lockedIds}
                            onToggleLock={toggleLock}
                          />
                        </div>
                        {/* Gap after each group */}
                        <DropGap index={gi + 1} active={isAnyDragging} />
                      </div>
                    ))}
                  </div>
                </ScheduleZone>
              </div>

              {/* Where I sleep */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Moon size={13} className="text-info shrink-0" />
                  <p className="text-xs font-semibold text-info">איפה אני ישן</p>
                </div>
                <DaySection
                  title="איפה אני ישן"
                  icon={<Moon size={12} />}
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
                  onRemove={removeAccommodation}
                  availableItems={availableAccom.map(p => ({
                    id: p.id,
                    label: p.name,
                    sublabel: p.location?.city || '',
                    city: p.location?.city,
                    status: p.status,
                  }))}
                  onAdd={addAccommodation}
                  onCreateNew={createNewAccommodation}
                  onToggleSelected={toggleAccommodationSelected}
                  addLabel="הוסף לינה"
                  maxNights={tripDays.length - selectedDayNum + 1}
                  showBookingMissionOption
                  locationContext={currentDayLocation}
                  countries={state.activeTrip?.countries}
                  extraHierarchy={state.tripSitesHierarchy}
                />
              </div>

            </div>
            {/* end left column */}

          </div>
          {/* end two-column grid */}

          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <div className="flex items-center gap-2.5 bg-card border border-primary/50 rounded-xl px-3 py-2.5 shadow-lg rotate-1 cursor-grabbing">
                <GripVertical size={14} className="text-muted-foreground/50 shrink-0" />
                <span className="text-base">{activeItem.emoji}</span>
                <span className="text-sm font-medium">{activeItem.label}</span>
              </div>
            )}
          </DragOverlay>
        </DndContext>

      </div>
    </AppLayout>
  );
}
