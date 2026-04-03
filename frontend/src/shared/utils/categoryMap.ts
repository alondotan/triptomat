import type { DraftPlace } from '@/types/itineraryDraft';

export const CATEGORY_MAP: Record<string, DraftPlace['category']> = {
  accommodation: 'accommodation',
  eatery: 'eatery',
  attraction: 'attraction',
  service: 'service',
  event: 'event',
};
