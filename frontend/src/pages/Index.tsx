import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTrip } from '@/context/TripContext';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/AppLayout';
import { CreateTripForm } from '@/components/forms/CreateTripForm';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { CalendarDays, Pencil } from 'lucide-react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import * as tripService from '@/services/tripService';
import { type LocationSuggestion } from '@/components/DaySection';
import { LocationContextPicker } from '@/components/LocationContextPicker';
import { ItineraryDayContent, DragPreview } from '@/components/ItineraryDayContent';
import {
  DndContext,
  DragEndEvent,
  DragOverEvent,
  DragStartEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
  pointerWithin,
  type CollisionDetection,
} from '@dnd-kit/core';
import { arrayMove } from '@dnd-kit/sortable';

// ─── Smart label for untimed activity groups ──────────────────────────────────

function getSmartLabel(prevTime?: string, nextTime?: string): string {
  if (!prevTime && !nextTime) return 'זמן גמיש';
  if (!prevTime) {
    const h = parseInt(nextTime!.split(':')[0]);
    return h <= 11 ? 'בוקר' : 'שעות היום';
  }
  if (!nextTime) {
    const h = parseInt(prevTime.split(':')[0]);
    return h >= 19 ? 'לילה' : 'ערב';
  }
  const h1 = parseInt(prevTime.split(':')[0]);
  const h2 = parseInt(nextTime.split(':')[0]);
  if (h1 < 12 && h2 >= 13) return 'צהריים';
  if (h1 >= 13 && h1 < 17) return 'אחה"צ';
  return 'הבא בתור';
}

// ─── Droppable day pill ───────────────────────────────────────────────────────

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

// ─── Main page ────────────────────────────────────────────────────────────────

const Index = () => {
  const { state, loadTripData, addPOI, addTransportation, addMission, updatePOI } = useTrip();
  const [selectedDayNum, setSelectedDayNum] = useState(1);
  const [locationContext, setLocationContext] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDaysForward, setLocationDaysForward] = useState(0);

  // ── Drag state ───────────────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isOverSchedule, setIsOverSchedule] = useState(false);
  const [isOverPotential, setIsOverPotential] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  );

  const isScheduledBeingDragged = activeId?.startsWith('sched-') ?? false;
  const isDragging = activeId !== null;

  // Collision detection reads drag type from args.active.id (not from React state),
  // avoiding any re-render race condition with isScheduledBeingDragged.
  // Always uses pointer position (pointerWithin) so the user points at the exact target.
  const collisionDetection: CollisionDetection = useCallback((args) => {
    const isSchedDrag = args.active.id.toString().startsWith('sched-');
    const hits = pointerWithin(args);

    if (!isSchedDrag) {
      // Potential-item drags: gaps win over everything (negative-margin overlap trick)
      const gaps = hits.filter(c => c.id.toString().startsWith('gap-'));
      if (gaps.length > 0) return gaps;
      // Specific droppables (sched-* cards, day pills) beat catch-all zones
      const CATCH_ALL = new Set(['schedule-drop-zone', 'potential-drop-zone']);
      const specific = hits.filter(c => !CATCH_ALL.has(c.id.toString()));
      if (specific.length > 0) return specific;
      if (hits.length > 0) return hits;
      return closestCenter(args);
    }

    // Scheduled-item drags: use pointer for precise special zones,
    // but closestCenter (not pointer) for schedule reorder —
    // because useSortable applies CSS transforms that shift card visual positions,
    // making getBoundingClientRect() reflect the shifted rect, so closestCenter
    // correctly finds the nearest card even as they animate.
    const potentialHit = hits.filter(c => c.id.toString() === 'potential-drop-zone');
    if (potentialHit.length > 0) return potentialHit;
    const dayPillHit = hits.filter(c => c.id.toString().startsWith('day-drop-'));
    if (dayPillHit.length > 0) return dayPillHit;
    // Schedule reorder: find closest sched-* droppable by center distance
    const cc = closestCenter(args);
    const schedResults = cc.filter(c => c.id.toString().startsWith('sched-'));
    if (schedResults.length > 0) return schedResults;
    return cc;
  }, []); // no deps — drag type comes from args.active.id, not state

  // Reset editing state when switching trips
  useEffect(() => {
    setEditingLocation(false);
    setSelectedDayNum(1);
    setLocationDaysForward(0);
  }, [state.activeTrip?.id]);

  // ── Trip data ────────────────────────────────────────────────────────────────

  const tripDays = useMemo(() => {
    if (!state.activeTrip) return [];
    return eachDayOfInterval({
      start: parseISO(state.activeTrip.startDate),
      end: parseISO(state.activeTrip.endDate),
    });
  }, [state.activeTrip?.startDate, state.activeTrip?.endDate]);

  const currentItDay = useMemo(() =>
    state.itineraryDays.find(d => d.dayNumber === selectedDayNum),
    [state.itineraryDays, selectedDayNum]
  );

  const dayAccommodations = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.accommodationOptions
      .map(opt => ({ ...opt, poi: state.pois.find(p => p.id === opt.poi_id) }))
      .filter((opt): opt is typeof opt & { poi: NonNullable<typeof opt.poi> } => !!opt.poi);
  }, [currentItDay, state.pois]);

  const dayActivities = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.activities
      .filter(a => a.type === 'poi')
      .map(a => ({ ...a, poi: state.pois.find(p => p.id === a.id) }))
      .filter((a): a is typeof a & { poi: NonNullable<typeof a.poi> } => !!a.poi)
      .sort((a, b) => a.order - b.order);
  }, [currentItDay, state.pois]);

  const dayPotentialActivities = useMemo(() =>
    dayActivities.filter(a => !a.schedule_state || a.schedule_state === 'potential'),
    [dayActivities]
  );

  // Scheduled activities: use raw DB array order, NOT the order field.
  // moveToScheduleAtPosition saves [...scheduledInOrder, ...potentials], so
  // the array position is the source of truth for display order — same as the HTML prototype.
  const dayScheduledActivities = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.activities
      .filter(a => a.type === 'poi' && a.schedule_state === 'scheduled')
      .map(a => ({ ...a, poi: state.pois.find(p => p.id === a.id) }))
      .filter((a): a is typeof a & { poi: NonNullable<typeof a.poi> } => !!a.poi);
    // NO sort — display order = position in the DB activities array
  }, [currentItDay, state.pois]);

  const prevDayAccommodations = useMemo(() => {
    if (selectedDayNum <= 1) return [];
    const prevItDay = state.itineraryDays.find(d => d.dayNumber === selectedDayNum - 1);
    if (!prevItDay) return [];
    return prevItDay.accommodationOptions
      .map(opt => ({ ...opt, poi: state.pois.find(p => p.id === opt.poi_id) }))
      .filter((opt): opt is typeof opt & { poi: NonNullable<typeof opt.poi> } => !!opt.poi);
  }, [state.itineraryDays, state.pois, selectedDayNum]);

  const dayTransport = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.transportationSegments
      .map(seg => ({ ...seg, transport: state.transportation.find(t => t.id === seg.transportation_id) }))
      .filter(seg => seg.transport);
  }, [currentItDay, state.transportation]);

  const scheduleCells = useMemo(() => {
    type RawCell = {
      id: string;
      type: 'activity' | 'transport';
      time?: string;
      endTime?: string;
      label: string;
      sublabel?: string;
      category?: string;
      activityId?: string;
      transportId?: string;
    };
    type ResultCell = RawCell | {
      id: string;
      type: 'group';
      label: string;
      groupItems: { activityId: string; label: string; sublabel?: string; category?: string }[];
    };

    const fmtTime = (iso: string) => {
      try { return format(parseISO(iso), 'HH:mm'); } catch { return undefined; }
    };

    // Transport cells — sorted by departure time
    const transportCells: RawCell[] = [];
    dayTransport.forEach(dt => {
      if (!dt.transport) return;
      const segsToShow = dt.segment_id
        ? dt.transport.segments.filter(s => s.segment_id === dt.segment_id)
        : dt.transport.segments;
      segsToShow.forEach((seg, segIdx) => {
        transportCells.push({
          id: `transport-${dt.transportation_id}-${seg.segment_id || segIdx}`,
          type: 'transport',
          time: seg.departure_time ? fmtTime(seg.departure_time) : undefined,
          endTime: seg.arrival_time ? fmtTime(seg.arrival_time) : undefined,
          label: `${seg.from.name} → ${seg.to.name}`,
          sublabel: [dt.transport!.category, seg.flight_or_vessel_number].filter(Boolean).join(' '),
          category: dt.transport!.category,
          transportId: dt.transportation_id,
        });
      });
    });
    transportCells.sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));

    // Activity cells — kept in dayScheduledActivities ORDER (order field, not time)
    // This lets users control position freely; time is shown but doesn't dictate ordering.
    const activityCells: RawCell[] = dayScheduledActivities.map(a => ({
      id: `activity-${a.id}`,
      type: 'activity',
      time: a.time_window?.start,
      endTime: a.time_window?.end,
      label: a.poi.name,
      sublabel: [a.poi.subCategory, a.poi.location?.city].filter(Boolean).join(' · '),
      category: a.poi.subCategory || a.poi.category,
      activityId: a.id,
    }));

    // Merge: insert each transport cell before the first timed activity whose time
    // is >= the transport's departure time. Untimed activities stay in order position.
    const merged: RawCell[] = [];
    let tIdx = 0;
    for (const act of activityCells) {
      if (act.time) {
        // Flush any transport that departs before this activity's start time
        while (tIdx < transportCells.length && transportCells[tIdx].time && transportCells[tIdx].time! <= act.time!) {
          merged.push(transportCells[tIdx++]);
        }
      }
      merged.push(act);
    }
    // Remaining transport at the end
    while (tIdx < transportCells.length) merged.push(transportCells[tIdx++]);

    // Group consecutive untimed activity cells
    const result: ResultCell[] = [];
    let groupBuffer: RawCell[] = [];
    let lastTimedCellTime: string | undefined;

    const flushGroup = (nextTime?: string) => {
      if (groupBuffer.length === 0) return;
      result.push({
        id: `group-${groupBuffer.map(b => b.activityId).join('-')}`,
        type: 'group',
        label: getSmartLabel(lastTimedCellTime, nextTime),
        groupItems: groupBuffer.map(b => ({
          activityId: b.activityId!,
          label: b.label,
          sublabel: b.sublabel,
          category: b.category,
        })),
      });
      groupBuffer = [];
    };

    for (const cell of merged) {
      if (cell.time) {
        flushGroup(cell.time);
        result.push(cell);
        lastTimedCellTime = cell.time;
      } else if (cell.type === 'activity') {
        groupBuffer.push(cell);
      } else {
        // Untimed transport — flush buffer then push
        flushGroup(undefined);
        result.push(cell);
      }
    }
    flushGroup(undefined);

    return result;
  }, [dayTransport, dayScheduledActivities]);

  // ── Drag preview data ────────────────────────────────────────────────────────

  const dragPreviewData = useMemo(() => {
    if (!activeId) return null;
    if (isScheduledBeingDragged) {
      const actId = activeId.replace('sched-', '');
      for (const cell of scheduleCells) {
        if (cell.type === 'activity' && cell.activityId === actId) {
          return { label: cell.label, category: cell.category };
        }
        if (cell.type === 'group' && cell.groupItems) {
          const item = cell.groupItems.find(gi => gi.activityId === actId);
          if (item) return { label: item.label, category: item.category };
        }
      }
      return null;
    }
    const activity = dayPotentialActivities.find(a => a.id === activeId);
    return activity ? { label: activity.poi.name, category: activity.poi.subCategory } : null;
  }, [activeId, isScheduledBeingDragged, dayPotentialActivities, scheduleCells]);

  // ── Location suggestions ─────────────────────────────────────────────────────

  const transportLocationSuggestions = useMemo<LocationSuggestion[]>(() => {
    const suggestions: LocationSuggestion[] = [];
    dayActivities.forEach(a => {
      if (a.poi?.name) {
        const label = a.poi.location?.city ? `${a.poi.name} (${a.poi.location.city})` : a.poi.name;
        suggestions.push({ label, type: 'activity' });
      }
    });
    dayAccommodations.forEach(a => {
      if (a.poi?.name) {
        const label = a.poi.location?.city ? `${a.poi.name} (${a.poi.location.city})` : a.poi.name;
        suggestions.push({ label, type: 'accommodation' });
      }
    });
    const prevItDay = state.itineraryDays.find(d => d.dayNumber === selectedDayNum - 1);
    if (prevItDay) {
      prevItDay.accommodationOptions.forEach(opt => {
        const poi = state.pois.find(p => p.id === opt.poi_id);
        if (poi && !suggestions.some(s => s.label.startsWith(poi.name))) {
          const label = poi.location?.city ? `${poi.name} (${poi.location.city})` : poi.name;
          suggestions.push({ label, type: 'accommodation' });
        }
      });
    }
    dayTransport.forEach(dt => {
      if (dt.transport?.category === 'flight' && dt.transport.segments) {
        dt.transport.segments.forEach(seg => {
          const depLabel = seg.from.code ? `${seg.from.name} (${seg.from.code})` : seg.from.name;
          const arrLabel = seg.to.code ? `${seg.to.name} (${seg.to.code})` : seg.to.name;
          if (!suggestions.some(s => s.label === depLabel)) suggestions.push({ label: depLabel, type: 'airport' });
          if (!suggestions.some(s => s.label === arrLabel)) suggestions.push({ label: arrLabel, type: 'airport' });
        });
      }
    });
    return suggestions;
  }, [dayActivities, dayAccommodations, dayTransport, state.itineraryDays, state.pois, selectedDayNum]);

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

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const refreshDays = useCallback(async () => {
    if (state.activeTrip) await loadTripData(state.activeTrip.id);
  }, [state.activeTrip, loadTripData]);

  const ensureItDay = useCallback(async () => {
    if (currentItDay) return currentItDay;
    if (!state.activeTrip) return null;
    const day = tripDays[selectedDayNum - 1];
    return await tripService.createItineraryDay({
      tripId: state.activeTrip.id,
      dayNumber: selectedDayNum,
      date: day ? format(day, 'yyyy-MM-dd') : undefined,
      locationContext: '',
      accommodationOptions: [],
      activities: [],
      transportationSegments: [],
    });
  }, [currentItDay, state.activeTrip, selectedDayNum, tripDays]);

  // ── Entity CRUD ──────────────────────────────────────────────────────────────

  const addEntityToDay = useCallback(async (
    entityType: 'accommodation' | 'activity' | 'transport',
    entityId: string,
    nights?: number,
  ) => {
    const itDay = await ensureItDay();
    if (!itDay) return;

    if (entityType === 'accommodation') {
      const nightCount = nights || 1;
      const dayNumbers: number[] = [];
      for (let i = 0; i < nightCount; i++) {
        const dayNum = selectedDayNum + i;
        if (dayNum <= tripDays.length) dayNumbers.push(dayNum);
      }
      for (const dayNum of dayNumbers) {
        let targetDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
        if (!targetDay && state.activeTrip) {
          const day = tripDays[dayNum - 1];
          targetDay = await tripService.createItineraryDay({
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
            await tripService.updateItineraryDay(targetDay.id, {
              accommodationOptions: [...existing, { is_selected: false, poi_id: entityId }],
            });
          }
        }
      }
      const poi = state.pois.find(p => p.id === entityId);
      if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
        await updatePOI({ ...poi, status: 'matched' });
      }
    } else if (entityType === 'activity') {
      const existing = itDay.activities || [];
      if (existing.some(a => a.id === entityId)) return;
      await tripService.updateItineraryDay(itDay.id, {
        activities: [...existing, { order: existing.length + 1, type: 'poi', id: entityId }],
      });
      const poi = state.pois.find(p => p.id === entityId);
      if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
        await updatePOI({ ...poi, status: 'matched' });
      }
    } else if (entityType === 'transport') {
      const existing = itDay.transportationSegments || [];
      if (existing.some(s => s.transportation_id === entityId)) return;
      await tripService.updateItineraryDay(itDay.id, {
        transportationSegments: [...existing, { is_selected: true, transportation_id: entityId }],
      });
    }

    await refreshDays();
  }, [ensureItDay, refreshDays, selectedDayNum, tripDays, state.itineraryDays, state.activeTrip, state.pois, updatePOI]);

  const removeEntityFromDay = useCallback(async (
    entityType: 'accommodation' | 'activity' | 'transport',
    entityId: string,
  ) => {
    if (!currentItDay) return;
    if (entityType === 'accommodation') {
      await tripService.updateItineraryDay(currentItDay.id, {
        accommodationOptions: currentItDay.accommodationOptions.filter(o => o.poi_id !== entityId),
      });
    } else if (entityType === 'activity') {
      await tripService.updateItineraryDay(currentItDay.id, {
        activities: currentItDay.activities.filter(a => a.id !== entityId),
      });
    } else if (entityType === 'transport') {
      await tripService.updateItineraryDay(currentItDay.id, {
        transportationSegments: currentItDay.transportationSegments.filter(s => s.transportation_id !== entityId),
      });
    }
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const toggleActivityScheduleState = useCallback(async (
    activityId: string,
    scheduleState: 'potential' | 'scheduled',
  ) => {
    if (!currentItDay) return;
    const updated = currentItDay.activities.map(a =>
      a.id === activityId ? { ...a, schedule_state: scheduleState } : a
    );
    await tripService.updateItineraryDay(currentItDay.id, { activities: updated });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const reorderDayActivities = useCallback(async (orderedIds: string[]) => {
    if (!currentItDay) return;
    const reordered = orderedIds.map((id, idx) => {
      const existing = currentItDay.activities.find(a => a.id === id);
      return existing ? { ...existing, order: idx + 1 } : null;
    }).filter((a): a is NonNullable<typeof a> => a !== null);
    const others = currentItDay.activities.filter(a => !orderedIds.includes(a.id));
    await tripService.updateItineraryDay(currentItDay.id, { activities: [...reordered, ...others] });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  // Move a potential activity into the schedule at a specific visual gap position.
  // gapIndex corresponds to gap-N droppable IDs rendered between scheduleCells.
  const moveToScheduleAtPosition = useCallback(async (
    activityId: string,
    gapIndex: number,
  ) => {
    if (!currentItDay) return;

    // Collect scheduled activity IDs before and after the gap in current visual order
    const activitiesBefore: string[] = [];
    const activitiesAfter: string[] = [];
    scheduleCells.forEach((cell, cellIdx) => {
      const isBefore = cellIdx < gapIndex;
      if (cell.type === 'activity' && cell.activityId) {
        (isBefore ? activitiesBefore : activitiesAfter).push(cell.activityId);
      } else if (cell.type === 'group' && cell.groupItems) {
        cell.groupItems.forEach(gi => {
          (isBefore ? activitiesBefore : activitiesAfter).push(gi.activityId);
        });
      }
    });

    const orderedIds = [...activitiesBefore, activityId, ...activitiesAfter];
    console.log('[DnD] moveToPos:', { activityId, gapIndex, cells: scheduleCells.length, activitiesBefore, activitiesAfter, orderedIds });

    // Toggle schedule_state and assign contiguous order values
    const withToggled = currentItDay.activities.map(a =>
      a.id === activityId ? { ...a, schedule_state: 'scheduled' as const } : a
    );
    const reordered = orderedIds.map((id, idx) => {
      const existing = withToggled.find(a => a.id === id);
      return existing ? { ...existing, order: idx + 1 } : null;
    }).filter((a): a is NonNullable<typeof a> => a !== null);
    const others = withToggled.filter(a => !orderedIds.includes(a.id));

    await tripService.updateItineraryDay(currentItDay.id, { activities: [...reordered, ...others] });
    await refreshDays();
  }, [currentItDay, scheduleCells, refreshDays]);

  const moveActivityToDay = useCallback(async (
    activityId: string,
    targetDayNum: number,
  ) => {
    if (!currentItDay || !state.activeTrip) return;
    const updatedActivities = currentItDay.activities.filter(a => a.id !== activityId);
    await tripService.updateItineraryDay(currentItDay.id, { activities: updatedActivities });
    let targetDay = state.itineraryDays.find(d => d.dayNumber === targetDayNum);
    if (!targetDay) {
      const day = tripDays[targetDayNum - 1];
      targetDay = await tripService.createItineraryDay({
        tripId: state.activeTrip.id,
        dayNumber: targetDayNum,
        date: day ? format(day, 'yyyy-MM-dd') : undefined,
        locationContext: '',
        accommodationOptions: [],
        activities: [],
        transportationSegments: [],
      });
    }
    if (targetDay) {
      const existing = targetDay.activities || [];
      await tripService.updateItineraryDay(targetDay.id, {
        activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: activityId }],
      });
    }
    await refreshDays();
  }, [currentItDay, state.activeTrip, state.itineraryDays, tripDays, refreshDays]);

  const toggleAccommodationSelected = useCallback(async (poiId: string, selected: boolean) => {
    if (!currentItDay) return;
    const updated = currentItDay.accommodationOptions.map(o => ({
      ...o,
      is_selected: o.poi_id === poiId ? selected : false,
    }));
    await tripService.updateItineraryDay(currentItDay.id, { accommodationOptions: updated });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const handleCreateNewPOI = useCallback(async (
    entityType: 'accommodation' | 'activity',
    data: Record<string, string>,
    createBookingMission?: boolean,
  ) => {
    if (!state.activeTrip) return;
    const nights = parseInt(data._nights) || 1;
    const newPOI = await addPOI({
      tripId: state.activeTrip.id,
      category: data.category as any,
      subCategory: data.subCategory || undefined,
      name: data.name,
      status: 'candidate',
      location: { city: data.city || undefined },
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      details: {},
      isCancelled: false,
    });
    if (newPOI) {
      await addEntityToDay(entityType, newPOI.id, entityType === 'accommodation' ? nights : undefined);
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
  }, [state.activeTrip, addPOI, addEntityToDay, addMission]);

  const handleCreateNewTransport = useCallback(async (data: Record<string, string>) => {
    if (!state.activeTrip) return;
    const newT = await addTransportation({
      tripId: state.activeTrip.id,
      category: data.category || 'flight',
      status: 'candidate',
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      cost: { total_amount: 0, currency: state.activeTrip.currency },
      booking: {},
      segments: [{
        from: { name: data.fromName },
        to: { name: data.toName },
        departure_time: new Date().toISOString(),
        arrival_time: new Date().toISOString(),
      }],
      additionalInfo: {},
      isCancelled: false,
    });
    if (newT) {
      await addEntityToDay('transport', newT.id);
      const label = `${data.fromName} → ${data.toName}`;
      await addMission({
        tripId: state.activeTrip.id,
        title: `להזמין: ${label}`,
        description: `${data.category || 'flight'}`,
        status: 'pending',
        contextLinks: [],
        reminders: [],
        objectLink: newT.id,
      });
    }
  }, [state.activeTrip, addTransportation, addEntityToDay, addMission]);

  const updateLocationContext = useCallback(async () => {
    const totalDays = 1 + locationDaysForward;
    for (let i = 0; i < totalDays; i++) {
      const dayNum = selectedDayNum + i;
      if (dayNum > tripDays.length) break;
      let targetDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
      if (!targetDay && state.activeTrip) {
        const day = tripDays[dayNum - 1];
        targetDay = await tripService.createItineraryDay({
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
        await tripService.updateItineraryDay(targetDay.id, { locationContext });
      }
    }
    setEditingLocation(false);
    setLocationDaysForward(0);
    await refreshDays();
  }, [ensureItDay, currentItDay, locationContext, locationDaysForward, selectedDayNum, tripDays, state.itineraryDays, state.activeTrip, refreshDays]);

  // ── Drag handlers ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setIsOverSchedule(false);
    setIsOverPotential(false);
  }, []);

  const handleDragOver = useCallback((event: DragOverEvent) => {
    const overId = event.over?.id?.toString() ?? '';
    const activeIsScheduled = event.active.id.toString().startsWith('sched-');
    console.log('[DnD] over:', overId);
    setIsOverSchedule(
      overId === 'schedule-drop-zone' ||
      overId.startsWith('gap-') ||
      (!activeIsScheduled && overId.startsWith('sched-'))
    );
    setIsOverPotential(overId === 'potential-drop-zone');
  }, []);

  const handleDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    setIsOverSchedule(false);
    setIsOverPotential(false);
    if (!over) return;

    const isScheduled = active.id.toString().startsWith('sched-');
    const activityId = isScheduled
      ? active.id.toString().replace('sched-', '')
      : active.id.toString();
    const overId = over.id.toString();
    console.log('[DnD] dragEnd:', { activeId: active.id.toString(), overId, isScheduled, activityId });

    if (overId.startsWith('day-drop-')) {
      // Move to another day (works for both potential and scheduled)
      const targetDay = parseInt(overId.replace('day-drop-', ''));
      if (!isNaN(targetDay)) await moveActivityToDay(activityId, targetDay);
    } else if (overId === 'potential-drop-zone' && isScheduled) {
      // Schedule → Potential
      await toggleActivityScheduleState(activityId, 'potential');
    } else if (isScheduled && overId.startsWith('sched-')) {
      // Reorder within schedule
      const schedIds = dayScheduledActivities.map(a => a.id);
      const oldIdx = schedIds.indexOf(activityId);
      const newIdx = schedIds.indexOf(overId.replace('sched-', ''));
      if (oldIdx !== -1 && newIdx !== -1 && oldIdx !== newIdx) {
        await reorderDayActivities(arrayMove(schedIds, oldIdx, newIdx));
      }
    } else if (!isScheduled && overId.startsWith('gap-')) {
      // Potential → Schedule at a specific visual position (gap between cells)
      const gapIndex = parseInt(overId.replace('gap-', ''));
      if (!isNaN(gapIndex)) await moveToScheduleAtPosition(activityId, gapIndex);
    } else if (!isScheduled && overId.startsWith('sched-')) {
      // Potential → dropped on a scheduled cell body (not a gap edge).
      // Insert AFTER that cell (cellIdx + 1): top-edge drops are caught by the gap above,
      // so landing on the card body means "put it after this card."
      const targetActId = overId.replace('sched-', '');
      const cellIdx = scheduleCells.findIndex(c =>
        (c.type === 'activity' && c.activityId === targetActId) ||
        (c.type === 'group' && c.groupItems?.some(gi => gi.activityId === targetActId))
      );
      if (cellIdx !== -1) {
        await moveToScheduleAtPosition(activityId, cellIdx + 1);
      } else {
        await toggleActivityScheduleState(activityId, 'scheduled');
      }
    } else if (!isScheduled && overId === 'schedule-drop-zone') {
      // Potential → Schedule (fallback: whole-zone drop)
      await toggleActivityScheduleState(activityId, 'scheduled');
    } else if (!isScheduled && overId !== active.id.toString()) {
      // Reorder within potential list
      const oldIdx = dayPotentialActivities.findIndex(a => a.id === activityId);
      const newIdx = dayPotentialActivities.findIndex(a => a.id === overId);
      if (oldIdx !== -1 && newIdx !== -1) {
        const newOrder = arrayMove(dayPotentialActivities.map(a => a.id), oldIdx, newIdx);
        await reorderDayActivities(newOrder);
      }
    }
  }, [moveActivityToDay, toggleActivityScheduleState, reorderDayActivities, moveToScheduleAtPosition, dayPotentialActivities, dayScheduledActivities, scheduleCells]);

  // ── Loading / no-trip states ─────────────────────────────────────────────────

  if (state.isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!state.activeTrip) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <CalendarDays size={48} className="text-muted-foreground/40 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No trips yet</h2>
          <p className="text-muted-foreground mb-6">Create your first trip to get started!</p>
          <CreateTripForm />
        </div>
      </AppLayout>
    );
  }

  const trip = state.activeTrip;
  const selectedDate = tripDays[selectedDayNum - 1];

  const availableAccom = state.pois.filter(p => p.category === 'accommodation' && !p.isCancelled && !dayAccommodations.some(d => d.poi_id === p.id));
  const availableActivities = state.pois.filter(p => p.category !== 'accommodation' && !p.isCancelled && !dayActivities.some(d => d.id === p.id));
  const availableTransport = state.transportation.filter(t => !t.isCancelled && !dayTransport.some(d => d.transportation_id === t.id));

  const locationDayWidth = typeof window !== 'undefined' ? (window.innerWidth < 640 ? 64 : 80) : 72;
  const selectedIdx = selectedDayNum - 1;
  const selectedSpan = locationSpans.find(s => s.startIdx <= selectedIdx && s.endIdx >= selectedIdx);

  return (
    <AppLayout>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="space-y-6">
          {/* Trip info */}
          <div>
            {trip.description && <p className="text-muted-foreground text-sm">{trip.description}</p>}
            <div className="flex gap-2 mt-1 flex-wrap">
              <Badge variant="outline">{trip.status}</Badge>
              <Badge variant="secondary">
                {format(parseISO(trip.startDate), 'MMM d')} – {format(parseISO(trip.endDate), 'MMM d, yyyy')}
              </Badge>
              {trip.countries.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}
            </div>
          </div>

          {/* Horizontal Day Selector — pills double as DnD drop targets */}
          <ScrollArea className="w-full">
            <div className="flex gap-2 pb-1" id="day-selector-row">
              {tripDays.map((day, idx) => {
                const dayNum = idx + 1;
                const isSelected = dayNum === selectedDayNum;
                const itDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
                const hasContent = !!itDay && (
                  (itDay.accommodationOptions?.length || 0) > 0 ||
                  (itDay.activities?.length || 0) > 0 ||
                  (itDay.transportationSegments?.length || 0) > 0
                );
                return (
                  <DroppableDayPill
                    key={dayNum}
                    dayNum={dayNum}
                    day={day}
                    isSelected={isSelected}
                    hasContent={hasContent}
                    onClick={() => {
                      setSelectedDayNum(dayNum);
                      const it = state.itineraryDays.find(d => d.dayNumber === dayNum);
                      setLocationContext(it?.locationContext || '');
                      setEditingLocation(false);
                    }}
                  />
                );
              })}
            </div>
            {/* Gantt-like location bar */}
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

          {/* Location picker */}
          {editingLocation && selectedDate && (
            <div className="w-full sm:w-80">
              <LocationContextPicker
                countries={trip.countries}
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

          {/* 4-Section Day Content */}
          {selectedDate && (
            <ItineraryDayContent
              selectedDayNum={selectedDayNum}
              tripDays={tripDays}
              // Drag state from this DndContext
              isDragging={isDragging}
              isOverSchedule={isOverSchedule}
              isOverPotential={isOverPotential}
              isScheduledBeingDragged={isScheduledBeingDragged}
              // Section 1
              prevDayAccommodations={prevDayAccommodations}
              // Section 2
              potentialActivities={dayPotentialActivities}
              availableActivities={availableActivities.map(p => ({
                id: p.id,
                label: p.name,
                sublabel: `${p.category} • ${p.location.city || ''}`,
                city: p.location.city || '',
                status: p.status,
              }))}
              locationContext={currentItDay?.locationContext || ''}
              countries={trip.countries}
              tripSitesHierarchy={state.tripSitesHierarchy}
              onMoveActivityToDay={moveActivityToDay}
              onRemoveActivity={(id) => removeEntityFromDay('activity', id)}
              onAddActivity={async (id, _nights, createBooking) => {
                await addEntityToDay('activity', id);
                if (createBooking && state.activeTrip) {
                  const poi = state.pois.find(p => p.id === id);
                  await addMission({
                    tripId: state.activeTrip.id,
                    title: `להזמין: ${poi?.name || 'פעילות'}`,
                    description: poi?.category || 'activity',
                    status: 'pending',
                    contextLinks: [],
                    reminders: [],
                    objectLink: id,
                  });
                }
              }}
              onCreateNewActivity={(data, bookingMission) => handleCreateNewPOI('activity', data, bookingMission)}
              // Section 3
              scheduleCells={scheduleCells}
              availableTransport={availableTransport.map(t => ({
                id: t.id,
                label: t.segments.length > 0
                  ? `${t.segments[0].from.name} → ${t.segments[t.segments.length - 1].to.name}`
                  : t.category,
                sublabel: t.category,
              }))}
              locationSuggestions={transportLocationSuggestions}
              onRemoveTransport={(id) => removeEntityFromDay('transport', id)}
              onAddTransport={async (id) => {
                await addEntityToDay('transport', id);
                if (state.activeTrip) {
                  const t = state.transportation.find(tr => tr.id === id);
                  const label = t && t.segments.length > 0
                    ? `${t.segments[0].from.name} → ${t.segments[t.segments.length - 1].to.name}`
                    : t?.category || 'תחבורה';
                  await addMission({
                    tripId: state.activeTrip.id,
                    title: `להזמין: ${label}`,
                    description: t?.category || 'transport',
                    status: 'pending',
                    contextLinks: [],
                    reminders: [],
                    objectLink: id,
                  });
                }
              }}
              onCreateNewTransport={handleCreateNewTransport}
              // Section 4
              dayAccommodations={dayAccommodations}
              availableAccom={availableAccom.map(p => ({
                id: p.id,
                label: p.name,
                sublabel: p.location.city || '',
                city: p.location.city || '',
                status: p.status,
              }))}
              onToggleAccommodationSelected={toggleAccommodationSelected}
              onRemoveAccommodation={(id) => removeEntityFromDay('accommodation', id)}
              onAddAccommodation={async (id, nights, createBooking) => {
                await addEntityToDay('accommodation', id, nights);
                if (createBooking && state.activeTrip) {
                  const poi = state.pois.find(p => p.id === id);
                  await addMission({
                    tripId: state.activeTrip.id,
                    title: `להזמין: ${poi?.name || 'לינה'}`,
                    description: 'accommodation',
                    status: 'pending',
                    contextLinks: [],
                    reminders: [],
                    objectLink: id,
                  });
                }
              }}
              onCreateNewAccommodation={(data, bookingMission) => handleCreateNewPOI('accommodation', { ...data, category: 'accommodation' }, bookingMission)}
              maxNights={tripDays.length - selectedDayNum + 1}
            />
          )}
        </div>

        {/* Drag overlay — follows cursor/finger */}
        <DragOverlay dropAnimation={null}>
          {dragPreviewData && (
            <DragPreview label={dragPreviewData.label} category={dragPreviewData.category} />
          )}
        </DragOverlay>
      </DndContext>
    </AppLayout>
  );
};

export default Index;
