import { useTranslation } from 'react-i18next';
import { MapPin, Utensils, Hotel, Wrench, ChevronDown, ChevronRight, Globe } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { useState, useMemo } from 'react';
import type { DraftDay } from '@/types/itineraryDraft';
import type { SelectedLevel } from '@/features/home/panelItems';
import { SubCategoryIcon } from '@/shared/components/SubCategoryIcon';

export interface ItineraryTreeProps {
  days: DraftDay[];
  className?: string;
  /** Format date string for display. Receives DraftDay.date (ISO string). */
  formatDate?: (date: string) => string;
  /** Text shown when no days are provided */
  emptyText?: string;
  /** Highlighted place name (cross-panel selection) */
  selectedName?: string | null;
  /** Called when a place row is clicked */
  onSelectName?: (name: string | null) => void;
  /** Currently selected tree level (drives map + objects list filtering) */
  selectedLevel?: SelectedLevel;
  /** Called when a level row is clicked */
  onSelectLevel?: (level: SelectedLevel) => void;
  /** Trip name shown as the root row */
  tripName?: string;
  /** When true, skips the Day level and shows places directly under Location */
  hideDayLevel?: boolean;
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
 * Supports level selection: clicking trip/location/day rows updates the selected level,
 * which drives filtering of the map and objects list panels.
 */
export function ItineraryTree({ days, className, formatDate, emptyText, selectedName, onSelectName, selectedLevel, onSelectLevel, tripName, hideDayLevel }: ItineraryTreeProps) {
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

  const isTripSelected = selectedLevel?.type === 'trip';

  return (
    <div className={cn('space-y-1', className)}>
      {/* Trip root row */}
      {tripName && (
        <button
          onClick={() => onSelectLevel?.({ type: 'trip' })}
          className={cn(
            'flex items-center gap-1.5 w-full text-left py-1.5 px-1 rounded transition-colors',
            isTripSelected
              ? 'bg-primary/10 ring-1 ring-primary/20'
              : 'hover:bg-muted/50',
          )}
        >
          <Globe size={12} className="text-primary shrink-0" />
          <span className="text-xs font-semibold text-foreground truncate">{tripName}</span>
        </button>
      )}

      {locationSpans.map((span, spanIdx) => {
        const isLocationCollapsed = collapsedLocations.has(spanIdx);
        const isLocationSelected = selectedLevel?.type === 'location' && selectedLevel.name === span.location;

        return (
          <div key={spanIdx} className="mb-1">
            {/* Location header */}
            {span.location ? (
              <div
                onClick={() => onSelectLevel?.({ type: 'location', name: span.location })}
                className={cn(
                  'flex items-center gap-1.5 w-full text-left py-1.5 px-1 rounded transition-colors cursor-pointer',
                  isLocationSelected
                    ? 'bg-primary/10 ring-1 ring-primary/20'
                    : 'hover:bg-muted/50',
                )}
              >
                {/* Chevron handles collapse only */}
                <span
                  onClick={e => { e.stopPropagation(); toggleLocation(spanIdx); }}
                  className="shrink-0 p-0.5 rounded hover:bg-muted/70"
                >
                  {isLocationCollapsed
                    ? <ChevronRight size={14} className="text-muted-foreground" />
                    : <ChevronDown size={14} className="text-muted-foreground" />
                  }
                </span>
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
              </div>
            ) : null}

            {/* Days / Places under this location */}
            {!isLocationCollapsed && (
              <div className={span.location ? 'ms-4' : ''}>
                {hideDayLevel ? (
                  /* Research mode: flat list of places, no Day rows */
                  <div className="space-y-0.5">
                    {span.days.flatMap(day => day.places).map((place, idx) => {
                      const FallbackIcon = CATEGORY_ICONS[place.category] || MapPin;
                      const iconColorClass = place.category === 'eatery' ? 'text-orange-500' :
                        place.category === 'accommodation' ? 'text-blue-500' :
                        place.category === 'service' ? 'text-purple-500' :
                        'text-green-600';
                      const isSelected = selectedName?.toLowerCase() === place.name.toLowerCase();
                      return (
                        <div
                          key={idx}
                          onClick={() => onSelectName?.(isSelected ? null : place.name)}
                          className={cn(
                            'flex items-center gap-2 py-1 px-1.5 rounded text-xs transition-colors',
                            onSelectName ? 'cursor-pointer' : '',
                            isSelected
                              ? 'bg-primary/10 ring-1 ring-primary/30'
                              : 'hover:bg-muted/30',
                          )}
                        >
                          {place.placeType
                            ? <SubCategoryIcon type={place.placeType} size={12} className={cn('shrink-0', iconColorClass)} />
                            : <FallbackIcon size={12} className={cn('shrink-0', iconColorClass)} />
                          }
                          <span className="truncate flex-1 font-medium">{place.name}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  /* Normal mode: Day rows with collapse */
                  span.days.map(day => {
                    const isDayCollapsed = collapsedDays.has(day.dayNumber);
                    const isDaySelected = selectedLevel?.type === 'day' && selectedLevel.dayNumber === day.dayNumber;
                    return (
                      <div key={day.dayNumber} className="mb-0.5">
                        {/* Day header */}
                        <div
                          onClick={() => onSelectLevel?.({ type: 'day', dayNumber: day.dayNumber })}
                          className={cn(
                            'flex items-center gap-1.5 w-full text-left py-1 px-1 rounded transition-colors cursor-pointer',
                            isDaySelected
                              ? 'bg-primary/10 ring-1 ring-primary/20'
                              : 'hover:bg-muted/50',
                          )}
                        >
                          {/* Chevron handles collapse only */}
                          <span
                            onClick={e => { e.stopPropagation(); toggleDay(day.dayNumber); }}
                            className="shrink-0 p-0.5 rounded hover:bg-muted/70"
                          >
                            {isDayCollapsed
                              ? <ChevronRight size={12} className="text-muted-foreground" />
                              : <ChevronDown size={12} className="text-muted-foreground" />
                            }
                          </span>
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
                        </div>

                        {/* Places */}
                        {!isDayCollapsed && (
                          <div className="ms-5 space-y-0.5">
                            {day.places.map((place, idx) => {
                              const FallbackIcon = CATEGORY_ICONS[place.category] || MapPin;
                              const iconColorClass = place.category === 'eatery' ? 'text-orange-500' :
                                place.category === 'accommodation' ? 'text-blue-500' :
                                place.category === 'service' ? 'text-purple-500' :
                                'text-green-600';
                              const isSelected = selectedName?.toLowerCase() === place.name.toLowerCase();
                              return (
                                <div
                                  key={idx}
                                  onClick={() => onSelectName?.(isSelected ? null : place.name)}
                                  className={cn(
                                    'flex items-center gap-2 py-1 px-1.5 rounded text-xs transition-colors',
                                    onSelectName ? 'cursor-pointer' : '',
                                    isSelected
                                      ? 'bg-primary/10 ring-1 ring-primary/30'
                                      : 'hover:bg-muted/30',
                                  )}
                                >
                                  {place.placeType
                                    ? <SubCategoryIcon type={place.placeType} size={12} className={cn('shrink-0', iconColorClass)} />
                                    : <FallbackIcon size={12} className={cn('shrink-0', iconColorClass)} />
                                  }
                                  <span className="truncate flex-1 font-medium">{place.name}</span>
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
                  })
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
