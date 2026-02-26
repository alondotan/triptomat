import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  MapPin,
  Map,
  Plane,
  Hotel,
  MoreHorizontal,
  Star,
  Table2,
  DollarSign,
  CheckSquare,
} from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';

const primaryItems = [
  { path: '/', label: 'Timeline', icon: CalendarDays },
  { path: '/pois', label: 'POIs', icon: MapPin },
  { path: '/map', label: 'Map', icon: Map },
  { path: '/transport', label: 'Transport', icon: Plane },
  { path: '/accommodation', label: 'Stay', icon: Hotel },
];

const moreItems = [
  { path: '/recommendations', label: 'Recommendations', icon: Star },
  { path: '/itinerary', label: 'Itinerary', icon: Table2 },
  { path: '/budget', label: 'Budget', icon: DollarSign },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
];

export function MobileBottomNav() {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some(item => location.pathname === item.path);

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-stretch h-16">
          {primaryItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <RouterNavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} />
                <span className="whitespace-nowrap">{item.label}</span>
              </RouterNavLink>
            );
          })}

          <button
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              isMoreActive ? 'text-primary' : 'text-muted-foreground'
            )}
          >
            <MoreHorizontal size={22} strokeWidth={1.8} />
            <span className="whitespace-nowrap">More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="px-0 pb-safe rounded-t-2xl">
          <div className="flex flex-col gap-1 py-4">
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <RouterNavLink
                  key={item.path}
                  to={item.path}
                  onClick={() => setMoreOpen(false)}
                  className={cn(
                    'flex items-center gap-4 px-6 py-3 text-base font-medium transition-colors',
                    isActive
                      ? 'text-primary bg-primary/5'
                      : 'text-foreground hover:bg-muted'
                  )}
                >
                  <Icon size={20} />
                  {item.label}
                </RouterNavLink>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
