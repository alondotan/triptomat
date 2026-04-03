import { useState, useCallback, useMemo, useEffect, useRef, Fragment, lazy, Suspense } from 'react';
import { AppLayout } from '@/shared/components/layout/AppLayout';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { useTransport } from '@/features/transport/TransportContext';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { updateItineraryDay, createItineraryDay } from '@/features/itinerary/itineraryService';
import { geocodeLocation } from '@/features/geodata/weatherService';
import { findInFlatList } from '@/features/trip/tripLocationService';
import { createTripPlace, deleteTripPlace, reorderTripPlaces, updateTripPlace, updateTripPlaceImage, findTripPlaceByLocationId } from '@/features/trip/tripPlaceService';
import { rebuildPOIBookingsFromDays } from '@/features/poi/poiService';
import { LocationContextPicker } from '@/shared/components/LocationContextPicker';
import { LocationSelector } from '@/shared/components/LocationSelector';
import { parseISO, format, addDays, subDays } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { useTripDays, tripDayDate } from '@/shared/hooks/useTripDays';
import type { ItineraryActivity, ItineraryDay, PointOfInterest } from '@/types/trip';
import { POICard } from '@/features/poi/POICard';
import { POIDetailDialog } from '@/features/poi/POIDetailDialog';
import { CreateTransportForm } from '@/features/transport/CreateTransportForm';
import { TransportDetailDialog } from '@/features/transport/TransportDetailDialog';
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
  horizontalListSortingStrategy,
  arrayMove,
  type AnimateLayoutChanges,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Disable the snap-back animation when an item is dropped
const noReturnAnimation: AnimateLayoutChanges = () => false;

import { ArrowRight, Building2, Calendar, CalendarDays, Check, ChevronLeft, Clock, GripVertical, Image as ImageIcon, Loader2, MapPin, Moon, NotebookPen, Pencil, Plus, Sun, Trash2, X } from 'lucide-react';

const LazyMiniMap = lazy(() => import('@/features/poi/AccommodationMiniMap').then(m => ({ default: m.AccommodationMiniMap })));
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/shared/hooks/use-toast';
import { transitionToDetailedPlanning } from '@/features/trip/tripStatusTransition';
import { useTripList } from '@/features/trip/TripListContext';
import { DaySection } from '@/features/schedule/DaySection';
import { getSubCategoryEntry, getSubCategoryLabel } from '@/shared/lib/subCategoryConfig';
import { SubCategoryIcon } from '@/shared/components/SubCategoryIcon';
import { useRouteCalculation } from '@/features/transport/useRouteCalculation';
import { RouteMapPanel } from '@/features/transport/RouteMapPanel';
import { TravelLegRow } from '@/features/transport/TravelLegRow';
import { TRANSPORT_CATEGORY_CONFIG, formatDuration, type RouteLeg, type LegOverride } from '@/features/transport/routeService';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import { useLanguage } from '@/context/LanguageContext';
import { useTranslation } from 'react-i18next';
import { useTripWeather } from '@/features/geodata/useWeather';
import { weatherCodeToIcon } from '@/features/geodata/weatherService';

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  label: string;
  emoji: string;
  time?: string;   // time_window.start for timed activities
  sublabel?: string; // city / subCategory
  remark?: string;   // e.g. "Book tickets in advance"
  poi?: PointOfInterest; // original POI object when item represents a POI
  isTimeBlock?: boolean; // named section divider
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

// ─── Chronological reorder ────────────────────────────────────────────────────
// When a time_block gets/changes its time, reorder activities so timed items
// appear in chronological order. Untimed items stay grouped with their preceding
// timed item (their "section leader").

function reorderActivitiesChronologically(
  activities: ItineraryActivity[],
  resolveTime: (act: ItineraryActivity) => string | undefined,
): ItineraryActivity[] {
  const sorted = [...activities].sort((a, b) => a.order - b.order);

  // Build sections: each section = [timed_leader, ...untimed_followers]
  const sections: ItineraryActivity[][] = [];
  let current: ItineraryActivity[] = [];

  for (const act of sorted) {
    if (resolveTime(act) && current.length > 0) {
      sections.push(current);
      current = [act];
    } else {
      current.push(act);
    }
  }
  if (current.length > 0) sections.push(current);

  // Sort sections by leader time (untimed leaders stay at start)
  sections.sort((a, b) => {
    const tA = resolveTime(a[0]);
    const tB = resolveTime(b[0]);
    if (!tA && !tB) return 0;
    if (!tA) return -1;
    if (!tB) return 1;
    return tA.localeCompare(tB);
  });

  // Reassign order values
  let order = 1;
  return sections.flat().map(act => ({ ...act, order: order++ }));
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
    // Time blocks always start a new unlocked group (they act as section headers)
    if (item.isTimeBlock) {
      if (current) { groups.push(current); current = null; }
      current = { id: `unlocked-${item.id}`, items: [item], isLocked: false };
      continue;
    }

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

function slotLabelKey(minutes: number): string {
  if (minutes < 12 * 60) return 'timeline.morning';
  if (minutes < 17 * 60) return 'timeline.afternoon';
  if (minutes < 21 * 60) return 'timeline.evening';
  return 'timeline.night';
}

// Compute display label for a group given its position in the groups array
function groupLabel(groups: Group[], index: number, t: (key: string) => string): string {
  const group = groups[index];

  // Locked group: time_block shows its own label; timed POI shows HH:mm
  if (group.isLocked) {
    const item = group.items[0];
    if (item?.isTimeBlock) return (item.time ? `${item.time} · ` : '') + item.label;
    return item?.time ?? '🔒';
  }

  // Unlocked group: if immediately preceded by a time_block, inherit its label
  for (let i = index - 1; i >= 0; i--) {
    if (groups[i].isLocked) {
      const prevItem = groups[i].items[0];
      if (prevItem?.isTimeBlock) return prevItem.label;
      break;
    }
  }

  // Unlocked group: find surrounding locked neighbours
  const anyLocked = groups.some(g => g.isLocked);
  if (!anyLocked) return t('timeline.freeTime');

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
    return t('timeline.freeTime');
  }
  return t(slotLabelKey(mid));
}

// Can this unlocked group be deleted? Only if there's another unlocked group in
// the same "section" (consecutive run of unlocked groups, bounded by locked groups).
function canDeleteGroup(groups: Group[], index: number): boolean {
  const group = groups[index];
  if (group.isLocked) return false;
  let unlockedInSection = 1; // count self
  for (let i = index - 1; i >= 0 && !groups[i].isLocked; i--) unlockedInSection++;
  for (let i = index + 1; i < groups.length && !groups[i].isLocked; i++) unlockedInSection++;
  return unlockedInSection > 1;
}

// ─── Draggable potential item ──────────────────────────────────────────────────

function DraggableItem({ item, isBeingDragged, onRemove }: { item: Item; isBeingDragged: boolean; onRemove?: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-start gap-2.5 bg-card border rounded-xl px-3 py-2.5 select-none transition-opacity touch-manipulation ${
        isBeingDragged ? 'opacity-30' : 'hover:border-primary/40'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 p-0.5 mt-1 touch-none select-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
      >
        <GripVertical size={14} />
      </button>
      {item.poi ? (
        <POICard poi={item.poi} level={2} />
      ) : (
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="material-symbols-outlined">{item.emoji}</span>
          <span className="text-sm font-medium">{item.label}</span>
          {item.remark && <span className="text-xs text-muted-foreground ml-1">{item.remark}</span>}
        </div>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title={t('timeline.removeFromSchedule')}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Sortable scheduled item ───────────────────────────────────────────────────

function SortableScheduledItem({
  item, isLocked, onToggleLock, onAddTransport, onDeleteTransport, onEditTransport,
  onUpdateTimeBlock, onDeleteTimeBlock, calcDurationMin, onSelect, isSelected, onRemove,
}: {
  item: Item;
  isLocked: boolean;
  onToggleLock: (id: string) => void;
  onAddTransport?: () => void;
  onDeleteTransport?: () => void;
  onEditTransport?: () => void;
  onUpdateTimeBlock?: (label: string, time: string | undefined) => void;
  onDeleteTimeBlock?: () => void;
  calcDurationMin?: number;
  onSelect?: () => void;
  isSelected?: boolean;
  onRemove?: () => void;
}) {
  const isTransport = !item.poi && item.id.startsWith('trans_');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sched-${item.id}`,
    disabled: isLocked || isTransport,
    animateLayoutChanges: noReturnAnimation,
  });

  // Inline edit state for time_block items
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(item.label);
  const [editTime, setEditTime] = useState(item.time ?? '');

  const saveEdit = () => {
    onUpdateTimeBlock?.(editLabel.trim() || item.label, editTime || undefined);
    setIsEditing(false);
  };
  const cancelEdit = () => {
    setEditLabel(item.label);
    setEditTime(item.time ?? '');
    setIsEditing(false);
  };

  // Time-block item: render as a section-divider row
  if (item.isTimeBlock) {
    return (
      <div
        ref={setNodeRef}
        style={{
          transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
          transition,
        }}
        className={`flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 transition-opacity touch-manipulation ${isDragging ? 'opacity-40' : ''}`}
      >
        <button
          {...attributes}
          {...(isLocked ? {} : listeners)}
          disabled={isLocked}
          className="shrink-0 p-0.5 touch-none select-none opacity-30 cursor-not-allowed"
        >
          <GripVertical size={13} />
        </button>
        <Clock size={13} className="text-primary/60 shrink-0" />
        {isEditing ? (
          <>
            <Input
              value={editLabel}
              onChange={e => setEditLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') cancelEdit(); }}
              className="h-6 text-xs flex-1 min-w-0 px-1.5"
              autoFocus
            />
            <input
              type="time"
              value={editTime}
              onChange={e => setEditTime(e.target.value)}
              className="h-6 text-xs border border-input rounded px-1.5 bg-background w-24"
            />
            <button type="button" onClick={saveEdit} className="p-0.5 text-primary hover:text-primary/80 transition-colors shrink-0">
              <Check size={13} />
            </button>
            <button type="button" onClick={cancelEdit} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0">
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-xs font-semibold text-primary/80 truncate">{item.label}</span>
            {item.time && (
              <span className="text-[10px] text-primary/50 shrink-0 font-mono">{item.time}</span>
            )}
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="p-1 rounded text-muted-foreground/40 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                onClick={onDeleteTimeBlock}
                className="p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={12} />
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div
      id={item.poi ? `sched-item-${item.id}` : undefined}
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
        transition,
      }}
      className={`flex items-start gap-1.5 sm:gap-2.5 bg-card border rounded-lg px-1.5 sm:px-3 py-2 sm:py-2.5 transition-opacity touch-manipulation ${
        isLocked ? 'opacity-70' : ''
      } ${isDragging ? 'opacity-40' : ''} ${isSelected ? 'ring-2 ring-primary' : ''}`}
    >
      {!isTransport && (
        <button
          {...attributes}
          {...(isLocked ? {} : listeners)}
          disabled={isLocked}
          className={`shrink-0 p-0.5 mt-1 touch-none select-none transition-opacity ${
            isLocked
              ? 'opacity-20 cursor-not-allowed'
              : 'cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground'
          }`}
        >
          <GripVertical size={14} />
        </button>
      )}
      {item.poi ? (
        <>
          <POICard poi={item.poi} level={2} editable onAddTransport={onAddTransport} onSelect={onSelect} isSelected={isSelected} />
          {onRemove && (
            <button
              type="button"
              className="shrink-0 p-1 mt-0.5 text-muted-foreground/30 hover:text-destructive hover:bg-destructive/10 rounded transition-colors self-start"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
            >
              <X size={12} />
            </button>
          )}
        </>
      ) : (
        <>
          <span className="material-symbols-outlined text-base">{item.emoji}</span>
          <div
            className={`flex-1 min-w-0 ${isTransport ? 'cursor-pointer' : ''}`}
            onClick={isTransport ? onEditTransport : undefined}
          >
            <span className={`text-sm font-medium block truncate ${isLocked ? 'text-muted-foreground' : ''}`}>
              {item.label}
            </span>
            {item.sublabel && (
              <span className="text-xs text-muted-foreground truncate block">{item.sublabel}</span>
            )}
            {isTransport && calcDurationMin != null && calcDurationMin > 0 && (
              <span className="text-xs text-muted-foreground/70 block">~{formatDuration(calcDurationMin)}</span>
            )}
          </div>
          {item.remark && (
            <span className={`text-xs text-muted-foreground ${isLocked ? 'opacity-60' : ''}`}>
              {item.remark}
            </span>
          )}
          {isTransport && (
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onDeleteTransport}
                className="p-1 rounded text-muted-foreground/50 hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Time-block section header ─────────────────────────────────────────────────

function TimeBlockSectionHeader({ item, canDelete, onUpdate, onDelete, dragHandleRef, dragHandleProps }: {
  item: Item;
  canDelete?: boolean;
  onUpdate: (label: string, time: string | undefined) => void;
  onDelete: () => void;
  dragHandleRef?: (node: HTMLElement | null) => void;
  dragHandleProps?: Record<string, unknown>;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(item.label);
  const [editTime, setEditTime] = useState(item.time ?? '');

  const save = () => {
    onUpdate(editLabel.trim() || item.label, editTime || undefined);
    setIsEditing(false);
  };
  const cancel = () => {
    setEditLabel(item.label);
    setEditTime(item.time ?? '');
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="flex items-center gap-1.5 py-0.5 px-1">
        <Input
          value={editLabel}
          onChange={e => setEditLabel(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          className="h-6 text-xs flex-1 min-w-0"
          autoFocus
        />
        <input
          type="time"
          value={editTime}
          onChange={e => setEditTime(e.target.value)}
          className="h-6 text-xs border border-input rounded px-1.5 bg-background w-24"
        />
        <button type="button" onClick={save} className="p-0.5 text-primary hover:text-primary/80 transition-colors shrink-0">
          <Check size={12} />
        </button>
        <button type="button" onClick={cancel} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0">
          <X size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 py-0.5 px-1">
      <div className="flex items-center gap-1">
        {dragHandleProps && (
          <button
            type="button"
            ref={dragHandleRef}
            {...dragHandleProps}
            className="shrink-0 p-0.5 touch-none select-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
          >
            <GripVertical size={13} />
          </button>
        )}
        {item.time && (
          <span className="text-[10px] font-semibold text-amber-500/70 font-mono shrink-0">{item.time}</span>
        )}
        <span className="text-[10px] font-semibold tracking-widest text-primary/80 uppercase flex-1">{item.label}</span>
      </div>
      <div className={`flex items-center gap-0.5 ${dragHandleProps ? 'ps-5' : ''}`}>
        <button
          type="button"
          onClick={() => { setEditLabel(item.label); setEditTime(item.time ?? ''); setIsEditing(true); }}
          className="p-0.5 text-muted-foreground/40 hover:text-primary transition-colors"
        >
          <Pencil size={11} />
        </button>
        {canDelete !== false && (
          <button
            type="button"
            onClick={onDelete}
            className="p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Group frame ───────────────────────────────────────────────────────────────

function GroupFrame({ group, label, lockedIds, onToggleLock, onAddTransport, onDeleteTransport, onEditTransport, onUpdateTimeBlock, onDeleteTimeBlock, canDelete, onRenameGroup, onDeleteGroup, legMap, onHighlightLeg, transportCalcDurations, selectedItemId, onSelectItem, onRemoveActivity }: {
  group: Group;
  label: string;
  lockedIds: Set<string>;
  onToggleLock: (id: string) => void;
  onAddTransport?: (poiId: string) => void;
  onDeleteTransport?: (transportId: string) => void;
  onEditTransport?: (transportId: string) => void;
  onUpdateTimeBlock?: (itemId: string, label: string, time: string | undefined) => void;
  onDeleteTimeBlock?: (itemId: string) => void;
  canDelete?: boolean;
  onRenameGroup?: (label: string, time: string | undefined) => void;
  onDeleteGroup?: () => void;
  legMap?: Map<string, RouteLeg>;
  onHighlightLeg?: (fromStopId: string) => void;
  transportCalcDurations?: Map<string, number>;
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string) => void;
  onRemoveActivity?: (itemId: string) => void;
}) {
  // Time block item at the start of the group acts as a section header
  const timeBlockItem = group.items.find(i => i.isTimeBlock);
  const contentItems = group.items.filter(i => !i.isTimeBlock);

  // Inline editing state for auto-generated group labels
  const [isEditing, setIsEditing] = useState(false);
  const [editLabel, setEditLabel] = useState(label);
  const [editTime, setEditTime] = useState('');

  const saveAutoLabel = () => {
    onRenameGroup?.(editLabel.trim() || label, editTime || undefined);
    setIsEditing(false);
  };
  const cancelEdit = () => {
    setEditLabel(label);
    setEditTime('');
    setIsEditing(false);
  };

  // Unlocked groups act as a drop target — user can drag any item onto the frame
  const { setNodeRef: setFrameRef, isOver } = useDroppable({
    id: `group-frame-${group.id}`,
    disabled: group.isLocked,
  });

  // Untimed time-block groups can be dragged as a whole
  const isDraggableGroup = !!timeBlockItem && !timeBlockItem.time;
  const { attributes: dragAttrs, listeners: dragListeners, setNodeRef: setDragRef, isDragging: isGroupDragging } = useDraggable({
    id: `group-drag-${group.id}`,
    disabled: !isDraggableGroup,
  });

  return (
    <div
      ref={setFrameRef}
      className={`rounded-lg transition-colors ${isOver ? 'ring-2 ring-primary/40 bg-primary/5' : ''} ${isGroupDragging ? 'opacity-30' : ''}`}
    >
      {timeBlockItem ? (
        <TimeBlockSectionHeader
          item={timeBlockItem}
          canDelete
          onUpdate={(lbl, t) => onUpdateTimeBlock?.(timeBlockItem.id, lbl, t)}
          onDelete={() => onDeleteTimeBlock?.(timeBlockItem.id)}
          dragHandleRef={isDraggableGroup ? setDragRef : undefined}
          dragHandleProps={isDraggableGroup ? { ...dragAttrs, ...dragListeners } : undefined}
        />
      ) : group.isLocked ? (
        <span className="text-[10px] font-semibold tracking-widest px-1 text-amber-500/70">{label}</span>
      ) : isEditing ? (
        <div className="flex items-center gap-1.5 py-0.5 px-1">
          <Input
            value={editLabel}
            onChange={e => setEditLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') saveAutoLabel(); if (e.key === 'Escape') cancelEdit(); }}
            className="h-6 text-xs flex-1 min-w-0"
            autoFocus
          />
          <input
            type="time"
            value={editTime}
            onChange={e => setEditTime(e.target.value)}
            className="h-6 text-xs border border-input rounded px-1.5 bg-background w-24"
          />
          <button type="button" onClick={saveAutoLabel} className="p-0.5 text-primary hover:text-primary/80 transition-colors shrink-0">
            <Check size={12} />
          </button>
          <button type="button" onClick={cancelEdit} className="p-0.5 text-muted-foreground hover:text-foreground transition-colors shrink-0">
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5 py-0.5 px-1">
          <span className="text-[10px] font-semibold tracking-widest text-primary/70 uppercase">{label}</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => { setEditLabel(label); setEditTime(''); setIsEditing(true); }}
              className="p-0.5 text-muted-foreground/40 hover:text-primary transition-colors"
            >
              <Pencil size={11} />
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={onDeleteGroup}
                className="p-0.5 text-muted-foreground/40 hover:text-destructive transition-colors"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>
      )}

      <SortableContext
        items={contentItems.filter(i => !i.id.startsWith('trans_')).map(i => `sched-${i.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className={`space-y-1 ${contentItems.length > 0 ? 'mt-0.5' : ''}`}>
          {contentItems.length === 0 && isOver && (
            <p className="text-xs text-center py-2 text-primary/60">Drop here</p>
          )}
          {contentItems.map((item, i) => {
            // Extract transport id from "trans_<transportId>_<segmentId>"
            const transportId = item.id.startsWith('trans_')
              ? item.id.replace(/^trans_/, '').replace(/_[^_]+$/, '')
              : undefined;
            // Find previous POI to check for a travel leg
            const prevPoi = contentItems.slice(0, i).reverse().find(it => it.poi);
            // Don't show TravelLegRow if a transport item already exists between the two POIs
            const prevPoiIdx = prevPoi ? contentItems.indexOf(prevPoi) : -1;
            const hasTransportBetween = prevPoiIdx >= 0 && contentItems.slice(prevPoiIdx + 1, i).some(it => it.id.startsWith('trans_'));
            const leg = prevPoi && item.poi && !hasTransportBetween ? legMap?.get(prevPoi.id) : null;
            return (
              <Fragment key={item.id}>
                {leg && <TravelLegRow leg={leg} onHighlight={() => onHighlightLeg?.(leg.fromStopId)} />}
                <SortableScheduledItem
                  item={item}
                  isLocked={lockedIds.has(item.id)}
                  onToggleLock={onToggleLock}
                  onAddTransport={item.poi ? () => onAddTransport?.(item.poi!.id) : undefined}
                  onDeleteTransport={transportId ? () => onDeleteTransport?.(transportId) : undefined}
                  onEditTransport={transportId ? () => onEditTransport?.(transportId) : undefined}
                  calcDurationMin={transportCalcDurations?.get(item.id)}
                  onSelect={item.poi && onSelectItem ? () => onSelectItem(item.id) : undefined}
                  isSelected={item.poi ? selectedItemId === item.id : false}
                  onRemove={item.poi ? () => onRemoveActivity?.(item.id) : undefined}
                />
              </Fragment>
            );
          })}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Droppable day pill (real trip days) ─────────────────────────────────────

function DroppableDayPill({
  dayNum, shortLabel, isSelected, hasContent, weatherIcon, onClick, onDoubleClick,
}: {
  dayNum: number;
  shortLabel: { line1: string; line2: string; line3: string };
  isSelected: boolean;
  hasContent: boolean;
  weatherIcon?: string;
  onClick: () => void;
  onDoubleClick?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day-drop-${dayNum}` });
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      className={`flex flex-col items-center w-[56px] sm:w-[72px] px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border-2 transition-all text-xs sm:text-sm shrink-0 ${
        isSelected
          ? 'border-primary bg-primary text-primary-foreground font-semibold'
          : isOver
            ? 'border-primary/80 bg-primary/15 scale-105 shadow-md'
            : hasContent
              ? 'border-primary/30 bg-muted/50 hover:bg-muted'
              : 'border-transparent bg-muted/30 hover:bg-muted text-muted-foreground'
      }`}
    >
      <span className="text-[10px] sm:text-xs">{shortLabel.line1}</span>
      <span className="text-base sm:text-lg font-bold">{shortLabel.line2}</span>
      {shortLabel.line3 && <span className="text-[9px] sm:text-[10px]">{shortLabel.line3}</span>}
      {weatherIcon
        ? <span className="text-sm mt-0.5 leading-none">{weatherIcon}</span>
        : hasContent && !isSelected && <div className="w-1.5 h-1.5 rounded-full bg-current mt-1 opacity-60" />}
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
            ? 'h-7 border border-dashed border-primary/30'
            : 'h-1'
      }`}
    >
      {isOver && <p className="text-xs font-medium text-primary/80">Drop here</p>}
    </div>
  );
}

// ─── Potential drop zone ───────────────────────────────────────────────────────

function PotentialZone({ children, isScheduledDragging }: {
  children: React.ReactNode;
  isScheduledDragging: boolean;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: 'potential-zone', disabled: !isScheduledDragging });
  return (
    <div
      ref={setNodeRef}
      className={`border-2 rounded-xl p-3 transition-all space-y-1.5 ${
        isOver
          ? 'border-amber-400/80 border-dashed bg-amber-50/10 min-h-[80px]'
          : isScheduledDragging
            ? 'border-amber-400/40 border-dashed min-h-[80px]'
            : 'border-border/30'
      } bg-muted/10`}
    >
      {isScheduledDragging && (
        <p className={`text-xs text-center py-1 ${isOver ? 'text-amber-500 font-medium' : 'text-muted-foreground/60'}`}>
          {isOver ? `↩ ${t('timeline.releaseToReturn')}` : `↩ ${t('timeline.dragToReturn')}`}
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
      className={`border-2 rounded-xl p-1.5 sm:p-3 transition-all ${
        isOver && isEmpty
          ? 'border-primary/60 border-dashed bg-primary/5 min-h-[80px]'
          : activePotentialDrag && isEmpty
            ? 'border-primary/20 border-dashed min-h-[80px]'
            : 'border-border/30'
      } bg-muted/10`}
    >
      {children}
    </div>
  );
}

// ─── Sortable location pill ─────────────────────────────────────────────────────

function SortableLocationPill({ id, name, isSelected, poiCount, onSelect, onDelete }: {
  id: string;
  name: string;
  isSelected: boolean;
  poiCount: number;
  onSelect: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, animateLayoutChanges: noReturnAnimation });
  return (
    <div ref={setNodeRef} className="relative shrink-0" style={{
      transform: transform ? CSS.Transform.toString({ ...transform, y: 0 }) : undefined,
      transition,
    }}>
      <button
        type="button"
        onClick={onSelect}
        className={`flex flex-col items-center justify-center rounded-xl sm:rounded-2xl border-2 px-3 py-2 sm:px-5 sm:py-3 text-xs sm:text-sm font-semibold transition-shadow min-w-[72px] sm:min-w-[100px] h-[60px] sm:h-[76px] touch-manipulation ${
          isDragging ? 'opacity-50 z-50' : ''
        } ${
          isSelected
            ? 'border-primary bg-primary text-primary-foreground shadow-lg'
            : 'border-border bg-card text-foreground hover:border-primary/40 hover:shadow-sm'
        }`}
        {...attributes}
        {...listeners}
      >
        <MapPin size={16} className="mb-0.5 sm:mb-1 shrink-0 sm:[&]:w-[20px] sm:[&]:h-[20px]" />
        <span className="text-center leading-tight line-clamp-2 h-[2lh] flex items-center max-w-[70px] sm:max-w-[100px]">{name}</span>
      </button>
      {poiCount > 0 && (
        <span className={`absolute -bottom-1.5 -right-1.5 w-6 h-6 rounded-full text-[11px] font-bold flex items-center justify-center pointer-events-none ${
          isSelected ? 'bg-primary-foreground text-primary' : 'bg-primary text-primary-foreground'
        }`}>
          {poiCount}
        </span>
      )}
      {isSelected && onDelete && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/80 transition-colors z-10"
          aria-label="Delete"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}

// ─── Sortable location span (planning mode Gantt strip) ─────────────────────────

function SortableLocationSpan({ id, location, dayCount, isSelected, locationDayWidth, onClick }: {
  id: string;
  location: string;
  dayCount: number;
  isSelected: boolean;
  locationDayWidth: number;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, animateLayoutChanges: noReturnAnimation });
  const width = dayCount * locationDayWidth - 8;
  return (
    <div
      ref={setNodeRef}
      style={{
        width: `${width}px`,
        transform: transform ? CSS.Transform.toString({ ...transform, y: 0 }) : undefined,
        transition,
      }}
      className={`h-full rounded-md flex items-center overflow-hidden gap-0.5 transition-colors shrink-0 ${
        isDragging ? 'opacity-50 z-50' : ''
      } ${
        isSelected
          ? 'bg-secondary border border-primary/40'
          : 'bg-secondary border border-border'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 p-0.5 touch-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
      >
        <GripVertical size={10} />
      </button>
      <button
        type="button"
        onClick={onClick}
        disabled={!isSelected}
        className={`flex-1 min-w-0 flex items-center gap-1 h-full ${
          isSelected ? 'cursor-pointer hover:text-primary' : 'cursor-default'
        }`}
      >
        <span className="text-xs font-medium text-primary truncate">{location}</span>
        {isSelected && <Pencil size={10} className="shrink-0 text-primary opacity-70" />}
      </button>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const { activeTrip, updateCurrentTrip, tripLocations, tripPlaces, addSiteToHierarchy, reloadLocations, reloadTripPlaces, isLoading: isTripLoading } = useActiveTrip();
  const { updateTripInList } = useTripList();
  const { pois, addPOI, updatePOI } = usePOI();
  const { transportation, deleteTransportation } = useTransport();
  const { itineraryDays, setItineraryDays, addMission, refetchItinerary } = useItinerary();
  const { toast } = useToast();
  const [selectedDayNum, setSelectedDayNum] = useState(1);
  const [addTransportOpen, setAddTransportOpen] = useState(false);
  const [transportFromName, setTransportFromName] = useState('');
  const [transportToName, setTransportToName] = useState('');
  const [editTransportId, setEditTransportId] = useState<string | null>(null);
  const [openedPoiId, setOpenedPoiId] = useState<string | null>(null);
  const [addingTimeBlock, setAddingTimeBlock] = useState(false);
  const [newTbLabel, setNewTbLabel] = useState('');
  const [newTbTime, setNewTbTime] = useState('');

  // ── Route map state ─────────────────────────────────────────────────────────
  const [defaultMode, setDefaultMode] = useState<'car' | 'walk'>('car');
  const [highlightedLegId, setHighlightedLegId] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // ── Mobile layout ──────────────────────────────────────────────────────────
  const isMobile = useIsMobile();
  const { isRTL } = useLanguage();
  const { t } = useTranslation();
  const [mobileTab, setMobileTab] = useState<'schedule' | 'map'>('schedule');
  const [viewMode, setViewMode] = useState<'places' | 'days'>('places');

  // hasDays: true when trip has a day count or exact dates
  const hasDays = !!(activeTrip?.numberOfDays && activeTrip.numberOfDays > 0) || !!activeTrip?.startDate;

  // Research/places mode location strip state
  const [selectedResearchLocId, setSelectedResearchLocId] = useState<string | null>(null);
  const [mobileDetailLocId, setMobileDetailLocId] = useState<string | null>(null);
  const [addLocationOpen, setAddLocationOpen] = useState(false);
  const [addActivityOpen, setAddActivityOpen] = useState(false);
  const [editingLocDays, setEditingLocDays] = useState(false);
  const [locDetailSelectedDayNum, setLocDetailSelectedDayNum] = useState<number | null>(null);

  // Reset day selection + edit mode when entering a different location
  useEffect(() => {
    setEditingLocDays(false);
    setLocDetailSelectedDayNum(null);
  }, [selectedResearchLocId, mobileDetailLocId]);

  // Listen for FAB "add location" event in research mode
  useEffect(() => {
    const handler = () => setAddLocationOpen(true);
    window.addEventListener('research-add-location', handler);
    return () => window.removeEventListener('research-add-location', handler);
  }, []);

  // No auto-select — grid/feed view is the default landing

  // Day date picker dialog state (planning → detailed_planning via double-click)
  const [dateDayNum, setDateDayNum] = useState<number | null>(null);
  const [datePickerValue, setDatePickerValue] = useState('');
  const [datePickerSubmitting, setDatePickerSubmitting] = useState(false);

  // Places mode: derived values for location strip
  // researchLocations = trip_places (ordered by sort_order from server)
  const [locationOrderOverride, setLocationOrderOverride] = useState<string[] | null>(null);
  const researchLocationsBase = tripPlaces; // already sorted by sort_order

  // Apply local order override (cleared once server data catches up)
  const researchLocations = useMemo(() => {
    if (!locationOrderOverride) return researchLocationsBase;
    const byId = new Map(researchLocationsBase.map(p => [p.id, p]));
    const ordered = locationOrderOverride.map(id => byId.get(id)).filter(Boolean) as typeof researchLocationsBase;
    if (ordered.length !== researchLocationsBase.length) return researchLocationsBase;
    return ordered;
  }, [researchLocationsBase, locationOrderOverride]);

  // When trip has exact dates, sort places by their earliest assigned day number
  const sortedResearchLocations = useMemo(() => {
    if (!activeTrip?.startDate) return researchLocations;
    return [...researchLocations].sort((a, b) => {
      const aDays = itineraryDays.filter(d => d.tripPlaceId === a.id).map(d => d.dayNumber);
      const bDays = itineraryDays.filter(d => d.tripPlaceId === b.id).map(d => d.dayNumber);
      const aMin = aDays.length > 0 ? Math.min(...aDays) : Infinity;
      const bMin = bDays.length > 0 ? Math.min(...bDays) : Infinity;
      return aMin - bMin;
    });
  }, [researchLocations, itineraryDays, activeTrip?.startDate]);

  // Clear override once server data matches
  useEffect(() => {
    if (!locationOrderOverride) return;
    const serverIds = researchLocationsBase.map(p => p.id).join(',');
    const overrideIds = locationOrderOverride.join(',');
    if (serverIds === overrideIds) setLocationOrderOverride(null);
  }, [researchLocationsBase, locationOrderOverride]);

  // Map trip_place.id → location name (via trip_locations hierarchy)
  const researchLocNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tp of researchLocations) {
      const loc = tripLocations.find(l => l.id === tp.tripLocationId);
      if (loc) map.set(tp.id, loc.name);
    }
    return map;
  }, [researchLocations, tripLocations]);

  // Holding day for selected research place (stores potential POIs)
  const selectedResearchDay = useMemo(() => {
    if (!selectedResearchLocId) return undefined;
    return itineraryDays.find(d => d.tripPlaceId === selectedResearchLocId);
  }, [selectedResearchLocId, itineraryDays]);

  // Build potential items for selected research location
  const researchPotential = useMemo(() => {
    if (!selectedResearchDay) return [];
    const items: Item[] = [];
    for (const a of selectedResearchDay.activities || []) {
      if (a.type === 'poi') {
        const poi = pois.find(p => p.id === a.id);
        if (!poi) continue;
        items.push({
          id: a.id,
          label: poi.name,
          emoji: categoryEmoji(poi.category),
          sublabel: poi.location?.city || getSubCategoryLabel(poi.subCategory) || '',
          poi,
        });
      }
    }
    return items;
  }, [selectedResearchDay, pois]);

  // POI markers for the research map
  const researchMapMarkers = useMemo(() => {
    return researchPotential
      .filter(i => i.poi?.location?.coordinates)
      .map(i => ({
        lat: i.poi!.location.coordinates!.lat,
        lng: i.poi!.location.coordinates!.lng,
        label: i.poi!.name,
      }));
  }, [researchPotential]);

  // Fetch an image for a trip_place and persist it
  const fetchAndSaveLocationImage = useCallback(async (tripPlaceId: string, locationName: string, tripLocationId?: string) => {
    try {
      let imageUrl: string | null = null;
      const locName = locationName.toLowerCase();
      const nameParts = [locName, ...locName.split(/\s*[&,\-–]\s*/).map(s => s.trim()).filter(Boolean)];

      // 1. Try POIs whose city matches any part of the name
      for (const part of nameParts) {
        const match = pois.find(p => p.imageUrl && p.location?.city?.toLowerCase() === part);
        if (match) { imageUrl = match.imageUrl; break; }
      }

      // 2. Try child locations in the hierarchy
      if (!imageUrl && tripLocationId) {
        const childLocs = tripLocations.filter(tl => tl.parentId === tripLocationId);
        for (const child of childLocs) {
          const match = pois.find(p => p.imageUrl && p.location?.city?.toLowerCase() === child.name.toLowerCase());
          if (match) { imageUrl = match.imageUrl; break; }
        }
      }

      // 3. Fallback: Wikipedia
      if (!imageUrl) {
        const wikiName = nameParts[0] || locationName;
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiName)}`);
        if (res.ok) {
          const data = await res.json();
          imageUrl = data?.originalimage?.source || data?.thumbnail?.source || null;
        }
      }

      if (imageUrl) {
        await updateTripPlaceImage(tripPlaceId, imageUrl);
        await reloadTripPlaces();
      }
    } catch { /* silent */ }
  }, [pois, tripLocations, reloadTripPlaces]);

  // Add a location to the research strip
  const handleAddResearchLocation = useCallback(async (locationName: string) => {
    if (!activeTrip) return;
    setAddLocationOpen(false);
    try {
      // Ensure it's in trip_locations hierarchy
      const tripLoc = findInFlatList(tripLocations, locationName);
      if (!tripLoc) {
        // addSiteToHierarchy triggers a reload; wait for it
        addSiteToHierarchy(locationName);
        await new Promise(r => setTimeout(r, 500));
        await reloadLocations();
        return; // will be picked up on next render
      }

      // Find or create a trip_place for this location
      let tripPlace = findTripPlaceByLocationId(tripPlaces, tripLoc.id);
      if (!tripPlace) {
        tripPlace = await createTripPlace(activeTrip.id, tripLoc.id, { sortOrder: tripPlaces.length });
      }

      // Check if holding day already exists for this trip_place
      const existingDay = itineraryDays.find(d => d.tripPlaceId === tripPlace!.id);
      if (!existingDay) {
        const dayNumber = researchLocations.length + 1;
        await createItineraryDay({
          tripId: activeTrip.id,
          dayNumber,
          tripPlaceId: tripPlace.id,
          accommodationOptions: [],
          activities: [],
          transportationSegments: [],
        });
      }

      await reloadTripPlaces();
      await refetchItinerary();

      // Fetch and persist image in the background (fire-and-forget)
      if (!tripPlace.imageUrl) {
        fetchAndSaveLocationImage(tripPlace.id, locationName, tripLoc.id);
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  }, [activeTrip, tripLocations, tripPlaces, addSiteToHierarchy, reloadLocations, reloadTripPlaces, itineraryDays, researchLocations, refetchItinerary, fetchAndSaveLocationImage, t, toast]);

  // Drag-end handler for reordering research location pills
  const handleLocationDragEnd = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = researchLocations.findIndex(l => l.id === active.id);
    const newIndex = researchLocations.findIndex(l => l.id === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(researchLocations, oldIndex, newIndex);
    // Apply optimistic reorder immediately so there's no flash
    setLocationOrderOverride(reordered.map(l => l.id));
    try {
      await reorderTripPlaces(
        reordered.map((p, i) => ({ id: p.id, sortOrder: i + 1 })),
      );
      await reloadTripPlaces();
    } catch {
      setLocationOrderOverride(null);
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  }, [researchLocations, reloadTripPlaces, t, toast]);

  // Delete a research location
  const handleDeleteResearchLocation = useCallback(async (locId: string) => {
    try {
      // Revert POIs in this place's holding day back to 'suggested'
      const holdingDay = itineraryDays.find(d => d.tripPlaceId === locId);
      const poiIds = (holdingDay?.activities || []).filter(a => a.type === 'poi').map(a => a.id);
      let revertedCount = 0;
      for (const poiId of poiIds) {
        const poi = pois.find(p => p.id === poiId);
        if (poi && (poi.status === 'interested' || poi.status === 'planned')) {
          await updatePOI({ ...poi, status: 'suggested' });
          revertedCount++;
        }
      }

      await deleteTripPlace(locId);  // deletes holding days + the trip_place record
      await reloadTripPlaces();
      await refetchItinerary();
      if (mobileDetailLocId === locId) setMobileDetailLocId(null);
      if (selectedResearchLocId === locId) {
        const remaining = researchLocations.filter(l => l.id !== locId);
        setSelectedResearchLocId(remaining.length > 0 ? remaining[0].id : null);
      }
      if (revertedCount > 0) {
        toast({ title: t('timeline.poisReverted', { count: revertedCount }) });
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  }, [selectedResearchLocId, mobileDetailLocId, researchLocations, itineraryDays, pois, updatePOI, reloadTripPlaces, refetchItinerary, t, toast]);

  // Notes for the selected research location
  const selectedResearchLocation = useMemo(() =>
    researchLocations.find(l => l.id === selectedResearchLocId),
    [researchLocations, selectedResearchLocId],
  );
  const notesSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [localNotes, setLocalNotes] = useState('');
  // Sync local notes when selected location changes
  useEffect(() => {
    setLocalNotes(selectedResearchLocation?.notes || '');
  }, [selectedResearchLocation?.id, selectedResearchLocation?.notes]);

  const handleNotesChange = useCallback((value: string) => {
    setLocalNotes(value);
    if (notesSaveTimerRef.current) clearTimeout(notesSaveTimerRef.current);
    notesSaveTimerRef.current = setTimeout(async () => {
      if (!selectedResearchLocId) return;
      try {
        await updateTripPlace(selectedResearchLocId, { notes: value });
      } catch { /* silent — notes are saved optimistically */ }
    }, 800);
  }, [selectedResearchLocId]);

  // Active detail location (desktop or mobile)
  const activeDetailLocId = selectedResearchLocId || mobileDetailLocId;
  const activeDetailLoc = useMemo(() =>
    activeDetailLocId ? researchLocations.find(l => l.id === activeDetailLocId) : undefined,
    [researchLocations, activeDetailLocId],
  );
  const locationImageUrl = activeDetailLoc?.imageUrl || null;

  // Resolve the geo hierarchy node for the active trip_place
  const activeDetailTripLoc = useMemo(() =>
    activeDetailLoc ? tripLocations.find(l => l.id === activeDetailLoc.tripLocationId) : undefined,
    [activeDetailLoc, tripLocations],
  );

  // Geocode selected research location for map + fetch boundary + image
  const selectedLocName = activeDetailTripLoc?.name;
  const selectedTripLocation = activeDetailTripLoc;
  const isCity = selectedTripLocation?.siteType === 'city' || selectedTripLocation?.siteType === 'town' || selectedTripLocation?.siteType === 'village';

  const [locationCoords, setLocationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationBoundary, setLocationBoundary] = useState<GeoJSON.GeoJsonObject | null>(null);

  // Find the country of the selected location (for geocoding disambiguation)
  const selectedLocCountry = useMemo(() => {
    if (!activeDetailTripLoc) return activeTrip?.countries?.[0];
    // Walk up the hierarchy to find the country ancestor
    let current = activeDetailTripLoc;
    while (current.parentId) {
      const parent = tripLocations.find(tl => tl.id === current.parentId);
      if (!parent) break;
      current = parent;
    }
    return current.siteType === 'country' ? current.name : activeTrip?.countries?.[0];
  }, [activeDetailTripLoc, tripLocations, activeTrip?.countries]);

  // Geocode + boundary
  useEffect(() => {
    setLocationCoords(null);
    setLocationBoundary(null);
    if (!selectedLocName) return;
    let cancelled = false;
    const countryCtx = selectedLocCountry ? ` ${selectedLocCountry}` : '';
    // Try full name first, then first part before & , - as fallback
    const tryGeocode = async (name: string) => {
      // Try with country context first for disambiguation
      if (countryCtx) {
        const geo = await geocodeLocation(name + countryCtx);
        if (geo) return geo;
      }
      const geo = await geocodeLocation(name);
      if (geo) return geo;
      const shortName = name.split(/\s*[&,\-–]\s*/)[0].trim();
      if (shortName && shortName !== name) {
        if (countryCtx) {
          const geo2 = await geocodeLocation(shortName + countryCtx);
          if (geo2) return geo2;
        }
        return geocodeLocation(shortName);
      }
      return null;
    };
    tryGeocode(selectedLocName).then(geo => {
      if (!cancelled && geo) setLocationCoords({ lat: geo.latitude, lng: geo.longitude });
    });
    // Fetch boundary polygon — use country context for Nominatim disambiguation
    const nominatimQuery = selectedLocName.split(/\s*[&,\-–]\s*/)[0].trim() || selectedLocName;
    const nominatimFull = nominatimQuery + countryCtx;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(nominatimFull)}&format=json&polygon_geojson=1&limit=1`, {
      headers: { 'Accept': 'application/json' },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && data?.[0]?.geojson) {
          const geo = data[0].geojson;
          if (geo.type === 'Polygon' || geo.type === 'MultiPolygon') {
            setLocationBoundary(geo);
          }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedLocName, selectedLocCountry]);

  // Add a POI to the selected research place
  const handleAddResearchPoi = useCallback(async (poiId: string) => {
    if (!activeTrip || !selectedResearchLocId) return;
    try {
      const holdingDay = itineraryDays.find(d => d.tripPlaceId === selectedResearchLocId);
      if (!holdingDay) return;

      const existing = holdingDay.activities || [];
      if (existing.some(a => a.id === poiId)) return;

      await updateItineraryDay(holdingDay.id, {
        activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: poiId, schedule_state: 'potential' as const }],
      });

      // Update POI status if needed
      const poi = pois.find(p => p.id === poiId);
      if (poi && (poi.status === 'suggested' || poi.status === 'interested')) {
        await updatePOI({ ...poi, status: 'planned' });
      }

      await refetchItinerary();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  }, [activeTrip, selectedResearchLocId, itineraryDays, pois, updatePOI, refetchItinerary, t, toast]);

  // Remove a POI from the selected research location
  const handleRemoveResearchPoi = useCallback(async (poiId: string) => {
    if (!selectedResearchDay) return;
    try {
      const updated = (selectedResearchDay.activities || []).filter(a => a.id !== poiId);
      await updateItineraryDay(selectedResearchDay.id, { activities: updated });
      await refetchItinerary();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  }, [selectedResearchDay, refetchItinerary, t, toast]);

  // Open AI chat with a recommendation request for a location
  const handleRecommendAttractions = useCallback((locationName: string) => {
    window.dispatchEvent(new CustomEvent('research-recommend', { detail: { locationName } }));
  }, []);

  // Toggle a day assignment to the currently selected trip_place (by-places view with days)
  const handleToggleDayForLocation = useCallback(async (dayNum: number, tripPlaceId: string) => {
    if (!activeTrip) return;
    const itDay = itineraryDays.find(d => d.dayNumber === dayNum);
    try {
      if (!itDay) {
        // Day record doesn't exist yet — create it and assign
        await createItineraryDay({ tripId: activeTrip.id, dayNumber: dayNum, tripPlaceId, accommodationOptions: [], activities: [], transportationSegments: [] });
        await refetchItinerary();
      } else if (itDay.tripPlaceId === tripPlaceId) {
        // Already assigned — unassign
        await updateItineraryDay(itDay.id, { tripPlaceId: undefined });
        setItineraryDays(prev => prev.map(d => d.id === itDay.id ? { ...d, tripPlaceId: undefined } : d));
      } else {
        // Assign to this place
        await updateItineraryDay(itDay.id, { tripPlaceId });
        setItineraryDays(prev => prev.map(d => d.id === itDay.id ? { ...d, tripPlaceId } : d));
      }
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  }, [activeTrip, itineraryDays, setItineraryDays, refetchItinerary, t, toast]);

  // Handle day double-click → set date and switch to detailed_planning
  const handleDayDoubleClick = (dayNum: number) => {
    if (!activeTrip || activeTrip.status !== 'planning') return;
    setDateDayNum(dayNum);
    setDatePickerValue('');
    setDatePickerSubmitting(false);
  };

  const handleDatePickerConfirm = async () => {
    if (!activeTrip || dateDayNum === null || !datePickerValue) return;
    setDatePickerSubmitting(true);
    try {
      // Calculate startDate: if the user picked a date for dayNum N,
      // then startDate = pickedDate - (N - 1) days
      const pickedDate = parseISO(datePickerValue);
      const startDate = format(subDays(pickedDate, dateDayNum - 1), 'yyyy-MM-dd');
      const updates = await transitionToDetailedPlanning(activeTrip, startDate);
      updateTripInList({ id: activeTrip.id, ...updates } as typeof activeTrip & { id: string });
      setDateDayNum(null);
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setDatePickerSubmitting(false);
    }
  };

  const tripDays = useTripDays();
  const { weatherByDate } = useTripWeather(activeTrip ?? undefined, itineraryDays);

  // Build lookup: trip_place_id → location name
  const itinLocNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const tp of tripPlaces) {
      const loc = tripLocations.find(l => l.id === tp.tripLocationId);
      if (loc) map.set(tp.id, loc.name);
    }
    return map;
  }, [tripPlaces, tripLocations]);

  const locationSpans = useMemo(() => {
    if (tripDays.length === 0) return [];
    const spans: { location: string; startIdx: number; endIdx: number }[] = [];
    for (let i = 0; i < tripDays.length; i++) {
      const itDay = itineraryDays.find(d => d.dayNumber === i + 1);
      const loc = (itDay?.tripPlaceId && itinLocNameMap.get(itDay.tripPlaceId)) || '';
      if (loc && spans.length > 0 && spans[spans.length - 1].location === loc && spans[spans.length - 1].endIdx === i - 1) {
        spans[spans.length - 1].endIdx = i;
      } else if (loc) {
        spans.push({ location: loc, startIdx: i, endIdx: i });
      }
    }
    return spans;
  }, [tripDays, itineraryDays, itinLocNameMap]);

  // Build flex items for sortable location strip (spans + gap spacers)
  const locationStripItems = useMemo(() => {
    if (tripDays.length === 0 || locationSpans.length === 0) return [];
    const items: Array<
      | { type: 'span'; id: string; location: string; dayCount: number; spanIndex: number }
      | { type: 'gap'; id: string; dayCount: number }
    > = [];
    let lastEndIdx = -1;
    for (let i = 0; i < locationSpans.length; i++) {
      const span = locationSpans[i];
      if (span.startIdx > lastEndIdx + 1) {
        items.push({ type: 'gap', id: `loc-gap-${lastEndIdx + 1}`, dayCount: span.startIdx - lastEndIdx - 1 });
      }
      items.push({
        type: 'span', id: `loc-span-${i}`,
        location: span.location,
        dayCount: span.endIdx - span.startIdx + 1,
        spanIndex: i,
      });
      lastEndIdx = span.endIdx;
    }
    if (lastEndIdx < tripDays.length - 1) {
      items.push({ type: 'gap', id: `loc-gap-${lastEndIdx + 1}`, dayCount: tripDays.length - 1 - lastEndIdx });
    }
    return items;
  }, [locationSpans, tripDays.length]);

  const sortableSpanIds = useMemo(
    () => locationStripItems.filter(it => it.type === 'span').map(it => it.id),
    [locationStripItems],
  );

  // Reorder location spans: renumber itinerary days so dragged location's days move together
  const handleLocationSpanReorder = useCallback(async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeSpanIdx = parseInt(String(active.id).replace('loc-span-', ''));
    const overSpanIdx = parseInt(String(over.id).replace('loc-span-', ''));
    if (isNaN(activeSpanIdx) || isNaN(overSpanIdx)) return;

    const reorderedSpans = arrayMove([...locationSpans], activeSpanIdx, overSpanIdx);

    // Compute new day numbers for each span's days
    const allUpdates: { id: string; dayNumber: number }[] = [];
    let newDayNum = 1;
    for (const span of reorderedSpans) {
      for (let origDayNum = span.startIdx + 1; origDayNum <= span.endIdx + 1; origDayNum++) {
        const itDay = itineraryDays.find(d => d.dayNumber === origDayNum);
        if (itDay) {
          allUpdates.push({ id: itDay.id, dayNumber: newDayNum });
        }
        newDayNum++;
      }
    }

    // Orphan days (not in any span) go to the end
    const usedIds = new Set(allUpdates.map(u => u.id));
    const orphans = itineraryDays
      .filter(d => !usedIds.has(d.id) && d.dayNumber >= 1 && d.dayNumber <= tripDays.length)
      .sort((a, b) => a.dayNumber - b.dayNumber);
    for (const day of orphans) {
      allUpdates.push({ id: day.id, dayNumber: newDayNum });
      newDayNum++;
    }

    // Only persist where dayNumber actually changed
    const changedUpdates = allUpdates.filter(u => {
      const orig = itineraryDays.find(d => d.id === u.id);
      return orig && orig.dayNumber !== u.dayNumber;
    });
    if (changedUpdates.length === 0) return;

    // Optimistic update
    const updateMap = new Map(allUpdates.map(u => [u.id, u.dayNumber]));
    setItineraryDays(itineraryDays.map(d => {
      const num = updateMap.get(d.id);
      return num !== undefined ? { ...d, dayNumber: num } : d;
    }));

    // Follow selected day to its new position
    const selectedItDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (selectedItDay) {
      const newNum = updateMap.get(selectedItDay.id);
      if (newNum !== undefined) setSelectedDayNum(newNum);
    }

    try {
      // Phase 1: temp numbers to avoid unique constraint (trip_id, day_number)
      await Promise.all(changedUpdates.map(u =>
        updateItineraryDay(u.id, { dayNumber: u.dayNumber + 10000 }),
      ));
      // Phase 2: final numbers
      await Promise.all(changedUpdates.map(u =>
        updateItineraryDay(u.id, { dayNumber: u.dayNumber }),
      ));
      await refetchItinerary();
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
      await refetchItinerary();
    }
  }, [locationSpans, itineraryDays, tripDays.length, selectedDayNum, setItineraryDays, refetchItinerary, t, toast]);

  const [potential, setPotential] = useState<Item[]>([]);
  const [scheduled, setScheduled] = useState<Item[]>([]);
  const [lockedIds, setLockedIds] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragItem, setActiveDragItem] = useState<Item | null>(null);
  const [activeDragGroupCount, setActiveDragGroupCount] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [resetKey, setResetKey] = useState(0);

  // ── Location editing (mirrors Index.tsx) ────────────────────────────────────
  const [locationContext, setLocationContext] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationTotalDays, setLocationTotalDays] = useState(1);

  const locationDayWidth = typeof window !== 'undefined' ? (window.innerWidth < 640 ? 64 : 80) : 72;
  const selectedIdx = selectedDayNum - 1;
  const selectedSpan = locationSpans.find(s => s.startIdx <= selectedIdx && s.endIdx >= selectedIdx);

  const refreshDays = useCallback(async () => {
    await refetchItinerary();
  }, [refetchItinerary]);

  const handleAddTransport = useCallback(async (poiId: string) => {
    const poi = pois.find(p => p.id === poiId);
    const fromName = poi?.name || '';
    // Find the next POI after this one in the scheduled list
    const idx = scheduled.findIndex(i => i.id === poiId);
    let toName = '';
    for (let i = idx + 1; i < scheduled.length; i++) {
      if (scheduled[i].poi) {
        toName = scheduled[i].poi!.name || '';
        break;
      }
    }
    setTransportFromName(fromName);
    setTransportToName(toName);

    // Pre-create the order gap now (before the dialog opens) so the new transport
    // lands between the source POI and the next one after refreshDays().
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (itDay) {
      const sourceAct = itDay.activities.find(a => a.id === poiId);
      if (sourceAct) {
        const updatedActivities = itDay.activities.map(a =>
          a.order > sourceAct.order ? { ...a, order: a.order + 1 } : a,
        );
        // Update in-memory immediately so the closure in handleTransportCreated sees it
        setItineraryDays(itineraryDays.map(d =>
          d.id === itDay.id ? { ...d, activities: updatedActivities } : d,
        ));
        // Persist to DB (fire-and-forget — will be in DB well before form is submitted)
        updateItineraryDay(itDay.id, { activities: updatedActivities }).catch(console.error);
      }
    }

    setAddTransportOpen(true);
  }, [pois, itineraryDays, selectedDayNum, scheduled, setItineraryDays]);

  const handleTransportCreated = useCallback(async (transportId: string) => {
    let itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay && activeTrip) {
      itDay = await createItineraryDay({
        tripId: activeTrip.id,
        dayNumber: selectedDayNum,
        date: tripDays[selectedDayNum - 1]?.dateStr,

        accommodationOptions: [],
        activities: [],
        transportationSegments: [],
      });
    }
    if (!itDay) return;
    const newSegments = [...(itDay.transportationSegments || []), { is_selected: true, transportation_id: transportId }];
    await updateItineraryDay(itDay.id, { transportationSegments: newSegments });
    await refreshDays();
  }, [selectedDayNum, tripDays, itineraryDays, activeTrip, refreshDays]);

  const handleDeleteTransport = useCallback(async (transportId: string) => {
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) return;
    // Remove from itinerary day segments
    const newSegments = (itDay.transportationSegments || []).filter(
      ts => ts.transportation_id !== transportId,
    );
    await updateItineraryDay(itDay.id, { transportationSegments: newSegments });
    // Delete the transportation record itself
    await deleteTransportation(transportId);
    await refreshDays();
  }, [itineraryDays, selectedDayNum, deleteTransportation, refreshDays]);

  const handleEditTransport = useCallback((transportId: string) => {
    setEditTransportId(transportId);
  }, []);

  // Resolve effective time for an activity (used for chronological reordering)
  const resolveActivityTime = useCallback((itDay: ItineraryDay, act: ItineraryActivity): string | undefined => {
    if (act.time_window?.start) return act.time_window.start;
    if (act.type === 'poi') {
      const poi = pois.find(p => p.id === act.id);
      const dayDate = itDay.date;
      const booking = dayDate
        ? poi?.details?.bookings?.find(b => b.reservation_date === dayDate)
        : poi?.details?.bookings?.[0];
      return booking?.reservation_hour;
    }
    return undefined;
  }, [pois]);

  const handleAddTimeBlock = useCallback(async () => {
    if (!newTbLabel.trim()) return;
    let itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay && activeTrip) {
      itDay = await createItineraryDay({
        tripId: activeTrip.id,
        dayNumber: selectedDayNum,
        date: tripDays[selectedDayNum - 1]?.dateStr,

        accommodationOptions: [],
        activities: [],
        transportationSegments: [],
      });
    }
    if (!itDay) return;
    const maxOrder = itDay.activities.reduce((m, a) => Math.max(m, a.order), 0);
    const newActivity = {
      order: maxOrder + 1,
      type: 'time_block' as const,
      id: crypto.randomUUID(),
      label: newTbLabel.trim(),
      ...(newTbTime ? { time_window: { start: newTbTime } } : {}),
    };
    let updatedActivities = [...itDay.activities, newActivity];
    // If the new time block has a time, reorder chronologically
    if (newTbTime) {
      const day = itDay;
      updatedActivities = reorderActivitiesChronologically(updatedActivities, a => resolveActivityTime(day, a));
    }
    setItineraryDays(itineraryDays.map(d => d.id === itDay!.id ? { ...d, activities: updatedActivities } : d));
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
    setNewTbLabel('');
    setNewTbTime('');
    setAddingTimeBlock(false);
    await refreshDays();
  }, [newTbLabel, newTbTime, selectedDayNum, tripDays, itineraryDays, activeTrip, setItineraryDays, refreshDays, resolveActivityTime]);

  const handleUpdateTimeBlock = useCallback(async (itemId: string, label: string, time: string | undefined) => {
    const activityId = itemId.replace('tblock_', '');
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) return;
    let updatedActivities = itDay.activities.map(a =>
      a.id === activityId
        ? { ...a, label, time_window: time ? { start: time } : undefined }
        : a,
    );
    // If time was set/changed, reorder chronologically
    if (time) {
      updatedActivities = reorderActivitiesChronologically(updatedActivities, a => resolveActivityTime(itDay, a));
    }
    setItineraryDays(itineraryDays.map(d => d.id === itDay.id ? { ...d, activities: updatedActivities } : d));
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
    await refreshDays();
  }, [selectedDayNum, itineraryDays, setItineraryDays, refreshDays, resolveActivityTime]);

  const handleDeleteTimeBlock = useCallback(async (itemId: string) => {
    const activityId = itemId.replace('tblock_', '');
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) return;
    const updatedActivities = itDay.activities.filter(a => a.id !== activityId);
    setItineraryDays(itineraryDays.map(d => d.id === itDay.id ? { ...d, activities: updatedActivities } : d));
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
    await refreshDays();
  }, [selectedDayNum, itineraryDays, setItineraryDays, refreshDays]);

  // Rename an auto-generated group → converts it into a time_block-headed group
  const handleRenameAutoGroup = useCallback(async (firstContentItemId: string | undefined, label: string, time: string | undefined) => {
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) return;

    // Place the new time_block just before the first content item of this group
    let insertOrder: number;
    if (firstContentItemId) {
      const rawId = firstContentItemId.startsWith('tblock_') ? firstContentItemId.replace('tblock_', '') : firstContentItemId;
      const firstAct = itDay.activities.find(a => a.id === rawId);
      insertOrder = firstAct ? firstAct.order - 0.5 : 0;
    } else {
      insertOrder = itDay.activities.reduce((m, a) => Math.max(m, a.order), 0) + 1;
    }

    const newActivity = {
      order: insertOrder,
      type: 'time_block' as const,
      id: crypto.randomUUID(),
      label,
      ...(time ? { time_window: { start: time } } : {}),
    };

    let updatedActivities = [...itDay.activities, newActivity];
    // If time was set, reorder chronologically
    if (time) {
      updatedActivities = reorderActivitiesChronologically(updatedActivities, a => resolveActivityTime(itDay, a));
    }
    setItineraryDays(itineraryDays.map(d => d.id === itDay!.id ? { ...d, activities: updatedActivities } : d));
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
    await refreshDays();
  }, [selectedDayNum, itineraryDays, setItineraryDays, refreshDays, resolveActivityTime]);

  const updateLocationContext = useCallback(async () => {
    if (!activeTrip) return;

    // Resolve location name → trip_place ID (find or create)
    let tripPlaceId: string | undefined;
    if (locationContext) {
      const tripLoc = findInFlatList(tripLocations, locationContext);
      if (tripLoc) {
        let tripPlace = findTripPlaceByLocationId(tripPlaces, tripLoc.id);
        if (!tripPlace) {
          tripPlace = await createTripPlace(activeTrip.id, tripLoc.id, { sortOrder: tripPlaces.length });
          await reloadTripPlaces();
        }
        tripPlaceId = tripPlace.id;
      }
    }

    // Determine how many days the current span covers for this location
    const currentSpanDays = selectedSpan ? (selectedSpan.endIdx - selectedSpan.startIdx + 1) : 0;
    const daysToInsert = locationTotalDays - currentSpanDays;

    if (daysToInsert > 0 && activeTrip.status !== 'research') {
      const insertAfterDayNum = selectedSpan
        ? selectedSpan.endIdx + 1
        : selectedDayNum;

      // Shift existing days that come after the insert point
      const daysToShift = itineraryDays
        .filter(d => d.dayNumber > insertAfterDayNum)
        .sort((a, b) => b.dayNumber - a.dayNumber);
      for (const day of daysToShift) {
        await updateItineraryDay(day.id, { dayNumber: day.dayNumber + daysToInsert });
      }

      // Create the new days
      for (let i = 0; i < daysToInsert; i++) {
        const newDayNum = insertAfterDayNum + 1 + i;
        await createItineraryDay({
          tripId: activeTrip.id,
          dayNumber: newDayNum,
          tripPlaceId,
          accommodationOptions: [],
          activities: [],
          transportationSegments: [],
        });
      }

      // Update trip numberOfDays
      const newTotal = (activeTrip.numberOfDays || tripDays.length) + daysToInsert;
      await updateCurrentTrip({ numberOfDays: newTotal });
    }

    // Set location on existing span days
    const spanStart = selectedSpan ? selectedSpan.startIdx + 1 : selectedDayNum;
    const spanEnd = selectedSpan ? selectedSpan.endIdx + 1 : selectedDayNum;
    for (let dayNum = spanStart; dayNum <= spanEnd; dayNum++) {
      let targetDay = itineraryDays.find(d => d.dayNumber === dayNum);
      if (!targetDay) {
        targetDay = await createItineraryDay({
          tripId: activeTrip.id,
          dayNumber: dayNum,
          date: tripDays[dayNum - 1]?.dateStr,
          accommodationOptions: [],
          activities: [],
          transportationSegments: [],
        });
      }
      if (targetDay) {
        await updateItineraryDay(targetDay.id, { tripPlaceId: tripPlaceId ?? null });
      }
    }

    setEditingLocation(false);
    setLocationTotalDays(1);
    await refreshDays();
  }, [locationContext, locationTotalDays, selectedDayNum, selectedSpan, tripDays, itineraryDays, activeTrip, tripLocations, tripPlaces, reloadTripPlaces, refreshDays, updateCurrentTrip]);

  // ── Ensure itinerary day exists ─────────────────────────────────────────────
  const ensureItDay = useCallback(async () => {
    const existing = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (existing) return existing;
    if (!activeTrip) return null;
    return await createItineraryDay({
      tripId: activeTrip.id,
      dayNumber: selectedDayNum,
      date: tripDays[selectedDayNum - 1]?.dateStr,
      locationContext: '',
      accommodationOptions: [],
      activities: [],
      transportationSegments: [],
    });
  }, [itineraryDays, selectedDayNum, activeTrip, tripDays]);

  // ── Accommodation (mirrors Index.tsx) ───────────────────────────────────────
  const currentItDay = useMemo(
    () => itineraryDays.find(d => d.dayNumber === selectedDayNum) ?? null,
    [itineraryDays, selectedDayNum],
  );

  // ── Holidays for current day ────────────────────────────────────────────────
  const dayHolidays = useMemo(() => {
    const currentDay = tripDays[selectedDayNum - 1];
    if (!currentDay?.dateStr) return [];
    return pois.filter(p =>
      p.category === 'event' &&
      p.details?.event_details?.date === currentDay.dateStr
    );
  }, [pois, tripDays, selectedDayNum]);

  const dayAccommodations = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.accommodationOptions
      .map(opt => ({ ...opt, poi: pois.find(p => p.id === opt.poi_id) }))
      .filter((opt): opt is typeof opt & { poi: NonNullable<typeof opt.poi> } => !!opt.poi);
  }, [currentItDay, pois]);

  const prevDayAccommodations = useMemo(() => {
    if (selectedDayNum <= 1) return [];
    const prevItDay = itineraryDays.find(d => d.dayNumber === selectedDayNum - 1);
    if (!prevItDay) return [];
    return prevItDay.accommodationOptions
      .map(opt => ({ ...opt, poi: pois.find(p => p.id === opt.poi_id) }))
      .filter((opt): opt is typeof opt & { poi: NonNullable<typeof opt.poi> } => !!opt.poi);
  }, [itineraryDays, pois, selectedDayNum]);

  const morningAccom = prevDayAccommodations.find(a => a.is_selected) ?? prevDayAccommodations[0];
  const eveningAccom = dayAccommodations.find(a => a.is_selected) ?? dayAccommodations[0];

  // ── Route calculation ───────────────────────────────────────────────────────

  // Helper: extract coords from a POI if present
  const accomCoords = (poi: PointOfInterest | undefined) =>
    poi?.location?.coordinates?.lat != null && poi?.location?.coordinates?.lng != null
      ? { lat: poi.location.coordinates.lat, lng: poi.location.coordinates.lng }
      : null;

  const morningCoords = accomCoords(morningAccom?.poi);
  const eveningCoords = accomCoords(eveningAccom?.poi);

  const routeStops = useMemo(() => {
    const activityStops = scheduled
      .filter(item => item.poi?.location?.coordinates?.lat != null && item.poi?.location?.coordinates?.lng != null)
      .map(item => ({
        id: item.id,
        lat: item.poi!.location.coordinates!.lat,
        lng: item.poi!.location.coordinates!.lng,
        durationMin: item.poi!.details?.activity_details?.duration ?? 60,
      }));

    const stops = [...activityStops];

    // Prepend morning accommodation as start point
    if (morningCoords && morningAccom) {
      stops.unshift({ id: `accom-morning-${morningAccom.poi.id}`, lat: morningCoords.lat, lng: morningCoords.lng, durationMin: 0 });
    }
    // Append evening accommodation as end point
    if (eveningCoords && eveningAccom) {
      stops.push({ id: `accom-evening-${eveningAccom.poi.id}`, lat: eveningCoords.lat, lng: eveningCoords.lng, durationMin: 0 });
    }

    return stops;
  }, [scheduled, morningCoords, morningAccom, eveningCoords, eveningAccom]);

  const stopNames = useMemo(() => {
    const map: Record<string, string> = {};
    scheduled.forEach(item => {
      if (item.poi?.location?.coordinates?.lat != null) {
        map[item.id] = item.poi.name;
      }
    });
    if (morningAccom) map[`accom-morning-${morningAccom.poi.id}`] = morningAccom.poi.name;
    if (eveningAccom) map[`accom-evening-${eveningAccom.poi.id}`] = eveningAccom.poi.name;
    return map;
  }, [scheduled, morningAccom, eveningAccom]);

  // Build leg overrides from transport items between consecutive POI stops.
  // Also track transport item ID → fromStopId so we can display OSRM-calculated durations.
  const { legOverrides, transportToFromStop } = useMemo(() => {
    const overrides = new Map<string, LegOverride>();
    const transMap = new Map<string, string>(); // transport item id → fromStop id

    // Indices of POI items in `scheduled` that have coordinates (i.e., appear in routeStops)
    const poiIndices: number[] = [];
    for (let i = 0; i < scheduled.length; i++) {
      const item = scheduled[i];
      if (item.poi?.location?.coordinates?.lat != null && item.poi?.location?.coordinates?.lng != null) {
        poiIndices.push(i);
      }
    }

    // For each pair of consecutive POI items, check for a transport item between them
    for (let p = 0; p < poiIndices.length - 1; p++) {
      const fromIdx = poiIndices[p];
      const toIdx = poiIndices[p + 1];
      const fromItem = scheduled[fromIdx];

      for (let i = fromIdx + 1; i < toIdx; i++) {
        const item = scheduled[i];
        if (!item.id.startsWith('trans_')) continue;

        // Find matching transport entity + segment
        for (const t of transportation) {
          for (const seg of t.segments) {
            if (`trans_${t.id}_${seg.segment_id ?? '0'}` !== item.id) continue;

            const config = TRANSPORT_CATEGORY_CONFIG[t.category] ?? { visualMode: 'other_transport' as const, osrmMode: null };
            const hasTimes = !!(seg.departure_time && seg.arrival_time);
            let durationMin: number | undefined;
            if (hasTimes) {
              const dep = parseISO(seg.departure_time);
              const arr = parseISO(seg.arrival_time);
              durationMin = (arr.getTime() - dep.getTime()) / 60000;
            }

            // If transport has known times → skip OSRM (use known duration).
            // If no times → use OSRM with the transport's routing mode.
            overrides.set(fromItem.id, {
              visualMode: config.visualMode,
              osrmMode: hasTimes ? null : config.osrmMode,
              durationMin,
              fromCoords: seg.from.coordinates,
              toCoords: seg.to.coordinates,
              label: `${transportEmoji(t.category)} ${seg.from.name} → ${seg.to.name}${seg.flight_or_vessel_number ? ` · ${seg.flight_or_vessel_number}` : ''}`,
            });
            transMap.set(item.id, fromItem.id);
            break;
          }
          if (overrides.has(fromItem.id)) break;
        }
        break; // use the first transport found between these two POIs
      }
    }

    return { legOverrides: overrides, transportToFromStop: transMap };
  }, [scheduled, transportation]);

  const { legs, stats: routeStats, isCalculating, isStale, error: routeError, calculate: calculateRoute, reset: resetRoute, setManualDuration } = useRouteCalculation(routeStops, legOverrides);

  const legMap = useMemo(() => new Map(legs.map(l => [l.fromStopId, l])), [legs]);

  // OSRM-calculated durations for transport items without known times
  const transportCalcDurations = useMemo(() => {
    const map = new Map<string, number>(); // transport item id → calculated duration min
    for (const [transItemId, fromStopId] of transportToFromStop) {
      const leg = legMap.get(fromStopId);
      if (leg && !leg.isUnknown && leg.durationMin > 0) {
        map.set(transItemId, leg.durationMin);
      }
    }
    return map;
  }, [transportToFromStop, legMap]);

  // All day POIs with coordinates (scheduled + potential + accommodations) — for map markers
  const dayPOIs = useMemo(() => {
    const scheduledSet = new Set(scheduled.map(i => i.id));
    const all = [...scheduled, ...potential];
    const pois = all
      .filter(item => item.poi?.location?.coordinates?.lat != null && item.poi?.location?.coordinates?.lng != null)
      .map(item => ({
        id: item.id,
        lat: item.poi!.location.coordinates!.lat,
        lng: item.poi!.location.coordinates!.lng,
        name: item.poi!.name,
        category: item.poi!.category,
        isScheduled: scheduledSet.has(item.id),
      }));

    // Add accommodations
    if (morningCoords && morningAccom) {
      pois.push({ id: `accom-morning-${morningAccom.poi.id}`, lat: morningCoords.lat, lng: morningCoords.lng, name: morningAccom.poi.name, category: 'accommodation', isScheduled: true });
    }
    if (eveningCoords && eveningAccom) {
      pois.push({ id: `accom-evening-${eveningAccom.poi.id}`, lat: eveningCoords.lat, lng: eveningCoords.lng, name: eveningAccom.poi.name, category: 'accommodation', isScheduled: true });
    }
    return pois;
  }, [scheduled, potential, morningCoords, morningAccom, eveningCoords, eveningAccom]);

  // Actual location of the current day — for DaySection suggestions (not the edit buffer)
  const currentDayLocation = (currentItDay?.tripPlaceId && itinLocNameMap.get(currentItDay.tripPlaceId)) || '';

  const availableAccom = pois.filter(
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
      let targetDay = itineraryDays.find(d => d.dayNumber === dayNum);
      if (!targetDay && activeTrip) {
        targetDay = await createItineraryDay({
          tripId: activeTrip.id,
          dayNumber: dayNum,
          date: tripDays[dayNum - 1]?.dateStr,
  
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
    const poi = pois.find(p => p.id === entityId);
    if (poi && (poi.status === 'suggested' || poi.status === 'interested')) {
      await updatePOI({ ...poi, status: 'planned' });
    }
    await refreshDays();
  }, [selectedDayNum, tripDays, itineraryDays, activeTrip, pois, updatePOI, refreshDays]);

  const removeAccommodation = useCallback(async (entityId: string) => {
    if (!currentItDay) return;
    await updateItineraryDay(currentItDay.id, {
      accommodationOptions: currentItDay.accommodationOptions.filter(o => o.poi_id !== entityId),
    });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const createNewAccommodation = useCallback(async (data: Record<string, string>, createBookingMission?: boolean) => {
    if (!activeTrip) return;
    const nights = parseInt(data._nights) || 1;
    const newPOI = await addPOI({
      tripId: activeTrip.id,
      category: 'accommodation',
      subCategory: data.subCategory || undefined,
      name: data.name,
      status: 'suggested',
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
          tripId: activeTrip.id,
          title: `Book: ${data.name}`,
          description: 'accommodation',
          status: 'pending',
          contextLinks: [],
          reminders: [],
          objectLink: newPOI.id,
        });
      }
    }
  }, [activeTrip, addPOI, addAccommodation, addMission]);

  // ── Activity add (mirrors Index.tsx) ────────────────────────────────────────
  const dayActivityIds = useMemo(
    () => new Set(currentItDay?.activities.filter(a => a.type === 'poi').map(a => a.id) ?? []),
    [currentItDay],
  );

  const availableActivities = pois.filter(
    p => p.category !== 'accommodation' && !p.isCancelled && !dayActivityIds.has(p.id),
  );

  const addActivity = useCallback(async (entityId: string) => {
    const itDay = await ensureItDay();
    if (!itDay) return;
    const existing = itDay.activities || [];
    if (existing.some(a => a.id === entityId)) return;
    await updateItineraryDay(itDay.id, {
      activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: entityId }],
    });
    if (activeTrip) await rebuildPOIBookingsFromDays(activeTrip.id, entityId);
    const poi = pois.find(p => p.id === entityId);
    if (poi && (poi.status === 'suggested' || poi.status === 'interested')) {
      await updatePOI({ ...poi, status: 'planned' });
    }
    await refreshDays();
  }, [ensureItDay, activeTrip, pois, updatePOI, refreshDays]);

  const removeActivity = useCallback(async (entityId: string) => {
    if (!currentItDay) return;
    await updateItineraryDay(currentItDay.id, {
      activities: currentItDay.activities.filter(a => a.id !== entityId),
    });
    const poi = pois.find(p => p.id === entityId);
    if (poi && poi.status === 'planned') {
      await updatePOI({ ...poi, status: 'suggested' });
    }
    await refreshDays();
  }, [currentItDay, pois, updatePOI, refreshDays]);

  const createNewActivity = useCallback(async (data: Record<string, string>, createBookingMission?: boolean) => {
    if (!activeTrip) return;
    const newPOI = await addPOI({
      tripId: activeTrip.id,
      category: (data.category as any) || 'attraction',
      subCategory: data.subCategory || undefined,
      name: data.name,
      status: 'suggested',
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
          tripId: activeTrip.id,
          title: `Book: ${data.name}`,
          description: data.category,
          status: 'pending',
          contextLinks: [],
          reminders: [],
          objectLink: newPOI.id,
        });
      }
    }
  }, [activeTrip, addPOI, addActivity, addMission]);

  // ── Load real data for selected day ─────────────────────────────────────────
  // potential  = activities with schedule_state !== 'scheduled'
  // scheduled  = activities with schedule_state === 'scheduled'  (in DB array order)
  // lockedIds  = scheduled activities that have a time_window.start (timed anchor)
  useEffect(() => {
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) { setPotential([]); setScheduled([]); setLockedIds(new Set()); return; }

    const newPotential: Item[] = [];
    const newScheduled: Item[] = [];
    const newLocked = new Set<string>();

    // ── POI activities ────────────────────────────────────────────────────────
    const seenPoiIds = new Set<string>();
    itDay.activities
      .filter(a => a.type === 'poi')
      .forEach(a => {
        if (seenPoiIds.has(a.id)) return;
        seenPoiIds.add(a.id);
        const poi = pois.find(p => p.id === a.id);
        if (!poi) return;
        // time: prefer itinerary time_window, fallback to POI booking hour
        const dayDate = itDay.date;
        const matchingBooking = dayDate
          ? poi.details?.bookings?.find(b => b.reservation_date === dayDate)
          : undefined;
        const bookingHour = matchingBooking?.reservation_hour ?? poi.details?.bookings?.[0]?.reservation_hour;
        const time = a.time_window?.start ?? bookingHour ?? undefined;
        const item: Item = {
          id: a.id,
          label: poi.name,
          emoji: getSubCategoryEntry(poi.subCategory)?.icon || categoryEmoji(poi.category),
          time,
          sublabel: [poi.subCategory ? getSubCategoryLabel(poi.subCategory) : '', poi.location?.city].filter(Boolean).join(' · '),
          remark: poi.details?.notes?.user_summary,
          poi,
        };
        const isScheduled = a.schedule_state === 'scheduled' || !!time;
        if (isScheduled) {
          newScheduled.push(item);
          if (time) newLocked.add(a.id);
        } else {
          newPotential.push(item);
        }
      });

    // ── Time blocks (named section headers) ─────────────────────────────────
    itDay.activities.filter(a => a.type === 'time_block').forEach(a => {
      const itemId = `tblock_${a.id}`;
      const item: Item = {
        id: itemId,
        label: a.label || 'Time window',
        emoji: '⏰',
        time: a.time_window?.start,
        isTimeBlock: true,
      };
      newScheduled.push(item);
      // NOT added to lockedIds — time blocks live in unlocked groups as section headers
    });

    // ── Transport segments ────────────────────────────────────────────────────
    // Each selected transport segment appears as a locked item on the day its
    // departure_time falls on. segment_id in the day record narrows to one
    // specific leg; if absent we include all segments of that transportation.
    itDay.transportationSegments.forEach(ts => {
      if (!ts.is_selected) return;
      const transport = transportation.find(t => t.id === ts.transportation_id);
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
          remark: transport.booking ? 'Pre-booked' : undefined,
        };
        newScheduled.push(item);
        if (timeLabel) newLocked.add(itemId); // lock only if has a departure time
      });
    });

    // Build final scheduled list by interleaving transport into POI order gaps.
    // POIs are sorted by their saved `order` field (reflects user DnD arrangement).
    // Transport segments are sorted by time and inserted into the gaps between POIs
    // based on the gap between consecutive POI order values.
    const poiArr = newScheduled.filter(i => !i.id.startsWith('trans_'));
    const transArr = newScheduled.filter(i => i.id.startsWith('trans_'));

    // Sort POIs + time_blocks by saved order (unordered items go to end)
    const rawActivityId = (id: string) => id.startsWith('tblock_') ? id.replace('tblock_', '') : id;
    poiArr.sort((a, b) => {
      const oA = itDay.activities.find(act => act.id === rawActivityId(a.id))?.order ?? 9999;
      const oB = itDay.activities.find(act => act.id === rawActivityId(b.id))?.order ?? 9999;
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
      const poiOrder = itDay.activities.find(act => act.id === rawActivityId(poi.id))?.order ?? 9999;
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
  }, [selectedDayNum, itineraryDays, pois, transportation, resetKey]);

  const isScheduledDrag = activeId?.startsWith('sched-') ?? false;
  const isPotentialDrag = activeId !== null && !isScheduledDrag;
  const isAnyDragging = activeId !== null;

  // activeDragItem is captured in handleDragStart — immune to potential/scheduled array changes mid-drag
  const activeItem = activeDragItem;

  const addLog = (msg: string) => setLog(prev => [msg, ...prev].slice(0, 10));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 400, tolerance: 10 } }),
  );

  const locationPillSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 10 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 500, tolerance: 5 } }),
  );

  // Persist scheduled/potential arrays back to itineraryDay.activities + context
  const persistDayActivities = useCallback(async (newScheduled: Item[], newPotential: Item[]) => {
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) return;

    const updatedActivities: ItineraryActivity[] = [];

    // Scheduled POIs in order, using full index across all items (including transport).
    // This preserves the interleaved position so transport gaps survive a reload.
    newScheduled.forEach((item, idx) => {
      if (item.id.startsWith('trans_')) return; // transport lives in transportationSegments, skip
      if (item.id.startsWith('tblock_')) {
        // Time block — preserve all fields, just update order
        const activityId = item.id.replace('tblock_', '');
        const existing = itDay.activities.find(a => a.id === activityId);
        if (existing) updatedActivities.push({ ...existing, order: idx + 1 });
        return;
      }
      const existing = itDay.activities.find(a => a.id === item.id);
      updatedActivities.push({
        order: idx + 1, // full positional index including transport item slots
        type: 'poi',
        id: item.id,
        schedule_state: 'scheduled',
        ...(existing?.time_window ? { time_window: existing.time_window } : {}),
      });
    });

    // Potential POIs after scheduled (clear time_window so they stay potential on reload)
    const schedLen = updatedActivities.length;
    newPotential.forEach((item, idx) => {
      updatedActivities.push({
        order: schedLen + idx + 1,
        type: 'poi',
        id: item.id,
        schedule_state: 'potential',
      });
    });

    // Preserve any collection-type activities we didn't touch
    const handledIds = new Set(updatedActivities.map(a => a.id));
    itDay.activities
      .filter(a => !handledIds.has(a.id))
      .forEach(a => updatedActivities.push(a));

    // Update context in-memory so useEffect reloads correctly on day switch
    setItineraryDays(itineraryDays.map(d =>
      d.id === itDay.id ? { ...d, activities: updatedActivities } : d,
    ));

    // Persist to DB
    await updateItineraryDay(itDay.id, { activities: updatedActivities });

    // Sync bookings for any POIs whose presence or state changed on this day
    if (activeTrip) {
      const oldPOIs = new Map(itDay.activities.filter(a => a.type === 'poi').map(a => [a.id, a]));
      const newPOIs = new Map(updatedActivities.filter(a => a.type === 'poi').map(a => [a.id, a]));
      const changedIds = new Set<string>();
      for (const [id, a] of newPOIs) {
        const old = oldPOIs.get(id);
        if (!old || old.schedule_state !== a.schedule_state || old.time_window?.start !== a.time_window?.start) changedIds.add(id);
      }
      for (const id of oldPOIs.keys()) {
        if (!newPOIs.has(id)) changedIds.add(id);
      }
      await Promise.all([...changedIds].map(id => rebuildPOIBookingsFromDays(activeTrip.id, id)));
    }
  }, [selectedDayNum, itineraryDays, setItineraryDays, activeTrip]);

  // Delete an auto-generated group → merge its items into the adjacent unlocked group
  const handleDeleteAutoGroup = useCallback(async (contentItemIds: string[]) => {
    if (contentItemIds.length === 0) return;

    const itemIdSet = new Set(contentItemIds);
    const lastItemIdx = scheduled.findIndex(i => i.id === contentItemIds[contentItemIds.length - 1]);

    // The adjacent group must be the NEXT one (auto groups are always at the start of a section).
    // Find the next time_block after this group's items.
    let tblockIdx = -1;
    for (let i = lastItemIdx + 1; i < scheduled.length; i++) {
      if (lockedIds.has(scheduled[i].id)) break;
      if (scheduled[i].isTimeBlock) { tblockIdx = i; break; }
    }

    // If no time_block found forward, try merging backward (into previous group's tail)
    if (tblockIdx === -1) {
      const firstIdx = scheduled.findIndex(i => i.id === contentItemIds[0]);
      if (firstIdx > 0) {
        const withoutItems = scheduled.filter(i => !itemIdSet.has(i.id));
        setScheduled(withoutItems);
        persistDayActivities(withoutItems, potential);
        return;
      }
      return;
    }

    // Move items to after the time_block
    const items = contentItemIds.map(id => scheduled.find(i => i.id === id)!);
    const withoutItems = scheduled.filter(i => !itemIdSet.has(i.id));
    const newTblockIdx = withoutItems.findIndex(i => i.id === scheduled[tblockIdx].id);
    const newScheduled = [
      ...withoutItems.slice(0, newTblockIdx + 1),
      ...items,
      ...withoutItems.slice(newTblockIdx + 1),
    ];
    setScheduled(newScheduled);
    persistDayActivities(newScheduled, potential);
  }, [scheduled, potential, lockedIds, persistDayActivities]);

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
      // Prefer group-frame over individual items for potential-to-schedule drops
      const frameHit = hits.find(c => c.id.toString().startsWith('group-frame-'));
      if (frameHit) return [frameHit];
      if (hits.length > 0) return [hits[0]];
      return closestCenter(args);
    } else {
      const potentialHit = hits.find(c => c.id === 'potential-zone');
      if (potentialHit) return [potentialHit];
      // Prefer individual sched-* items (precise reorder) over group frames
      const ccHits = closestCenter(args);
      if (ccHits.length > 0 && ccHits[0].id.toString().startsWith('sched-')) return ccHits;
      // Fall back to group-frame drop when pointer is over empty space in a group
      const frameHit = hits.find(c => c.id.toString().startsWith('group-frame-'));
      if (frameHit) return [frameHit];
      return ccHits;
    }
  }, []);

  const handleDragStart = useCallback((e: DragStartEvent) => {
    const id = e.active.id as string;
    setActiveId(id);
    // Capture the dragged item immediately so the overlay survives potential/scheduled array changes
    const isSchedDrag = id.startsWith('sched-');
    const isGroupDrag = id.startsWith('group-drag-');
    let groupContentCount = 0;
    const item = isGroupDrag
      ? (() => {
          const currentGroups = buildGroups(scheduled, lockedIds);
          const groupId = id.replace('group-drag-', '');
          const group = currentGroups.find(g => g.id === groupId);
          groupContentCount = group ? group.items.filter(i => !i.isTimeBlock).length : 0;
          return group?.items.find(i => i.isTimeBlock) ?? null;
        })()
      : isSchedDrag
        ? scheduled.find(i => `sched-${i.id}` === id)
        : potential.find(i => i.id === id);
    setActiveDragItem(item ?? null);
    setActiveDragGroupCount(groupContentCount);
    setSelectedItemId(null);
    document.documentElement.style.overscrollBehaviorY = 'none';
    addLog(`🟡 start: "${id}"`);
  }, [potential, scheduled, lockedIds]);

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    setActiveId(null);
    setActiveDragGroupCount(0);
    setActiveDragItem(null);
    document.documentElement.style.overscrollBehaviorY = '';

    if (!over) { addLog(`🔴 end: no target`); return; }

    const activeIdStr = active.id.toString();
    const overId = over.id.toString();
    addLog(`🟢 end: "${activeIdStr}" → "${overId}"`);

    // ── Day drop ──────────────────────────────────────────────────────────────
    if (overId.startsWith('day-drop-')) {
      const targetDayNum = parseInt(overId.replace('day-drop-', ''), 10);
      if (targetDayNum === selectedDayNum) return;

      // ── Group drag to another day ──────────────────────────────────────────
      if (activeIdStr.startsWith('group-drag-')) {
        const groupId = activeIdStr.replace('group-drag-', '');
        const currentGroups = buildGroups(scheduled, lockedIds);
        const draggedGroup = currentGroups.find(g => g.id === groupId);
        if (!draggedGroup) return;

        const sourceDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
        const targetDay = itineraryDays.find(d => d.dayNumber === targetDayNum);
        if (!sourceDay || !targetDay) { addLog(`  ❌ Day not found`); return; }

        // Collect all activity IDs in the group (time block uses raw ID, POIs use item ID directly)
        const groupItemIds = draggedGroup.items.map(i =>
          i.id.startsWith('tblock_') ? i.id.replace('tblock_', '') : i.id,
        );
        const groupIdSet = new Set(groupItemIds);

        // Remove from source day
        const newSourceActivities = sourceDay.activities.filter(a => !groupIdSet.has(a.id));

        // Add to target day — preserve relative order, append at the end
        let nextOrder = targetDay.activities.length > 0
          ? Math.max(...targetDay.activities.map(a => a.order)) + 1
          : 1;
        const movedActivities = sourceDay.activities
          .filter(a => groupIdSet.has(a.id))
          .sort((a, b) => a.order - b.order)
          .map(a => ({ ...a, order: nextOrder++ }));
        const newTargetActivities = [...targetDay.activities, ...movedActivities];

        // Optimistic UI — remove group items from scheduled
        const draggedItemIds = new Set(draggedGroup.items.map(i => i.id));
        setScheduled(prev => prev.filter(i => !draggedItemIds.has(i.id)));

        // Update context in-memory
        setItineraryDays(itineraryDays.map(d => {
          if (d.id === sourceDay.id) return { ...d, activities: newSourceActivities };
          if (d.id === targetDay.id) return { ...d, activities: newTargetActivities };
          return d;
        }));

        // Persist to DB
        const groupLabel = draggedGroup.items.find(i => i.isTimeBlock)?.label ?? '?';
        Promise.all([
          updateItineraryDay(sourceDay.id, { activities: newSourceActivities }),
          updateItineraryDay(targetDay.id, { activities: newTargetActivities }),
        ]).then(() => {
          addLog(`  📅 group "${groupLabel}" (${draggedGroup.items.length} items) → day ${targetDayNum} ✓`);
        }).catch(err => {
          console.error('Failed to move group:', err);
          addLog(`  ❌ Save failed`);
        });
        return;
      }

      const isSchedItem = activeIdStr.startsWith('sched-');
      const itemId = isSchedItem ? activeIdStr.replace('sched-', '') : activeIdStr;

      // Transport segments cannot be moved across days
      if (itemId.startsWith('trans_')) {
        addLog(`  ❌ Transport segment cannot be moved`);
        return;
      }

      const item = isSchedItem ? scheduled.find(i => i.id === itemId) : potential.find(i => i.id === itemId);
      if (!item) return;

      const sourceDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
      const targetDay = itineraryDays.find(d => d.dayNumber === targetDayNum);
      if (!sourceDay || !targetDay) { addLog(`  ❌ Day not found`); return; }

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
      setItineraryDays(itineraryDays.map(d => {
        if (d.id === sourceDay.id) return { ...d, activities: newSourceActivities };
        if (d.id === targetDay.id) return { ...d, activities: newTargetActivities };
        return d;
      }));

      // Persist to DB
      Promise.all([
        updateItineraryDay(sourceDay.id, { activities: newSourceActivities }),
        updateItineraryDay(targetDay.id, { activities: newTargetActivities }),
      ]).then(() => {
        addLog(`  📅 "${item.label}" → day ${targetDayNum} ✓`);
      }).catch(err => {
        console.error('Failed to move activity:', err);
        addLog(`  ❌ Save failed`);
      });
      return;
    }

    // ── Group drag (untimed time-block group) — reorder within same day ──────
    if (activeIdStr.startsWith('group-drag-')) {
      if (!overId.startsWith('gap-')) return; // day drops handled above

      const groupId = activeIdStr.replace('group-drag-', '');
      const currentGroups = buildGroups(scheduled, lockedIds);
      const draggedGroup = currentGroups.find(g => g.id === groupId);
      if (!draggedGroup) return;

      const draggedItemIds = new Set(draggedGroup.items.map(i => i.id));
      const gapIndex = parseInt(overId.replace('gap-', ''), 10);

      // Calculate insert position in the flat scheduled array
      let insertPos = 0;
      for (let i = 0; i < gapIndex; i++) insertPos += currentGroups[i].items.length;

      // Remove dragged group items and insert at the new position
      const withoutGroup = scheduled.filter(i => !draggedItemIds.has(i.id));
      // Adjust insert position if the group was before the gap
      const firstOldIdx = scheduled.findIndex(i => draggedItemIds.has(i.id));
      const adjustedPos = firstOldIdx < insertPos ? insertPos - draggedGroup.items.length : insertPos;
      const newScheduled = [
        ...withoutGroup.slice(0, adjustedPos),
        ...draggedGroup.items,
        ...withoutGroup.slice(adjustedPos),
      ];
      setScheduled(newScheduled);
      persistDayActivities(newScheduled, potential);
      addLog(`  ↕ moved group "${draggedGroup.items[0]?.label}" (gap ${gapIndex})`);
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

      // → Drop on group frame — append item to end of that group
      if (overId.startsWith('group-frame-')) {
        const currentGroups = buildGroups(scheduled, lockedIds);
        const groupId = overId.replace('group-frame-', '');
        const targetGroup = currentGroups.find(g => g.id === groupId);
        if (!targetGroup || targetGroup.isLocked) return;

        const lastItemInGroup = targetGroup.items[targetGroup.items.length - 1];
        const insertAfterIdx = lastItemInGroup
          ? scheduled.findIndex(i => i.id === lastItemInGroup.id)
          : -1;
        const insertPos = insertAfterIdx + 1; // append after last item in group

        const oldIdx = scheduled.findIndex(i => i.id === itemId);
        if (oldIdx === -1 || oldIdx === insertPos - 1) return; // already there
        const item = scheduled[oldIdx];
        const next = scheduled.filter(i => i.id !== itemId);
        const adjustedPos = oldIdx < insertPos ? insertPos - 1 : insertPos;
        next.splice(adjustedPos, 0, item);
        setScheduled(next);
        persistDayActivities(next, potential);
        addLog(`  ↕ moved "${item.label}" into group "${groupId}"`);
        return;
      }

      // → Reorder within schedule via closestCenter (sched-* target)
      if (overId.startsWith('sched-')) {
        const overItemId = overId.replace('sched-', '');
        // Ignore drops on transport items — they're not valid reorder targets
        if (overItemId.startsWith('trans_')) return;
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
    } else if (overId.startsWith('group-frame-')) {
      // Drop onto a group container — append after last item in group
      const currentGroups = buildGroups(scheduled, lockedIds);
      const groupId = overId.replace('group-frame-', '');
      const targetGroup = currentGroups.find(g => g.id === groupId);
      if (!targetGroup || targetGroup.isLocked) { addLog(`  ❌ locked group`); return; }
      const lastItem = targetGroup.items[targetGroup.items.length - 1];
      const lastIdx = lastItem ? scheduled.findIndex(i => i.id === lastItem.id) : -1;
      arrayInsertPos = lastIdx + 1;
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

  if (isTripLoading || !activeTrip) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="animate-spin h-8 w-8 text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout heroImageOverride={locationImageUrl} heroTitleOverride={selectedLocName ? `${selectedLocCountry || ''} — ${selectedLocName}` : undefined}>
      <div className="flex flex-col gap-3 w-full px-1 sm:px-4 md:h-full" dir={isRTL ? 'rtl' : 'ltr'}>

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={() => { setActiveId(null); setActiveDragGroupCount(0); setActiveDragItem(null); document.documentElement.style.overscrollBehaviorY = ''; }}
        >
          {/* ── View mode toggle (by places / by days) — only on main grid, not inside location/day detail ── */}
          {hasDays && !selectedResearchLocId && !mobileDetailLocId && (
            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('places')}
                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                  viewMode === 'places'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                }`}
              >
                {t('timeline.byPlaces')}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('days')}
                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                  viewMode === 'days'
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                }`}
              >
                {t('timeline.byDays')}
              </button>
            </div>
          )}

          {/* ── Day pills + Location strip (sticky, never scrolls) ── */}
          {!hasDays || viewMode === 'places' ? (
            <div className={`flex flex-col w-full gap-3 md:overflow-hidden ${locDetailSelectedDayNum == null ? 'md:h-[calc(100dvh-5.5rem)]' : ''}`}>

              {/* ════════════════════════════════════════════════════════════════ */}
              {/* ══ MOBILE: feed / detail view ════════════════════════════════ */}
              {/* ════════════════════════════════════════════════════════════════ */}
              <div className="flex flex-col md:hidden">
                {mobileDetailLocId ? (() => {
                  const detailLoc = researchLocations.find(l => l.id === mobileDetailLocId);
                  const detailName = mobileDetailLocId ? researchLocNameMap.get(mobileDetailLocId) || '?' : '';
                  const detailDay = itineraryDays.find(d => d.tripLocationId === mobileDetailLocId);
                  const detailItems: Item[] = [];
                  for (const a of detailDay?.activities || []) {
                    if (a.type === 'poi') {
                      const poi = pois.find(p => p.id === a.id);
                      if (poi) detailItems.push({ id: a.id, label: poi.name, emoji: categoryEmoji(poi.category), sublabel: poi.location?.city || '', poi });
                    }
                  }
                  return (
                    <>
                      {/* Header with back button */}
                      <div className="flex items-center gap-2 shrink-0 pb-2">
                        <button
                          type="button"
                          onClick={() => setMobileDetailLocId(null)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                        >
                          <ChevronLeft size={20} className={isRTL ? 'rotate-180' : ''} />
                        </button>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => handleDeleteResearchLocation(mobileDetailLocId)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {/* Days strip — shown when trip has days */}
                      {hasDays && activeTrip && activeTrip.numberOfDays && (
                        <div className="shrink-0 pb-2">
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {editingLocDays ? (
                              // Edit mode: all days as toggles
                              Array.from({ length: activeTrip.numberOfDays }, (_, i) => i + 1).map(dayNum => {
                                const itDay = itineraryDays.find(d => d.dayNumber === dayNum);
                                const assigned = itDay?.tripLocationId === mobileDetailLocId;
                                const label = activeTrip.startDate
                                  ? format(addDays(parseISO(activeTrip.startDate), dayNum - 1), 'd/M')
                                  : `${t('timeline.day')} ${dayNum}`;
                                return (
                                  <button key={dayNum} type="button"
                                    onClick={() => handleToggleDayForLocation(dayNum, mobileDetailLocId)}
                                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${assigned ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/40'}`}
                                  >{label}</button>
                                );
                              })
                            ) : (
                              // Normal mode: only assigned days — click navigates to day view
                              itineraryDays
                                .filter(d => d.dayNumber >= 1 && d.dayNumber <= activeTrip.numberOfDays! && d.tripLocationId === mobileDetailLocId)
                                .sort((a, b) => a.dayNumber - b.dayNumber)
                                .map(itDay => {
                                  const label = activeTrip.startDate
                                    ? format(addDays(parseISO(activeTrip.startDate), itDay.dayNumber - 1), 'd/M')
                                    : `${t('timeline.day')} ${itDay.dayNumber}`;
                                  return (
                                    <button key={itDay.dayNumber} type="button"
                                      onClick={() => { setLocDetailSelectedDayNum(prev => prev === itDay.dayNumber ? null : itDay.dayNumber); setSelectedDayNum(itDay.dayNumber); }}
                                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border bg-primary text-primary-foreground border-primary hover:opacity-80 transition-opacity ${locDetailSelectedDayNum === itDay.dayNumber ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                                    >{label}</button>
                                  );
                                })
                            )}
                            {/* Toggle edit mode */}
                            <button type="button"
                              onClick={() => setEditingLocDays(v => !v)}
                              className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${editingLocDays ? 'bg-primary/10 border-primary text-primary' : 'border-dashed border-primary/40 text-primary/60 hover:border-primary hover:text-primary'}`}
                            >
                              {editingLocDays ? <Check size={11} /> : <Plus size={11} />}
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Content: either inline day view OR normal location content */}
                      {locDetailSelectedDayNum != null ? (
                        <div className="space-y-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setLocDetailSelectedDayNum(null)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <ChevronLeft size={14} className={isRTL ? 'rotate-180' : ''} />
                            {t('timeline.backToLocation')}
                          </button>
                          <div className="space-y-1.5">
                            {scheduled.length === 0 && potential.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-4 text-center">{t('timeline.noItemsYet')}</p>
                            ) : (
                              <>
                                {scheduled.map(item => (
                                  <button key={item.id} type="button" onClick={() => setOpenedPoiId(item.id)}
                                    className="w-full flex items-center gap-2 p-2 rounded-lg border bg-card hover:border-primary/40 transition-all text-start"
                                  >
                                    {item.poi?.imageUrl ? (
                                      <img src={item.poi.imageUrl} alt={item.label} className="w-9 h-9 rounded-md object-cover shrink-0" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                                        <SubCategoryIcon type={item.poi?.subCategory || ''} size={16} className="text-muted-foreground/50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium truncate">{item.label}</p>
                                      {item.time && <p className="text-xs text-muted-foreground">{item.time}</p>}
                                    </div>
                                  </button>
                                ))}
                                {potential.map(item => (
                                  <button key={item.id} type="button" onClick={() => setOpenedPoiId(item.id)}
                                    className="w-full flex items-center gap-2 p-2 rounded-lg border bg-card hover:border-primary/40 transition-all text-start opacity-60"
                                  >
                                    {item.poi?.imageUrl ? (
                                      <img src={item.poi.imageUrl} alt={item.label} className="w-9 h-9 rounded-md object-cover shrink-0" />
                                    ) : (
                                      <div className="w-9 h-9 rounded-md bg-muted flex items-center justify-center shrink-0">
                                        <SubCategoryIcon type={item.poi?.subCategory || ''} size={16} className="text-muted-foreground/50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium truncate">{item.label}</p>
                                    </div>
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                      <div className="space-y-3">
                        {/* Map */}
                        {locationCoords && (
                          <div className="rounded-xl overflow-hidden border bg-muted h-[200px]">
                            <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Loading...</div>}>
                              <LazyMiniMap
                                coordinates={locationCoords}
                                className="w-full h-full"
                                zoom={isCity ? 13 : 9}
                                boundary={locationBoundary ?? undefined}
                                markers={detailItems
                                  .filter(i => i.poi?.location?.coordinates)
                                  .map(i => ({ lat: i.poi!.location.coordinates!.lat, lng: i.poi!.location.coordinates!.lng, label: i.poi!.name }))}
                              />
                            </Suspense>
                          </div>
                        )}

                        {/* Horizontal POI thumbnails */}
                        {detailItems.length > 0 && (
                          <div>
                            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5">{t('timeline.activitiesCount', { count: detailItems.length })}</h4>
                            <div className="flex gap-2 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                              {detailItems.map(item => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setOpenedPoiId(item.id)}
                                  className="shrink-0 w-24 text-center"
                                >
                                  <div className="w-24 h-24 rounded-lg overflow-hidden bg-muted border">
                                    {item.poi?.imageUrl ? (
                                      <img src={item.poi.imageUrl} alt={item.label} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <MapPin size={20} className="text-muted-foreground/30" />
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-[11px] font-medium mt-1 truncate">{item.label}</p>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Add activity */}
                        <DaySection
                          title=""
                          icon={null}
                          items={[]}
                          onRemove={handleRemoveResearchPoi}
                          availableItems={pois
                            .filter(p => !detailItems.some(di => di.id === p.id))
                            .map(p => ({ id: p.id, label: p.name, sublabel: p.location?.city || '', city: p.location?.city, status: p.status }))
                          }
                          onAdd={(id) => handleAddResearchPoi(id)}
                          addLabel={t('timeline.addActivity')}
                          entityType="activity"
                          locationContext={detailName}
                          countries={activeTrip?.countries}
                          hideHeader
                          hideEmptyState
                          hideOtherLocations
                          onRecommend={() => handleRecommendAttractions(detailName)}
                        />

                        {/* Notes */}
                        <div className="space-y-1.5">
                          <h4 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                            <NotebookPen size={12} /> {t('timeline.locationNotes')}
                          </h4>
                          <textarea
                            value={localNotes}
                            onChange={e => handleNotesChange(e.target.value)}
                            placeholder={t('timeline.locationNotesPlaceholder')}
                            className="w-full h-28 rounded-lg border bg-card p-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                            dir="auto"
                          />
                        </div>
                      </div>
                      )}
                    </>
                  );
                })() : (
                  <>
                    {/* ── Feed: Instagram-style cards ── */}
                    <div className="space-y-3 pb-2">
                      {sortedResearchLocations.map((il) => {
                        const name = il.name;
                        const holdingDay = itineraryDays.find(d => d.tripLocationId === il.id);
                        const poiCount = holdingDay?.activities?.length ?? 0;
                        const assignedDaysCount = hasDays ? itineraryDays.filter(d => d.tripLocationId === il.id).length : 0;
                        const imgUrl = il.imageUrl;
                        return (
                          <button
                            key={il.id}
                            type="button"
                            onClick={() => { setMobileDetailLocId(il.id); setSelectedResearchLocId(il.id); }}
                            className="w-full rounded-xl overflow-hidden border bg-card text-start relative group"
                          >
                            {/* Full-width image */}
                            <div className="w-full aspect-[16/9] bg-muted">
                              {imgUrl ? (
                                <img src={imgUrl} alt={name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <MapPin size={32} className="text-muted-foreground/20" />
                                </div>
                              )}
                            </div>
                            {/* Overlay: name + count at bottom */}
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8">
                              <p className="text-base font-bold text-white truncate">{name}</p>
                              {assignedDaysCount > 0 && (
                                <p className="text-xs text-white/80">{t('timeline.daysCount', { count: assignedDaysCount })}</p>
                              )}
                              {poiCount > 0 && (
                                <p className="text-xs text-white/70">{t('timeline.activitiesCount', { count: poiCount })}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      {/* Add location card */}
                      <button
                        type="button"
                        onClick={() => setAddLocationOpen(true)}
                        className="w-full rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center py-8 gap-2"
                      >
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                          <Plus size={24} className="text-primary" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">{t('timeline.addLocation')}</p>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* ════════════════════════════════════════════════════════════════ */}
              {/* ══ DESKTOP: Pinterest grid / detail view ═════════════════════ */}
              {/* ════════════════════════════════════════════════════════════════ */}
              <div className="hidden md:flex md:flex-col flex-1 min-h-0 overflow-hidden">
                {selectedResearchLocId ? (() => {
                  // Detail view (same data as mobile detail)
                  const detailLoc = researchLocations.find(l => l.id === selectedResearchLocId);
                  const detailName = researchLocNameMap.get(selectedResearchLocId) || '?';
                  return (
                    <div className="flex flex-col flex-1 min-h-0">
                      {/* Header */}
                      <div className="flex items-center gap-2 shrink-0 pb-3">
                        <button type="button" onClick={() => setSelectedResearchLocId(null)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                          <ChevronLeft size={20} className={isRTL ? 'rotate-180' : ''} />
                        </button>
                        <div className="flex-1" />
                        <button
                          type="button"
                          onClick={() => handleDeleteResearchLocation(selectedResearchLocId)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                      {/* Days strip — shown when trip has days */}
                      {hasDays && activeTrip && activeTrip.numberOfDays && (
                        <div className="shrink-0 pb-2">
                          <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
                            {editingLocDays ? (
                              // Edit mode: all days as toggles
                              Array.from({ length: activeTrip.numberOfDays }, (_, i) => i + 1).map(dayNum => {
                                const itDay = itineraryDays.find(d => d.dayNumber === dayNum);
                                const assigned = itDay?.tripLocationId === selectedResearchLocId;
                                const label = activeTrip.startDate
                                  ? format(addDays(parseISO(activeTrip.startDate), dayNum - 1), 'd/M')
                                  : `${t('timeline.day')} ${dayNum}`;
                                return (
                                  <button key={dayNum} type="button"
                                    onClick={() => handleToggleDayForLocation(dayNum, selectedResearchLocId)}
                                    className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${assigned ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-primary/40'}`}
                                  >{label}</button>
                                );
                              })
                            ) : (
                              // Normal mode: only assigned days — click navigates to day view
                              itineraryDays
                                .filter(d => d.dayNumber >= 1 && d.dayNumber <= activeTrip.numberOfDays! && d.tripLocationId === selectedResearchLocId)
                                .sort((a, b) => a.dayNumber - b.dayNumber)
                                .map(itDay => {
                                  const label = activeTrip.startDate
                                    ? format(addDays(parseISO(activeTrip.startDate), itDay.dayNumber - 1), 'd/M')
                                    : `${t('timeline.day')} ${itDay.dayNumber}`;
                                  return (
                                    <button key={itDay.dayNumber} type="button"
                                      onClick={() => { setLocDetailSelectedDayNum(prev => prev === itDay.dayNumber ? null : itDay.dayNumber); setSelectedDayNum(itDay.dayNumber); }}
                                      className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium border bg-primary text-primary-foreground border-primary hover:opacity-80 transition-opacity ${locDetailSelectedDayNum === itDay.dayNumber ? 'ring-2 ring-offset-1 ring-primary' : ''}`}
                                    >{label}</button>
                                  );
                                })
                            )}
                            {/* Toggle edit mode */}
                            <button type="button"
                              onClick={() => setEditingLocDays(v => !v)}
                              className={`shrink-0 w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${editingLocDays ? 'bg-primary/10 border-primary text-primary' : 'border-dashed border-primary/40 text-primary/60 hover:border-primary hover:text-primary'}`}
                            >
                              {editingLocDays ? <Check size={11} /> : <Plus size={11} />}
                            </button>
                          </div>
                        </div>
                      )}
                      {/* Content: either inline day view OR activities strip + sidebar */}
                      {locDetailSelectedDayNum != null ? (
                        <div className="flex flex-col flex-1 min-h-0 overflow-hidden gap-2">
                          <button
                            type="button"
                            onClick={() => setLocDetailSelectedDayNum(null)}
                            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors shrink-0 self-start"
                          >
                            <ChevronLeft size={14} className={isRTL ? 'rotate-180' : ''} />
                            {t('timeline.backToLocation')}
                          </button>
                          <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5">
                            {scheduled.length === 0 && potential.length === 0 ? (
                              <p className="text-xs text-muted-foreground py-4 text-center">{t('timeline.noItemsYet')}</p>
                            ) : (
                              <>
                                {scheduled.map(item => (
                                  <button key={item.id} type="button" onClick={() => setOpenedPoiId(item.id)}
                                    className="w-full flex items-center gap-2 p-2 rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-start"
                                  >
                                    {item.poi?.imageUrl ? (
                                      <img src={item.poi.imageUrl} alt={item.label} className="w-10 h-10 rounded-md object-cover shrink-0" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                                        <SubCategoryIcon type={item.poi?.subCategory || ''} size={18} className="text-muted-foreground/50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium truncate">{item.label}</p>
                                      {item.time && <p className="text-xs text-muted-foreground">{item.time}</p>}
                                      {item.sublabel && <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>}
                                    </div>
                                  </button>
                                ))}
                                {potential.map(item => (
                                  <button key={item.id} type="button" onClick={() => setOpenedPoiId(item.id)}
                                    className="w-full flex items-center gap-2 p-2 rounded-lg border bg-card hover:border-primary/40 hover:shadow-sm transition-all text-start opacity-60"
                                  >
                                    {item.poi?.imageUrl ? (
                                      <img src={item.poi.imageUrl} alt={item.label} className="w-10 h-10 rounded-md object-cover shrink-0" />
                                    ) : (
                                      <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
                                        <SubCategoryIcon type={item.poi?.subCategory || ''} size={18} className="text-muted-foreground/50" />
                                      </div>
                                    )}
                                    <div className="min-w-0 flex-1">
                                      <p className="text-sm font-medium truncate">{item.label}</p>
                                      {item.sublabel && <p className="text-xs text-muted-foreground truncate">{item.sublabel}</p>}
                                    </div>
                                  </button>
                                ))}
                              </>
                            )}
                          </div>
                        </div>
                      ) : (
                      <div className="flex-1 min-h-0 flex gap-4 overflow-hidden">
                        {/* Left 2/3: horizontal activities strip */}
                        <div className="flex-1 min-w-0 flex flex-col gap-2 min-h-0">
                          <h4 className="text-sm font-semibold text-muted-foreground shrink-0">
                            {researchPotential.length > 0
                              ? t('timeline.activitiesCount', { count: researchPotential.length })
                              : t('timeline.addActivity')}
                          </h4>
                          <div className="overflow-x-auto shrink-0" style={{ WebkitOverflowScrolling: 'touch' }}>
                            <div className="flex gap-3 pb-2" style={{ minWidth: 'max-content' }}>
                              {researchPotential.map(item => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => setOpenedPoiId(item.id)}
                                  className="shrink-0 w-36 rounded-xl overflow-hidden border bg-card text-start relative group hover:border-primary/40 hover:shadow-md transition-all"
                                >
                                  <div className="w-full aspect-[3/2] bg-muted">
                                    {item.poi?.imageUrl ? (
                                      <img src={item.poi.imageUrl} alt={item.label} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center">
                                        <SubCategoryIcon type={item.poi?.subCategory || ''} size={28} className="text-muted-foreground/30" />
                                      </div>
                                    )}
                                  </div>
                                  <div className="p-2 flex items-center gap-1.5">
                                    <SubCategoryIcon type={item.poi?.subCategory || ''} size={13} className="shrink-0 text-muted-foreground" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium truncate">{item.label}</p>
                                      {item.sublabel && <p className="text-[11px] text-muted-foreground truncate">{item.sublabel}</p>}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); handleRemoveResearchPoi(item.id); }}
                                    className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/40 text-white/70 hover:bg-destructive hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                  >
                                    <X size={14} />
                                  </button>
                                </button>
                              ))}
                              {/* Add activity card */}
                              <button
                                onClick={() => setAddActivityOpen(true)}
                                className="shrink-0 w-36 rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center aspect-[3/2] gap-1.5 cursor-pointer"
                              >
                                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                                  <Plus size={18} className="text-primary" />
                                </div>
                                <span className="text-xs text-primary font-medium">{t('timeline.activity')}</span>
                              </button>
                              <DaySection
                                title="" icon={null} items={[]}
                                onRemove={handleRemoveResearchPoi}
                                availableItems={pois.filter(p => !researchPotential.some(rp => rp.id === p.id)).map(p => ({ id: p.id, label: p.name, sublabel: p.location?.city || '', city: p.location?.city, status: p.status }))}
                                onAdd={(id) => handleAddResearchPoi(id)}
                                addLabel={t('timeline.activity')}
                                entityType="activity"
                                locationContext={researchLocNameMap.get(selectedResearchLocId)}
                                countries={activeTrip?.countries} hideHeader hideEmptyState
                                externalOpen={addActivityOpen}
                                onExternalOpenChange={setAddActivityOpen}
                                hideOtherLocations
                                onRecommend={() => handleRecommendAttractions(researchLocNameMap.get(selectedResearchLocId) || '')}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right 1/3: image, map, notes */}
                        <div className="w-1/3 shrink-0 flex flex-col gap-2 min-h-0 overflow-hidden">
                          <div className="rounded-lg overflow-hidden border bg-muted flex-1 min-h-[160px] shrink-0">
                            {locationCoords ? (
                              <Suspense fallback={<div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground">Loading...</div>}>
                                <LazyMiniMap coordinates={locationCoords} className="w-full h-full" zoom={isCity ? 13 : 9} boundary={locationBoundary ?? undefined} markers={researchMapMarkers} />
                              </Suspense>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <MapPin size={24} className="text-muted-foreground/30" />
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col gap-1 shrink-0">
                            <h4 className="text-xs font-semibold flex items-center gap-1.5 text-muted-foreground">
                              <NotebookPen size={12} /> {t('timeline.locationNotes')}
                            </h4>
                            <textarea
                              value={localNotes}
                              onChange={e => handleNotesChange(e.target.value)}
                              placeholder={t('timeline.locationNotesPlaceholder')}
                              className="h-16 w-full rounded-lg border bg-card p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/40 placeholder:text-muted-foreground/50"
                              dir="auto"
                            />
                          </div>
                        </div>
                      </div>
                      )}
                    </div>
                  );
                })() : (
                  <>
                    {/* Grid view header */}
                    <div className="flex items-center gap-2 shrink-0 pb-2">
                      <h3 className="text-sm font-semibold text-muted-foreground flex-1">{t('timeline.selectLocations')}</h3>
                    </div>
                    {/* Pinterest grid */}
                    <div className="flex-1 min-h-0 overflow-y-auto">
                      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 pb-2">
                        {sortedResearchLocations.map((il) => {
                          const name = il.name;
                          const holdingDay = itineraryDays.find(d => d.tripLocationId === il.id);
                          const poiCount = holdingDay?.activities?.length ?? 0;
                          const assignedDaysCount = hasDays ? itineraryDays.filter(d => d.tripLocationId === il.id).length : 0;
                          const imgUrl = il.imageUrl;
                          return (
                            <button
                              key={il.id}
                              type="button"
                              onClick={() => setSelectedResearchLocId(il.id)}
                              className="rounded-xl overflow-hidden border bg-card text-start relative group hover:border-primary/40 hover:shadow-md transition-all"
                            >
                              <div className="w-full aspect-[4/3] bg-muted">
                                {imgUrl ? (
                                  <img src={imgUrl} alt={name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <MapPin size={28} className="text-muted-foreground/20" />
                                  </div>
                                )}
                              </div>
                              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent px-3 pb-2.5 pt-8">
                                <p className="text-sm font-bold text-white truncate">{name}</p>
                                {assignedDaysCount > 0 && (
                                  <p className="text-[11px] text-white/80">{t('timeline.daysCount', { count: assignedDaysCount })}</p>
                                )}
                                {poiCount > 0 && (
                                  <p className="text-[11px] text-white/70">{t('timeline.activitiesCount', { count: poiCount })}</p>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleDeleteResearchLocation(il.id); }}
                                className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/40 text-white/70 hover:bg-destructive hover:text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                              >
                                <X size={14} />
                              </button>
                            </button>
                          );
                        })}
                        {/* Add card */}
                        <button
                          type="button"
                          onClick={() => setAddLocationOpen(true)}
                          className="rounded-xl border-2 border-dashed border-primary/30 hover:border-primary/60 hover:bg-primary/5 transition-colors flex flex-col items-center justify-center gap-2 aspect-[4/3]"
                        >
                          <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                            <Plus size={20} className="text-primary" />
                          </div>
                          <p className="text-xs font-medium text-muted-foreground">{t('timeline.addLocation')}</p>
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ── Location picker dialog (shared) ── */}
              <Dialog open={addLocationOpen} onOpenChange={setAddLocationOpen}>
                <DialogContent className="w-[min(400px,90vw)] max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>{t('timeline.addLocation')}</DialogTitle>
                    <DialogDescription>{t('timeline.selectLocations')}</DialogDescription>
                  </DialogHeader>
                  <LocationSelector
                    value=""
                    onChange={(name) => handleAddResearchLocation(name)}
                    placeholder={t('timeline.selectLocations')}
                    inline
                  />
                </DialogContent>
              </Dialog>

            </div>
          ) : tripDays.length > 0 ? (
            <div className="w-full shrink-0 pb-1 overflow-x-auto will-change-transform" style={{ WebkitOverflowScrolling: 'touch', transform: 'translateZ(0)' }}>
              <div className="flex gap-2 pb-1" style={{ minWidth: 'max-content' }}>
                {tripDays.map((td) => {
                  const itDay = itineraryDays.find(d => d.dayNumber === td.dayNum);
                  const hasContent = !!itDay && (
                    (itDay.activities?.length ?? 0) > 0 ||
                    (itDay.accommodationOptions?.length ?? 0) > 0
                  );
                  const dayWeather = td.dateStr ? weatherByDate.get(td.dateStr) : undefined;
                  return (
                    <DroppableDayPill
                      key={td.dayNum}
                      dayNum={td.dayNum}
                      shortLabel={td.shortLabel}
                      isSelected={selectedDayNum === td.dayNum}
                      hasContent={hasContent}
                      weatherIcon={dayWeather ? weatherCodeToIcon(dayWeather.weatherCode) : undefined}
                      onClick={() => { setSelectedDayNum(td.dayNum); setSelectedItemId(null); setHighlightedLegId(null); }}
                      onDoubleClick={() => handleDayDoubleClick(td.dayNum)}
                    />
                  );
                })}
              </div>

              {/* Gantt-like location strip (draggable to reorder) */}
              <div className="relative h-8 mt-1 mb-1">
                <DndContext sensors={locationPillSensors} collisionDetection={closestCenter} onDragEnd={handleLocationSpanReorder}>
                  <SortableContext items={sortableSpanIds} strategy={horizontalListSortingStrategy}>
                    <div className="flex gap-2 h-full">
                      {locationStripItems.map(item => {
                        if (item.type === 'gap') {
                          return <div key={item.id} className="shrink-0" style={{ width: `${item.dayCount * locationDayWidth - 8}px` }} />;
                        }
                        const span = locationSpans[item.spanIndex];
                        const isSelected = selectedSpan === span;
                        return (
                          <SortableLocationSpan
                            key={item.id}
                            id={item.id}
                            location={item.location}
                            dayCount={item.dayCount}
                            isSelected={isSelected}
                            locationDayWidth={locationDayWidth}
                            onClick={() => { setLocationContext(span.location); setLocationTotalDays(span.endIdx - span.startIdx + 1); setEditingLocation(true); }}
                          />
                        );
                      })}
                    </div>
                  </SortableContext>
                </DndContext>
                {!selectedSpan && (
                  <button
                    type="button"
                    onClick={() => { setLocationContext(''); setEditingLocation(true); }}
                    className="absolute top-0 h-full border border-dashed border-primary/40 rounded-md flex items-center justify-center px-1 text-[10px] sm:text-xs text-muted-foreground hover:text-primary hover:border-primary transition-colors whitespace-nowrap"
                    style={{ insetInlineStart: `${selectedIdx * locationDayWidth}px`, width: `${locationDayWidth - 8}px` }}
                  >
                    + {t('timeline.location')}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('timeline.noActiveTrip')}</p>
          )}

          {hasDays && viewMode === 'days' && (<>
          {/* Location picker dialog */}
          {activeTrip && (
            <LocationContextPicker
              open={editingLocation}
              onOpenChange={(open) => { if (!open) { setEditingLocation(false); setLocationTotalDays(1); } }}
              value={locationContext}
              onChange={setLocationContext}
              totalDays={locationTotalDays}
              onTotalDaysChange={setLocationTotalDays}
              maxTotalDays={tripDays.length + 30}
              onSave={updateLocationContext}
            />
          )}

          {/* ── Mobile tab switcher ──────────────────────── */}
          <div className="flex md:hidden gap-1 mt-1.5">
            <button
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                mobileTab === 'schedule'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
              onClick={() => setMobileTab('schedule')}
            >
              {t('timeline.scheduleTab')}
            </button>
            <button
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                mobileTab === 'map'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
              onClick={() => setMobileTab('map')}
            >
              {t('timeline.mapTab')}
            </button>
          </div>

          {/* ── Scrollable content area ─────────────────────── */}
          <div className="md:flex-1 md:min-h-0 md:overflow-hidden flex flex-col">

          {/* Mobile: potential list + timeline toggle (schedule tab only) */}
          {isMobile && mobileTab === 'schedule' && (
            <div className="md:hidden shrink-0 mb-2">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-600 mb-1">
                {t('timeline.potential')} ({potential.length})
              </p>
              <PotentialZone isScheduledDragging={isScheduledDrag}>
                {potential.length === 0 && !isScheduledDrag ? (
                  <p className="text-xs text-muted-foreground py-2 text-center">{t('timeline.allItemsScheduled')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {potential.map(item => (
                      <DraggableItem
                        key={item.id}
                        item={item}
                        isBeingDragged={activeId === item.id}
                        onRemove={() => removeActivity(item.id)}
                      />
                    ))}
                  </div>
                )}
              </PotentialZone>
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
                addLabel={t('timeline.addActivity')}
                locationContext={currentDayLocation}
                countries={activeTrip?.countries}

                showBookingMissionOption
              />
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-[3fr_5fr_4fr] gap-3 md:h-full md:[grid-template-rows:minmax(0,1fr)]">

            {/* ── Column 1: Potential + Add activity (desktop only) ──────────── */}
            {!isMobile && <div className="space-y-3 md:overflow-y-auto md:min-h-0">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-600">
                {t('timeline.potential')} ({potential.length})
              </p>
              <PotentialZone isScheduledDragging={isScheduledDrag}>
                {potential.length === 0 && !isScheduledDrag && (
                  <p className="text-xs text-muted-foreground py-4 text-center">{t('timeline.allItemsScheduled')}</p>
                )}
                {potential.map(item => (
                  <DraggableItem
                    key={item.id}
                    item={item}
                    isBeingDragged={activeId === item.id}
                    onRemove={() => removeActivity(item.id)}
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
                addLabel={t('timeline.addActivity')}
                locationContext={currentDayLocation}
                countries={activeTrip?.countries}

                showBookingMissionOption
              />
            </div>}

            {/* ── Left column: Timeline (wake up → schedule → sleep) — scrolls independently on desktop */}
            <div className={`space-y-3 md:overflow-y-auto md:min-h-0 pb-4 ${isMobile && mobileTab !== 'schedule' ? 'hidden' : ''}`}>

              {/* Timeline content */}
              <div>

              {/* Holidays on this day */}
              {dayHolidays.length > 0 && (
                <div className="space-y-1">
                  {dayHolidays.map(h => (
                    <div key={h.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                      <Calendar size={14} className="text-purple-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-purple-700 dark:text-purple-300 truncate">{h.name}</p>
                        {h.details?.event_details?.local_name && (
                          <p className="text-xs text-purple-500/70 truncate">{h.details.event_details.local_name}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Where I wake up */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Sun size={13} className="text-warning shrink-0" />
                  <p className="text-xs font-semibold text-warning">{t('timeline.wakeUp')}</p>
                </div>
                {selectedDayNum === 1 ? (
                  <div className="px-3 py-2.5 text-xs text-muted-foreground bg-muted/20 rounded-xl border border-dashed border-border/40">
                    {t('timeline.firstDay')}
                  </div>
                ) : morningAccom ? (
                  <div
                    className="flex items-center gap-2.5 bg-muted/40 rounded-xl px-3 py-2.5 border border-border/40 cursor-pointer hover:border-primary/30 transition-colors touch-manipulation"
                    onClick={() => setOpenedPoiId(morningAccom.poi.id)}
                  >
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
              </div>

              {/* Travel leg: morning accom → first activity */}
              {morningAccom && morningCoords && (() => {
                const morningStopId = `accom-morning-${morningAccom.poi.id}`;
                const leg = legMap.get(morningStopId);
                return leg ? <TravelLegRow leg={leg} onHighlight={() => setHighlightedLegId(leg.fromStopId)} /> : null;
              })()}

              {/* Scheduled itinerary */}
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  {t('timeline.schedule')} ({scheduled.length})
                </p>
                <ScheduleZone activePotentialDrag={isPotentialDrag} isEmpty={scheduled.length === 0}>
                  {scheduled.length === 0 && !isPotentialDrag && (
                    <p className="text-xs text-muted-foreground py-4 text-center">{t('timeline.dragItemHere')}</p>
                  )}

                  <div className="relative space-y-0.5">
                    {/* Vertical timeline line */}
                    <div className={`absolute top-0 bottom-0 w-px bg-border/60 pointer-events-none ${isRTL ? 'right-1.5 sm:right-2.5' : 'left-1.5 sm:left-2.5'}`} />

                    {/* Gap before first group */}
                    <DropGap index={0} active={isAnyDragging} />

                    {groups.map((group, gi) => (
                      <div key={group.id} className="relative space-y-0.5">
                        <div className={`absolute top-[8px] w-2 h-2 rounded-full bg-orange-400 pointer-events-none z-10 ${isRTL ? 'right-0.5 sm:right-1.5' : 'left-0.5 sm:left-1.5'}`} />
                        <div className={isRTL ? 'pr-4 sm:pr-6' : 'pl-4 sm:pl-6'}>
                          <GroupFrame
                            group={group}
                            label={groupLabel(groups, gi, t)}
                            lockedIds={lockedIds}
                            onToggleLock={toggleLock}
                            onAddTransport={handleAddTransport}
                            onDeleteTransport={handleDeleteTransport}
                            onEditTransport={handleEditTransport}
                            onUpdateTimeBlock={handleUpdateTimeBlock}
                            onDeleteTimeBlock={handleDeleteTimeBlock}
                            canDelete={canDeleteGroup(groups, gi)}
                            onRenameGroup={(lbl, time) => {
                              const content = group.items.filter(i => !i.isTimeBlock);
                              handleRenameAutoGroup(content[0]?.id, lbl, time);
                            }}
                            onDeleteGroup={() => {
                              const content = group.items.filter(i => !i.isTimeBlock);
                              handleDeleteAutoGroup(content.map(i => i.id));
                            }}
                            legMap={legMap}
                            onHighlightLeg={setHighlightedLegId}
                            transportCalcDurations={transportCalcDurations}
                            selectedItemId={isMobile ? null : selectedItemId}
                            onSelectItem={isMobile ? undefined : (id) => setSelectedItemId(prev => prev === id ? null : id)}
                            onRemoveActivity={removeActivity}
                          />
                        </div>
                        {/* Gap after each group */}
                        <DropGap index={gi + 1} active={isAnyDragging} />
                      </div>
                    ))}
                  </div>
                </ScheduleZone>

                {/* Add time window */}
                {addingTimeBlock ? (
                  <div className="flex gap-1.5 items-center mt-2 p-2 rounded-lg bg-primary/5 border border-primary/20">
                    <Input
                      placeholder={t('timeline.timeWindowPlaceholder')}
                      value={newTbLabel}
                      onChange={e => setNewTbLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddTimeBlock(); if (e.key === 'Escape') { setAddingTimeBlock(false); setNewTbLabel(''); setNewTbTime(''); } }}
                      className="h-7 text-xs flex-1 min-w-0"
                      autoFocus
                    />
                    <input
                      type="time"
                      value={newTbTime}
                      onChange={e => setNewTbTime(e.target.value)}
                      className="h-7 text-xs border border-input rounded-md px-2 bg-background w-[88px] shrink-0"
                    />
                    <button type="button" onClick={handleAddTimeBlock} className="p-1 rounded text-primary hover:bg-primary/10 transition-colors shrink-0">
                      <Check size={14} />
                    </button>
                    <button type="button" onClick={() => { setAddingTimeBlock(false); setNewTbLabel(''); setNewTbTime(''); }} className="p-1 rounded text-muted-foreground hover:bg-muted transition-colors shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setAddingTimeBlock(true)}
                    className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 hover:text-primary hover:bg-primary/5 border border-dashed border-primary/20 hover:border-primary/40 rounded-lg py-1.5 transition-colors"
                  >
                    <Clock size={12} />
                    {t('timeline.addTimeWindow')}
                  </button>
                )}
              </div>

              {/* Travel leg: last activity → evening accom */}
              {eveningAccom && eveningCoords && (() => {
                const lastPoiItem = [...scheduled].reverse().find(it => it.poi?.location?.coordinates?.lat != null);
                const leg = lastPoiItem ? legMap.get(lastPoiItem.id) : null;
                return leg ? <TravelLegRow leg={leg} onHighlight={() => setHighlightedLegId(leg.fromStopId)} /> : null;
              })()}

              {/* Where I sleep */}
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Moon size={13} className="text-info shrink-0" />
                  <p className="text-xs font-semibold text-info">{t('timeline.sleepAt')}</p>
                </div>
                <DaySection
                  title={t('timeline.sleepAt')}
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
                  onOpen={setOpenedPoiId}
                  addLabel={t('timeline.addAccommodation')}
                  maxNights={tripDays.length - selectedDayNum + 1}
                  showBookingMissionOption
                  locationContext={currentDayLocation}
                  countries={activeTrip?.countries}
  
                />
              </div>

              </div>{/* end timeline content */}
            </div>
            {/* end timeline column */}

            {/* ── Column 3: Route map ─────────── */}
            {(!isMobile || mobileTab === 'map') && (
              <div className={`${isMobile ? 'min-h-[calc(100vh-12rem)]' : 'hidden md:block md:min-h-0'} border rounded-lg overflow-hidden`}>
                <RouteMapPanel
                  dayPOIs={dayPOIs}
                  stops={routeStops}
                  stopNames={stopNames}
                  legs={legs}
                  stats={routeStats}
                  isCalculating={isCalculating}
                  isStale={isStale}
                  error={routeError}
                  defaultMode={defaultMode}
                  onModeChange={setDefaultMode}
                  onCalculate={() => calculateRoute(defaultMode)}
                  highlightedLegId={highlightedLegId}
                  selectedStopId={isMobile ? null : selectedItemId}
                  onStopClick={(stopId) => {
                    if (isMobile) {
                      setOpenedPoiId(stopId);
                    } else {
                      setSelectedItemId(prev => prev === stopId ? null : stopId);
                      document.getElementById(`sched-item-${stopId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                  }}
                  onReset={resetRoute}
                />
              </div>
            )}

          </div>
          {/* end three-column grid */}
          </div>
          {/* end scrollable content area */}

          <DragOverlay dropAnimation={null}>
            {activeItem && (
              <div className="flex items-center gap-2.5 bg-card border border-primary/50 rounded-xl px-3 py-2.5 shadow-lg rotate-1 cursor-grabbing">
                <GripVertical size={14} className="text-muted-foreground/50 shrink-0" />
                {activeItem.poi ? (
                  <POICard poi={activeItem.poi} level={1} />
                ) : (
                  <>
                    <span className="material-symbols-outlined">{activeItem.emoji}</span>
                    <span className="text-sm font-medium">{activeItem.label}</span>
                    {activeDragGroupCount > 0 && (
                      <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full">
                        +{activeDragGroupCount}
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </DragOverlay>
          </>)}
        </DndContext>

      </div>

      <CreateTransportForm
        open={addTransportOpen}
        onOpenChange={setAddTransportOpen}
        onCreated={handleTransportCreated}
        initialFrom={transportFromName}
        initialTo={transportToName}
      />

      {editTransportId && (() => {
        const transport = transportation.find(t => t.id === editTransportId);
        return transport ? (
          <TransportDetailDialog
            transport={transport}
            open={!!editTransportId}
            onOpenChange={open => { if (!open) { setEditTransportId(null); refreshDays(); } }}
          />
        ) : null;
      })()}

      {openedPoiId && (() => {
        const poi = pois.find(p => p.id === openedPoiId);
        return poi ? (
          <POIDetailDialog
            poi={poi}
            open={!!openedPoiId}
            onOpenChange={open => { if (!open) setOpenedPoiId(null); }}
          />
        ) : null;
      })()}
      {/* Day date picker dialog (planning → detailed_planning) */}
      <Dialog open={dateDayNum !== null} onOpenChange={(open) => { if (!open) setDateDayNum(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('timeline.setDayDate')}</DialogTitle>
            <DialogDescription>
              {t('timeline.setDayDateDescription', { day: dateDayNum ?? '' })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>{t('timeline.date')}</Label>
            <Input
              type="date"
              value={datePickerValue}
              onChange={(e) => setDatePickerValue(e.target.value)}
              className="h-9 mt-1"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDateDayNum(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleDatePickerConfirm} disabled={datePickerSubmitting || !datePickerValue}>
              {t('common.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
