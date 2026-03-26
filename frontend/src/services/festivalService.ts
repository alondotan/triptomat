import { createOrMergePOI } from './poiService';
import type { PointOfInterest } from '@/types/trip';

// ── Festival JSON types ─────────────────────────

interface FestivalInfo {
  description?: string;
  name_he?: string;
  typical_months?: number[];
  location_ids?: string[];
}

interface FestivalHoliday {
  name: string;
  local_name?: string;
  type: string;          // national_holiday, religious_holiday, etc.
  fixed_date: boolean;
  date?: string;         // MM-DD for fixed
  dates?: Record<string, string>; // year → ISO date for variable
  image?: string;
  festival_info?: FestivalInfo; // present when holiday is also a festival
}

interface CulturalFestival {
  name: string;
  name_he?: string;
  type: string;          // cultural_festival, festival, etc.
  description?: string;
  typical_months?: number[];
  location_ids?: string[];
  image?: string;
}

export interface FestivalData {
  country: string;
  country_he: string;
  country_id: string;
  country_code: string;
  years: number[];
  stats: { public_holidays: number; cultural_festivals: number; total: number };
  public_holidays: FestivalHoliday[];
  cultural_festivals: CulturalFestival[];
}

// ── Loading ─────────────────────────────────────

const festivalCache = new Map<string, FestivalData | null>();

export async function loadFestivalData(countryName: string): Promise<FestivalData | null> {
  if (festivalCache.has(countryName)) return festivalCache.get(countryName)!;

  try {
    const res = await fetch(`https://triptomat-media.s3.eu-central-1.amazonaws.com/geodata/countries_festivals/${encodeURIComponent(countryName)}.json`);
    if (!res.ok) {
      festivalCache.set(countryName, null);
      return null;
    }
    const data: FestivalData = await res.json();
    festivalCache.set(countryName, data);
    return data;
  } catch {
    festivalCache.set(countryName, null);
    return null;
  }
}

// ── Date resolution ─────────────────────────────

function resolveTripYear(startDate?: string): number | null {
  if (!startDate) return null;
  return new Date(startDate).getFullYear();
}

function resolveHolidayDate(holiday: FestivalHoliday, year: number | null): string | undefined {
  if (holiday.fixed_date && holiday.date && year) {
    return `${year}-${holiday.date}`;
  }
  if (!holiday.fixed_date && holiday.dates && year) {
    return holiday.dates[String(year)];
  }
  return undefined;
}

// ── Seeding ─────────────────────────────────────

export async function seedTripFestivals(
  tripId: string,
  countries: string[],
  tripStartDate?: string,
): Promise<void> {
  console.log('[seedTripFestivals] Starting seed for trip', tripId, 'countries:', countries);
  const year = resolveTripYear(tripStartDate);

  for (const country of countries) {
    const data = await loadFestivalData(country);
    if (!data) {
      console.log(`[seedTripFestivals] No festival data for "${country}"`);
      continue;
    }

    // Seed public holidays that have festival info (skip plain holidays)
    for (const holiday of data.public_holidays) {
      const fi = holiday.festival_info;
      if (!fi) continue;

      const resolvedDate = resolveHolidayDate(holiday, year);

      const poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'> = {
        tripId,
        category: 'event',
        subCategory: holiday.type,
        name: holiday.name,
        status: 'suggested',
        location: { country: data.country },
        sourceRefs: { email_ids: [], recommendation_ids: [] },
        details: {
          event_details: {
            date: resolvedDate,
            fixed_date: holiday.fixed_date,
            dates_by_year: holiday.dates,
            local_name: holiday.local_name,
            description: fi.description,
            typical_months: fi.typical_months,
            location_ids: fi.location_ids,
          },
        },
        isCancelled: false,
        isPaid: false,
        imageUrl: holiday.image,
      };

      try {
        await createOrMergePOI(poi);
      } catch (e) {
        console.warn(`[seedTripFestivals] Failed to create holiday "${holiday.name}":`, e);
      }
    }

    // Seed cultural festivals
    for (const festival of data.cultural_festivals) {
      const poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'> = {
        tripId,
        category: 'event',
        subCategory: festival.type,
        name: festival.name,
        status: 'suggested',
        location: { country: data.country },
        sourceRefs: { email_ids: [], recommendation_ids: [] },
        details: {
          event_details: {
            typical_months: festival.typical_months,
            description: festival.description,
            local_name: festival.name_he,
            location_ids: festival.location_ids,
          },
        },
        isCancelled: false,
        isPaid: false,
        imageUrl: festival.image,
      };

      try {
        await createOrMergePOI(poi);
      } catch (e) {
        console.warn(`[seedTripFestivals] Failed to create festival "${festival.name}":`, e);
      }
    }

    console.log(`[seedTripFestivals] Seeded ${data.stats.total} events for ${country}`);
  }

  console.log('[seedTripFestivals] Seed completed');
}
