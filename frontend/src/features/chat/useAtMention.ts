import { useState, useCallback, useRef, useMemo } from 'react';
import { usePOI } from '@/features/poi/POIContext';
import { useItinerary } from '@/features/itinerary/ItineraryContext';
import { useTransport } from '@/features/transport/TransportContext';
import type { PointOfInterest, Contact, Transportation } from '@/types/trip';

export type MentionItemType =
  | 'accommodation'
  | 'eatery'
  | 'attraction'
  | 'service'
  | 'event'
  | 'contact'
  | 'transport';

export interface MentionItem {
  id: string;
  type: MentionItemType;
  name: string;
  /** City, role, or route — shown as secondary line */
  subtitle?: string;
  /** Original entity for context injection */
  entity: PointOfInterest | Contact | Transportation;
}

function getTransportRoute(t: Transportation): string {
  const seg0 = t.segments[0];
  if (!seg0) return t.category;
  const segN = t.segments[t.segments.length - 1];
  const from = seg0.from.address?.city || seg0.from.name;
  const to = segN.to.address?.city || segN.to.name;
  return `${from} → ${to}`;
}

function getTransportName(t: Transportation): string {
  if (t.booking.carrier_name) return t.booking.carrier_name;
  if (t.segments.length > 0) return getTransportRoute(t);
  return t.category;
}

/**
 * Build a compact reference string for a mention.
 * - POIs: just "poi:<id>" — the AI already has full POI data in tripPlan
 * - Contacts / Transport: "type:<id> (<brief details>)" — not in tripPlan, so include essentials
 */
export function buildMentionContext(item: MentionItem): string {
  if (item.type === 'contact') {
    const c = item.entity as Contact;
    const extras: string[] = [];
    if (c.role)  extras.push(c.role);
    if (c.phone) extras.push(c.phone);
    if (c.email) extras.push(c.email);
    return `contact:${c.id}${extras.length ? ` (${extras.join(', ')})` : ''}`;
  }

  if (item.type === 'transport') {
    const t = item.entity as Transportation;
    const route = getTransportRoute(t);
    return `transport:${t.id} (${t.category}, ${route})`;
  }

  // POI — AI already has it in tripPlan
  return `poi:${(item.entity as PointOfInterest).id}`;
}

/** Given a message string, find all @[Name] tokens and return unique names */
export function extractMentionNames(text: string): string[] {
  const matches = text.matchAll(/@\[([^\]]+)\]/g);
  return [...new Set([...matches].map(m => m[1]))];
}

/** Strip @[Name] → Name for clean display in chat history */
export function stripMentionBrackets(text: string): string {
  return text.replace(/@\[([^\]]+)\]/g, '@$1');
}

export function useAtMention() {
  const { pois } = usePOI();
  const { contacts } = useItinerary();
  const { transportation } = useTransport();

  // Build all candidate mention items (memoised so filter is fast)
  const allItems = useMemo<MentionItem[]>(() => [
    ...pois.map<MentionItem>(p => ({
      id: p.id,
      type: p.category as MentionItemType,
      name: p.name,
      subtitle: p.location?.city,
      entity: p,
    })),
    ...contacts.map<MentionItem>(c => ({
      id: c.id,
      type: 'contact',
      name: c.name,
      subtitle: c.role,
      entity: c,
    })),
    ...transportation.map<MentionItem>(t => ({
      id: t.id,
      type: 'transport',
      name: getTransportName(t),
      subtitle: getTransportRoute(t),
      entity: t,
    })),
  ], [pois, contacts, transportation]);

  // null = menu closed; string = current query (may be empty = show all)
  const [query, setQuery] = useState<string | null>(null);
  const [selectedIndex, setSelectedIndex] = useState(0);
  // Cursor position of the `@` character in the input string
  const atStartRef = useRef<number>(-1);

  const filtered = useMemo(() => {
    if (query === null) return [];
    if (!query) return allItems.slice(0, 8);
    const q = query.toLowerCase();
    return allItems.filter(item => item.name.toLowerCase().includes(q)).slice(0, 8);
  }, [query, allItems]);

  const isOpen = query !== null && filtered.length > 0;

  /** Call on every input change — detects `@query` before the cursor */
  const onInputChange = useCallback((value: string, cursorPos: number) => {
    const textBeforeCursor = value.substring(0, cursorPos);
    const match = /@([^\s@]*)$/.exec(textBeforeCursor);
    if (match) {
      atStartRef.current = match.index;
      setQuery(match[1]);
      setSelectedIndex(0);
    } else {
      setQuery(null);
      atStartRef.current = -1;
    }
  }, []);

  /**
   * Replace `@query` in the input with `@[Item Name] ` (bracketed for reliable extraction).
   * Returns the updated input string and the new cursor position.
   */
  const selectItem = useCallback(
    (item: MentionItem, currentInput: string, cursorPos: number): { newInput: string; newCursor: number } => {
      const before = currentInput.substring(0, atStartRef.current);
      const after = currentInput.substring(cursorPos);
      const mention = `@[${item.name}] `;
      const newInput = before + mention + after;
      const newCursor = before.length + mention.length;
      setQuery(null);
      atStartRef.current = -1;
      return { newInput, newCursor };
    },
    [],
  );

  const close = useCallback(() => {
    setQuery(null);
    atStartRef.current = -1;
  }, []);

  const navigateUp = useCallback(() => setSelectedIndex(i => Math.max(0, i - 1)), []);
  const navigateDown = useCallback(
    () => setSelectedIndex(i => Math.min(filtered.length - 1, i + 1)),
    [filtered.length],
  );

  /**
   * Given a list of mention names (from extractMentionNames), find matching items
   * and return their context strings.
   */
  const getMentionContextLines = useCallback(
    (names: string[]): string[] =>
      names
        .map(name => allItems.find(item => item.name === name))
        .filter((item): item is MentionItem => !!item)
        .map(item => buildMentionContext(item)),
    [allItems],
  );

  return {
    isOpen,
    filtered,
    selectedIndex,
    query,
    onInputChange,
    selectItem,
    close,
    navigateUp,
    navigateDown,
    getMentionContextLines,
  };
}
