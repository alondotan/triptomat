import {
  BedDouble,
  UtensilsCrossed,
  Landmark,
  Wrench,
  CalendarDays,
  User,
  Plane,
  Train,
  Bus,
  Car,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { MentionItem, MentionItemType } from './useAtMention';

const TYPE_META: Record<MentionItemType, { label: string; color: string }> = {
  accommodation: { label: 'מלון',      color: 'bg-blue-100 text-blue-700' },
  eatery:        { label: 'מסעדה',     color: 'bg-orange-100 text-orange-700' },
  attraction:    { label: 'אטרקציה',   color: 'bg-green-100 text-green-700' },
  service:       { label: 'שירות',     color: 'bg-gray-100 text-gray-700' },
  event:         { label: 'אירוע',     color: 'bg-purple-100 text-purple-700' },
  contact:       { label: 'איש קשר',   color: 'bg-pink-100 text-pink-700' },
  transport:     { label: 'תחבורה',    color: 'bg-cyan-100 text-cyan-700' },
};

const TRANSPORT_CATEGORIES_PLANE = new Set([
  'airplane', 'domesticFlight', 'internationalFlight',
]);
const TRANSPORT_CATEGORIES_TRAIN = new Set([
  'train', 'nightTrain', 'highSpeedTrain', 'subway', 'tram', 'cableCar', 'funicular',
]);
const TRANSPORT_CATEGORIES_BUS = new Set([
  'bus', 'ferry', 'cruise', 'cruiseShip', 'boatTaxi',
]);

function TypeIcon({ type, transportCategory }: { type: MentionItemType; transportCategory?: string }) {
  const size = 13;
  switch (type) {
    case 'accommodation': return <BedDouble size={size} />;
    case 'eatery':        return <UtensilsCrossed size={size} />;
    case 'attraction':    return <Landmark size={size} />;
    case 'service':       return <Wrench size={size} />;
    case 'event':         return <CalendarDays size={size} />;
    case 'contact':       return <User size={size} />;
    case 'transport': {
      if (transportCategory && TRANSPORT_CATEGORIES_PLANE.has(transportCategory)) return <Plane size={size} />;
      if (transportCategory && TRANSPORT_CATEGORIES_TRAIN.has(transportCategory)) return <Train size={size} />;
      if (transportCategory && TRANSPORT_CATEGORIES_BUS.has(transportCategory))   return <Bus size={size} />;
      return <Car size={size} />;
    }
  }
}

interface AtMentionMenuProps {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
}

export function AtMentionMenu({ items, selectedIndex, onSelect }: AtMentionMenuProps) {
  if (items.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 z-50 rounded-xl border bg-popover shadow-lg overflow-hidden">
      <ul className="py-1 max-h-56 overflow-y-auto">
        {items.map((item, idx) => {
          const meta = TYPE_META[item.type];
          const transportCategory =
            item.type === 'transport'
              ? (item.entity as import('@/types/trip').Transportation).category
              : undefined;

          return (
            <li
              key={item.id}
              className={cn(
                'flex items-center gap-2.5 px-3 py-1.5 cursor-pointer select-none',
                idx === selectedIndex ? 'bg-accent' : 'hover:bg-accent/60',
              )}
              onMouseDown={e => {
                // mousedown fires before blur so we prevent blur from closing the input
                e.preventDefault();
                onSelect(item);
              }}
            >
              {/* type icon */}
              <span className={cn('flex items-center justify-center w-6 h-6 rounded-md shrink-0', meta.color)}>
                <TypeIcon type={item.type} transportCategory={transportCategory} />
              </span>

              {/* name + subtitle */}
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{item.name}</span>
                {item.subtitle && (
                  <span className="block text-xs text-muted-foreground truncate">{item.subtitle}</span>
                )}
              </span>

              {/* type badge */}
              <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium', meta.color)}>
                {meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
