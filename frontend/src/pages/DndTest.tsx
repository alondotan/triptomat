import { useState, useCallback, useMemo, useEffect } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { useTransport } from '@/context/TransportContext';
import { useItinerary } from '@/context/ItineraryContext';
import { updateItineraryDay, createItineraryDay } from '@/services/tripService';
import { LocationContextPicker } from '@/components/LocationContextPicker';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { eachDayOfInterval, parseISO, format } from 'date-fns';
import type { ItineraryActivity, PointOfInterest } from '@/types/trip';
import { POICard } from '@/components/POICard';
import { CreateTransportForm } from '@/components/forms/CreateTransportForm';
import { TransportDetailDialog } from '@/components/TransportDetailDialog';
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
import { Building2, Check, Clock, GripVertical, Moon, Pencil, Sun, Trash2, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DaySection } from '@/components/DaySection';
import { getSubCategoryEntry } from '@/lib/subCategoryConfig';

// ─── Data ─────────────────────────────────────────────────────────────────────

interface Item {
  id: string;
  label: string;
  emoji: string;
  time?: string;   // time_window.start for timed activities
  sublabel?: string; // city / subCategory
  remark?: string;   // e.g. "הזמין כרטיסים מראש"
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

function slotLabel(minutes: number): string {
  if (minutes < 12 * 60) return 'בוקר';
  if (minutes < 17 * 60) return 'צהריים';
  if (minutes < 21 * 60) return 'ערב';
  return 'לילה';
}

// Compute display label for a group given its position in the groups array
function groupLabel(groups: Group[], index: number): string {
  const group = groups[index];

  // Locked group: time_block shows its own label; timed POI shows HH:mm
  if (group.isLocked) {
    const item = group.items[0];
    if (item?.isTimeBlock) return item.label + (item.time ? ` · ${item.time}` : '');
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
  const { attributes, listeners, setNodeRef } = useDraggable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2.5 bg-card border rounded-xl px-3 py-2.5 select-none transition-opacity ${
        isBeingDragged ? 'opacity-30' : 'hover:border-primary/40'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="shrink-0 p-0.5 touch-none select-none cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground"
      >
        <GripVertical size={14} />
      </button>
      <div className="flex-1 min-w-0">
        {item.poi ? (
          <POICard poi={item.poi} level={2} editable />
        ) : (
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined">{item.emoji}</span>
            <span className="text-sm font-medium">{item.label}</span>
            {item.remark && <span className="text-xs text-muted-foreground ml-1">{item.remark}</span>}
          </div>
        )}
      </div>
      {onRemove && (
        <button
          onClick={onRemove}
          className="shrink-0 p-1.5 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="הסר מהלו״ז"
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
  onUpdateTimeBlock, onDeleteTimeBlock,
}: {
  item: Item;
  isLocked: boolean;
  onToggleLock: (id: string) => void;
  onAddTransport?: () => void;
  onDeleteTransport?: () => void;
  onEditTransport?: () => void;
  onUpdateTimeBlock?: (label: string, time: string | undefined) => void;
  onDeleteTimeBlock?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `sched-${item.id}`,
    disabled: isLocked,
  });
  const isTransport = !item.poi && item.id.startsWith('trans_');

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
        className={`flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-2.5 py-1.5 transition-opacity ${isDragging ? 'opacity-40' : ''}`}
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
      ref={setNodeRef}
      style={{
        transform: transform ? CSS.Transform.toString({ ...transform, x: 0 }) : undefined,
        transition,
      }}
      className={`flex items-center gap-2.5 bg-card border rounded-lg px-3 py-2.5 transition-opacity ${
        isLocked ? 'opacity-70' : ''
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
      {item.poi ? (
        <POICard poi={item.poi} level={2} editable onAddTransport={onAddTransport} />
      ) : (
        <>
          <span className="material-symbols-outlined text-base">{item.emoji}</span>
          <div className="flex-1 min-w-0">
            <span className={`text-sm font-medium block truncate ${isLocked ? 'text-muted-foreground' : ''}`}>
              {item.label}
            </span>
            {item.sublabel && (
              <span className="text-xs text-muted-foreground truncate block">{item.sublabel}</span>
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
                onClick={onEditTransport}
                className="p-1 rounded text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
              >
                <Pencil size={13} />
              </button>
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

function TimeBlockSectionHeader({ item, canDelete, onUpdate, onDelete }: {
  item: Item;
  canDelete?: boolean;
  onUpdate: (label: string, time: string | undefined) => void;
  onDelete: () => void;
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
    <div className="flex items-center gap-1 py-0.5 px-1">
      <span className="text-[10px] font-semibold tracking-widest text-primary/80 uppercase flex-1">{item.label}</span>
      {item.time && (
        <span className="text-[10px] text-primary/50 font-mono shrink-0">{item.time}</span>
      )}
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
  );
}

// ─── Group frame ───────────────────────────────────────────────────────────────

function GroupFrame({ group, label, lockedIds, onToggleLock, onAddTransport, onDeleteTransport, onEditTransport, onUpdateTimeBlock, onDeleteTimeBlock, canDelete, onRenameGroup, onDeleteGroup }: {
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

  return (
    <div
      ref={setFrameRef}
      className={`rounded-lg transition-colors ${isOver ? 'ring-2 ring-primary/40 bg-primary/5' : ''}`}
    >
      {timeBlockItem ? (
        <TimeBlockSectionHeader
          item={timeBlockItem}
          canDelete={canDelete}
          onUpdate={(lbl, t) => onUpdateTimeBlock?.(timeBlockItem.id, lbl, t)}
          onDelete={() => onDeleteTimeBlock?.(timeBlockItem.id)}
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
        <div className="flex items-center gap-1 py-0.5 px-1">
          <span className="text-[10px] font-semibold tracking-widest text-primary/70 uppercase flex-1">{label}</span>
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
      )}

      <SortableContext
        items={contentItems.map(i => `sched-${i.id}`)}
        strategy={verticalListSortingStrategy}
      >
        <div className={`space-y-1 ${contentItems.length > 0 ? 'mt-0.5' : ''}`}>
          {contentItems.length === 0 && isOver && (
            <p className="text-xs text-center py-2 text-primary/60">שחרר כאן</p>
          )}
          {contentItems.map(item => {
            // Extract transport id from "trans_<transportId>_<segmentId>"
            const transportId = item.id.startsWith('trans_')
              ? item.id.replace(/^trans_/, '').replace(/_[^_]+$/, '')
              : undefined;
            return (
              <SortableScheduledItem
                key={item.id}
                item={item}
                isLocked={lockedIds.has(item.id)}
                onToggleLock={onToggleLock}
                onAddTransport={item.poi ? () => onAddTransport?.(item.poi!.id) : undefined}
                onDeleteTransport={transportId ? () => onDeleteTransport?.(transportId) : undefined}
                onEditTransport={transportId ? () => onEditTransport?.(transportId) : undefined}
              />
            );
          })}
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
            ? 'h-7 border border-dashed border-primary/30'
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
      className={`border-2 rounded-xl p-3 transition-all ${
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

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function DndTestPage() {
  const { activeTrip, tripSitesHierarchy } = useActiveTrip();
  const { pois, addPOI, updatePOI } = usePOI();
  const { transportation, deleteTransportation } = useTransport();
  const { itineraryDays, setItineraryDays, addMission, refetchItinerary } = useItinerary();
  const [selectedDayNum, setSelectedDayNum] = useState(1);
  const [addTransportOpen, setAddTransportOpen] = useState(false);
  const [transportFromName, setTransportFromName] = useState('');
  const [transportToName, setTransportToName] = useState('');
  const [editTransportId, setEditTransportId] = useState<string | null>(null);
  const [addingTimeBlock, setAddingTimeBlock] = useState(false);
  const [newTbLabel, setNewTbLabel] = useState('');
  const [newTbTime, setNewTbTime] = useState('');

  const tripDays = useMemo(() => {
    if (!activeTrip) return [];
    return eachDayOfInterval({
      start: parseISO(activeTrip.startDate),
      end: parseISO(activeTrip.endDate),
    });
  }, [activeTrip?.startDate, activeTrip?.endDate]);

  const locationSpans = useMemo(() => {
    if (tripDays.length === 0) return [];
    const spans: { location: string; startIdx: number; endIdx: number }[] = [];
    for (let i = 0; i < tripDays.length; i++) {
      const itDay = itineraryDays.find(d => d.dayNumber === i + 1);
      const loc = itDay?.locationContext || '';
      if (loc && spans.length > 0 && spans[spans.length - 1].location === loc && spans[spans.length - 1].endIdx === i - 1) {
        spans[spans.length - 1].endIdx = i;
      } else if (loc) {
        spans.push({ location: loc, startIdx: i, endIdx: i });
      }
    }
    return spans;
  }, [tripDays, itineraryDays]);

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
      const day = tripDays[selectedDayNum - 1];
      itDay = await createItineraryDay({
        tripId: activeTrip.id,
        dayNumber: selectedDayNum,
        date: day ? format(day, 'yyyy-MM-dd') : undefined,
        locationContext: '',
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

  const handleAddTimeBlock = useCallback(async () => {
    if (!newTbLabel.trim()) return;
    let itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay && activeTrip) {
      const day = tripDays[selectedDayNum - 1];
      itDay = await createItineraryDay({
        tripId: activeTrip.id,
        dayNumber: selectedDayNum,
        date: day ? format(day, 'yyyy-MM-dd') : undefined,
        locationContext: '',
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
    const updatedActivities = [...itDay.activities, newActivity];
    setItineraryDays(itineraryDays.map(d => d.id === itDay!.id ? { ...d, activities: updatedActivities } : d));
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
    setNewTbLabel('');
    setNewTbTime('');
    setAddingTimeBlock(false);
    await refreshDays();
  }, [newTbLabel, newTbTime, selectedDayNum, tripDays, itineraryDays, activeTrip, setItineraryDays, refreshDays]);

  const handleUpdateTimeBlock = useCallback(async (itemId: string, label: string, time: string | undefined) => {
    const activityId = itemId.replace('tblock_', '');
    const itDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
    if (!itDay) return;
    const updatedActivities = itDay.activities.map(a =>
      a.id === activityId
        ? { ...a, label, time_window: time ? { start: time } : undefined }
        : a,
    );
    setItineraryDays(itineraryDays.map(d => d.id === itDay.id ? { ...d, activities: updatedActivities } : d));
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
    await refreshDays();
  }, [selectedDayNum, itineraryDays, setItineraryDays, refreshDays]);

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

    const updatedActivities = [...itDay.activities, newActivity];
    setItineraryDays(itineraryDays.map(d => d.id === itDay!.id ? { ...d, activities: updatedActivities } : d));
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
    await refreshDays();
  }, [selectedDayNum, itineraryDays, setItineraryDays, refreshDays]);

  const updateLocationContext = useCallback(async () => {
    const totalDays = 1 + locationDaysForward;
    for (let i = 0; i < totalDays; i++) {
      const dayNum = selectedDayNum + i;
      if (dayNum > tripDays.length) break;
      let targetDay = itineraryDays.find(d => d.dayNumber === dayNum);
      if (!targetDay && activeTrip) {
        const day = tripDays[dayNum - 1];
        targetDay = await createItineraryDay({
          tripId: activeTrip.id,
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
  }, [locationContext, locationDaysForward, selectedDayNum, tripDays, itineraryDays, activeTrip, refreshDays]);

  // ── Accommodation (mirrors Index.tsx) ───────────────────────────────────────
  const currentItDay = useMemo(
    () => itineraryDays.find(d => d.dayNumber === selectedDayNum) ?? null,
    [itineraryDays, selectedDayNum],
  );

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

  // Actual location of the current day — for DaySection suggestions (not the edit buffer)
  const currentDayLocation = currentItDay?.locationContext ?? '';

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
        const day = tripDays[dayNum - 1];
        targetDay = await createItineraryDay({
          tripId: activeTrip.id,
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
    const poi = pois.find(p => p.id === entityId);
    if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
      await updatePOI({ ...poi, status: 'matched' });
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
          tripId: activeTrip.id,
          title: `להזמין: ${data.name}`,
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
    if (!currentItDay) return;
    const existing = currentItDay.activities;
    if (existing.some(a => a.id === entityId)) return;
    await updateItineraryDay(currentItDay.id, {
      activities: [...existing, { order: existing.length + 1, type: 'poi' as const, id: entityId }],
    });
    const poi = pois.find(p => p.id === entityId);
    if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
      await updatePOI({ ...poi, status: 'matched' });
    }
    await refreshDays();
  }, [currentItDay, pois, updatePOI, refreshDays]);

  const removeActivity = useCallback(async (entityId: string) => {
    if (!currentItDay) return;
    await updateItineraryDay(currentItDay.id, {
      activities: currentItDay.activities.filter(a => a.id !== entityId),
    });
    const poi = pois.find(p => p.id === entityId);
    if (poi && poi.status === 'matched') {
      await updatePOI({ ...poi, status: 'candidate' });
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
          tripId: activeTrip.id,
          title: `להזמין: ${data.name}`,
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
    itDay.activities
      .filter(a => a.type === 'poi')
      .forEach(a => {
        const poi = pois.find(p => p.id === a.id);
        if (!poi) return;
        // time: prefer itinerary time_window, fallback to POI booking hour
        const bookingHour = poi.details?.booking?.reservation_hour;
        const time = a.time_window?.start ?? bookingHour ?? undefined;
        const item: Item = {
          id: a.id,
          label: poi.name,
          emoji: getSubCategoryEntry(poi.subCategory)?.icon || categoryEmoji(poi.category),
          time,
          sublabel: [poi.subCategory, poi.location?.city].filter(Boolean).join(' · '),
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
        label: a.label || 'חלון זמן',
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
          remark: transport.booking ? 'הזמין מראש' : undefined,
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
  }, [selectedDayNum, itineraryDays, pois, transportation, resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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
      .filter(a => !handledIds.has(a.id))
      .forEach(a => updatedActivities.push(a));

    // Update context in-memory so useEffect reloads correctly on day switch
    setItineraryDays(itineraryDays.map(d =>
      d.id === itDay.id ? { ...d, activities: updatedActivities } : d,
    ));

    // Persist to DB
    await updateItineraryDay(itDay.id, { activities: updatedActivities });
  }, [selectedDayNum, itineraryDays, setItineraryDays]);

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

      const sourceDay = itineraryDays.find(d => d.dayNumber === selectedDayNum);
      const targetDay = itineraryDays.find(d => d.dayNumber === targetDayNum);
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

  return (
    <AppLayout>
      <div className="flex flex-col gap-3 w-full px-4 h-full" dir="rtl">

        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          {/* ── Day pills + Location strip (sticky, never scrolls) ── */}
          {tripDays.length > 0 ? (
            <ScrollArea className="w-full shrink-0 pb-1">
              <div className="flex gap-2 pb-1">
                {tripDays.map((day, idx) => {
                  const dayNum = idx + 1;
                  const itDay = itineraryDays.find(d => d.dayNumber === dayNum);
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
          {activeTrip && editingLocation && (
            <div className="w-full sm:w-80">
              <LocationContextPicker
                countries={activeTrip.countries}
                value={locationContext}
                onChange={setLocationContext}
                daysForward={locationDaysForward}
                onDaysForwardChange={setLocationDaysForward}
                maxDaysForward={tripDays.length - selectedDayNum}
                onSave={updateLocationContext}
                onCancel={() => { setEditingLocation(false); setLocationDaysForward(0); }}
                extraHierarchy={tripSitesHierarchy}
              />
            </div>
          )}

          {/* ── Scrollable content area ─────────────────────── */}
          <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] gap-4 md:h-full md:[grid-template-rows:minmax(0,1fr)]">

            {/* ── Right column: Potential + Add activity ─────── */}
            <div className="space-y-3 md:overflow-y-auto md:min-h-0">
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
                addLabel="הוסף פעילות"
                locationContext={currentDayLocation}
                countries={activeTrip?.countries}
                extraHierarchy={tripSitesHierarchy}
                showBookingMissionOption
              />
            </div>

            {/* ── Left column: Timeline (wake up → schedule → sleep) — scrolls independently on desktop */}
            <div className="space-y-3 md:overflow-y-auto md:min-h-0 pb-4">

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
                        <div className="absolute right-1.5 top-[8px] w-2 h-2 rounded-full bg-orange-400 pointer-events-none z-10" />
                        <div className="pr-6">
                          <GroupFrame
                            group={group}
                            label={groupLabel(groups, gi)}
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
                      placeholder="שם החלון (למשל: ביקור בעיר)"
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
                    הוסף חלון זמן
                  </button>
                )}
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
                  countries={activeTrip?.countries}
                  extraHierarchy={tripSitesHierarchy}
                />
              </div>

            </div>
            {/* end left column */}

          </div>
          {/* end two-column grid */}
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
                  </>
                )}
              </div>
            )}
          </DragOverlay>
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
    </AppLayout>
  );
}
