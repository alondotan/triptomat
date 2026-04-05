import type { DraftPlace } from '@/types/itineraryDraft';

export const CATEGORY_MAP: Record<string, DraftPlace['category']> = {
  accommodation: 'accommodation',
  eatery: 'eatery',
  attraction: 'attraction',
  service: 'service',
  event: 'event',
  // Enum group names (capitalized) used in newer tool schema
  Activities: 'attraction',
  Eateries: 'eatery',
  Accommodations: 'accommodation',
  Events: 'event',
  Transportation: 'service',
};
