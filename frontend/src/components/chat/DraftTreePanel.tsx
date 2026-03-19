import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MapPin, Utensils, Hotel, Wrench, Sparkles, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import type { DraftDay } from '@/types/itineraryDraft';

interface DraftTreePanelProps {
  draft: DraftDay[];
  isDirty: boolean;
  applying: boolean;
  onApply: () => void;
  onClear: () => void;
}

const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  attraction: MapPin,
  eatery: Utensils,
  accommodation: Hotel,
  service: Wrench,
};

export function DraftTreePanel({ draft, isDirty, applying, onApply, onClear }: DraftTreePanelProps) {
  const { t } = useTranslation();
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());

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

          {draft.map(day => {
            const isCollapsed = collapsedDays.has(day.dayNumber);
            return (
              <div key={day.dayNumber} className="mb-1">
                {/* Day header */}
                <button
                  onClick={() => toggleDay(day.dayNumber)}
                  className="flex items-center gap-1.5 w-full text-left py-1.5 px-1 rounded hover:bg-muted/50 transition-colors"
                >
                  {isCollapsed
                    ? <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                    : <ChevronDown size={14} className="text-muted-foreground shrink-0" />
                  }
                  <span className="text-xs font-semibold text-foreground">
                    {t('aiChat.dayLabel', { n: day.dayNumber })}
                  </span>
                  {day.locationContext && (
                    <span className="text-xs text-muted-foreground truncate">
                      — {day.locationContext}
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ms-auto shrink-0">
                    {day.places.length}
                  </span>
                </button>

                {/* Places */}
                {!isCollapsed && (
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
        <Button
          size="sm"
          className="text-xs h-7 gap-1 ms-auto"
          onClick={onApply}
          disabled={!isDirty || draft.length === 0 || applying}
        >
          <Sparkles size={12} /> {t('aiChat.updateTrip')}
        </Button>
      </div>
    </div>
  );
}
