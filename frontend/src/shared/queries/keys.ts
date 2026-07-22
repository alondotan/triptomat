/**
 * Centralized query keys for TanStack Query.
 *
 * Convention: `[domain, scope, ...filters]`. Trip-scoped collections always
 * include `tripId` as second segment so a single `invalidateQueries({ queryKey: ['poi', tripId] })`
 * wipes everything for that trip.
 */

export const queryKeys = {
  trips: {
    all: ['trips'] as const,
    list: () => ['trips', 'list'] as const,
    detail: (tripId: string) => ['trips', 'detail', tripId] as const,
    members: (tripId: string) => ['trips', tripId, 'members'] as const,
    locations: (tripId: string) => ['trips', tripId, 'locations'] as const,
    places: (tripId: string) => ['trips', tripId, 'places'] as const,
    collections: (tripId: string) => ['trips', tripId, 'collections'] as const,
  },
  poi: {
    all: (tripId: string) => ['poi', tripId] as const,
    list: (tripId: string) => ['poi', tripId, 'list'] as const,
  },
  transport: {
    all: (tripId: string) => ['transport', tripId] as const,
    list: (tripId: string) => ['transport', tripId, 'list'] as const,
  },
  itinerary: {
    all: (tripId: string) => ['itinerary', tripId] as const,
    days: (tripId: string) => ['itinerary', tripId, 'days'] as const,
  },
  finance: {
    all: (tripId: string) => ['finance', tripId] as const,
    expenses: (tripId: string) => ['finance', tripId, 'expenses'] as const,
    rates: () => ['finance', 'rates'] as const,
  },
  contacts: {
    all: (tripId: string) => ['contacts', tripId] as const,
    list: (tripId: string) => ['contacts', tripId, 'list'] as const,
  },
  documents: {
    all: (tripId: string) => ['documents', tripId] as const,
    list: (tripId: string) => ['documents', tripId, 'list'] as const,
  },
  missions: {
    all: (tripId: string) => ['missions', tripId] as const,
    list: (tripId: string) => ['missions', tripId, 'list'] as const,
  },
  inbox: {
    recommendations: (tripId: string) => ['inbox', tripId, 'recommendations'] as const,
    emails: () => ['inbox', 'emails'] as const,
    webhookToken: () => ['inbox', 'webhook-token'] as const,
  },
  geodata: {
    festivals: (tripId: string) => ['geodata', tripId, 'festivals'] as const,
    weather: (location: string) => ['geodata', 'weather', location] as const,
    resources: (country: string) => ['geodata', 'resources', country] as const,
  },
} as const;
