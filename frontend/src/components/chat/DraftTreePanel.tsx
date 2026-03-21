import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Utensils, Hotel, Wrench, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState, useMemo } from 'react';
import type { DraftDay } from '@/types/itineraryDraft';

interface DraftTreePanelProps {
  draft: DraftDay[];
  applying: boolean;
  onClear: () => void;
}

const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  attraction: MapPin,
  eatery: Utensils,
  accommodation: Hotel,
  service: Wrench,
};

export function DraftTreePanel({ draft, applying, onClear }: DraftTreePanelProps) {
  const { t } = useTranslation();
  const [collapsedLocations, setCollapsedLocations] = useState<Set<number>>(new Set());
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());

  // Group consecutive days by locationContext into spans
  const locationSpans = useMemo(() => {
    const spans: { location: string; days: DraftDay[] }[] = [];
    for (const day of draft) {
      const loc = day.locationContext || '';
      if (spans.length > 0 && spans[spans.length - 1].location === loc) {
        spans[spans.length - 1].days.push(day);
      } else {
        spans.push({ location: loc, days: [day] });
      }
    }
    return spans;
  }, [draft]);

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-sm font-medium text-foreground">{t('aiChat.planTitle')}</h3>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-2 space-y-1">
          {draft.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-8">
              {t('aiChat.draftEmpty')}
            </p>
          )}

          {locationSpans.map((span, spanIdx) => {
            const isLocationCollapsed = collapsedLocations.has(spanIdx);
            const totalPlaces = span.days.reduce((sum, d) => sum + d.places.length, 0);

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
      </ScrollArea>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-border shrink-0 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 gap-1 text-muted-foreground"
          onClick={onClear}
          disabled={draft.length === 0 || applying}
        >
          <Trash2 size={12} /> {t('aiChat.clearDraft')}
        </Button>
      </div>
    </div>
  );
}
