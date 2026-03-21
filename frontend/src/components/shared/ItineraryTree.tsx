import { useTranslation } from 'react-i18next';
import { MapPin, Utensils, Hotel, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import type { DraftDay } from '@/types/itineraryDraft';

export interface ItineraryTreeProps {
  days: DraftDay[];
  className?: string;
  /** Format date string for display. Receives DraftDay.date (ISO string). */
  formatDate?: (date: string) => string;
  /** Text shown when no days are provided */
  emptyText?: string;
}

const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  attraction: MapPin,
  eatery: Utensils,
  accommodation: Hotel,
  service: Wrench,
};

/** Default date formatter: "21/3" style */
function defaultFormatDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

/**
 * Standalone itinerary tree component.
 * Groups consecutive days by location, shows dates when available.
 * Reusable outside the AI chat context.
 */
export function ItineraryTree({ days, className, formatDate, emptyText }: ItineraryTreeProps) {
  const { t } = useTranslation();
  const fmt = formatDate ?? defaultFormatDate;
  const [collapsedLocations, setCollapsedLocations] = useState<Set<number>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());

  // Group consecutive days by locationContext into spans
  const locationSpans = useMemo(() => {
    const spans: { location: string; days: DraftDay[] }[] = [];
    for (const day of days) {
      const loc = day.locationContext || '';
      if (spans.length > 0 && spans[spans.length - 1].location === loc) {
        spans[spans.length - 1].days.push(day);
      } else {
        spans.push({ location: loc, days: [day] });
      }
    }
    return spans;
  }, [days]);

  const toggleLocation = (spanIdx: number) => {
    setCollapsedLocations(prev => {
      const next = new Set(prev);
      if (next.has(spanIdx)) next.delete(spanIdx);
      else next.add(spanIdx);
      return next;
    });
  };

  const toggleDay = (dayNumber: number) => {
    setCollapsedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayNumber)) next.delete(dayNumber);
      else next.add(dayNumber);
      return next;
    });
  };

  if (days.length === 0) {
    return (
      <div className={className}>
        <p className="text-xs text-muted-foreground text-center py-8">
          {emptyText ?? t('aiChat.draftEmpty')}
        </p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-1', className)}>
      {locationSpans.map((span, spanIdx) => {
        const isLocationCollapsed = collapsedLocations.has(spanIdx);

        return (
          <div key={spanIdx} className="mb-1">
            {/* Location header */}
            {span.location ? (
              <button
                onClick={() => toggleLocation(spanIdx)}
                className="flex items-center gap-1.5 w-full text-left py-1.5 px-1 rounded hover:bg-muted/50 transition-colors"
              >
                {isLocationCollapsed
                  ? <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                  : <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                }
                <MapPin size={12} className="text-primary shrink-0" />
                <span className="text-xs font-semibold text-foreground truncate">
                  {span.location}
                </span>
                <span className="text-[10px] text-muted-foreground ms-auto shrink-0">
                  {span.days.length > 1
                    ? t('aiChat.dayRange', { from: span.days[0].dayNumber, to: span.days[span.days.length - 1].dayNumber })
                    : t('aiChat.dayLabel', { n: span.days[0].dayNumber })
                  }
                </span>
              </button>
            ) : null}

            {/* Days under this location */}
            {!isLocationCollapsed && (
              <div className={span.location ? 'ms-4' : ''}>
                {span.days.map(day => {
                  const isDayCollapsed = collapsedDays.has(day.dayNumber);
                  return (
                    <div key={day.dayNumber} className="mb-0.5">
                      {/* Day header */}
                      <button
                        onClick={() => toggleDay(day.dayNumber)}
                        className="flex items-center gap-1.5 w-full text-left py-1 px-1 rounded hover:bg-muted/50 transition-colors"
                      >
                        {isDayCollapsed
                          ? <ChevronRight size={12} className="text-muted-foreground shrink-0" />
                          : <ChevronDown size={12} className="text-muted-foreground shrink-0" />
                        }
                        <span className="text-xs font-medium text-foreground">
                          {t('aiChat.dayLabel', { n: day.dayNumber })}
                        </span>
                        {day.date && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {fmt(day.date)}
                          </span>
                        )}
                        {!span.location && day.locationContext && (
                          <span className="text-xs text-muted-foreground truncate">
                            — {day.locationContext}
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground ms-auto shrink-0">
                          {day.places.length}
                        </span>
                      </button>

                      {/* Places */}
                      {!isDayCollapsed && (
                        <div className="ms-5 space-y-0.5">
                          {day.places.map((place, idx) => {
                            const Icon = CATEGORY_ICONS[place.category] || MapPin;
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-2 py-1 px-1.5 rounded text-xs hover:bg-muted/30"
                              >
                                <Icon size={12} className={cn(
                                  'shrink-0',
                                  place.category === 'eatery' ? 'text-orange-500' :
                                  place.category === 'accommodation' ? 'text-blue-500' :
                                  place.category === 'service' ? 'text-purple-500' :
                                  'text-green-600'
                                )} />
                                <span className="truncate flex-1">{place.name}</span>
                                {place.time && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {place.time}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                          {day.places.length === 0 && (
                            <p className="text-[10px] text-muted-foreground py-1 px-1.5 italic">
                              {t('aiChat.noPlaces')}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
