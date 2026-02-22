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
  Inbox,
  Key,
  LogOut,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { supabase } from '@/integrations/supabase/client';

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
  { path: '/inbox', label: 'Inbox', icon: Inbox },
];

interface MobileBottomNavProps {
  onWebhookOpen: () => void;
}

export function MobileBottomNav({ onWebhookOpen }: MobileBottomNavProps) {
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [inboxUnread, setInboxUnread] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('inbox_unread_count') || '0', 10); } catch { return 0; }
  });

  useEffect(() => {
    const handler = (e: Event) => setInboxUnread((e as CustomEvent).detail.count);
    window.addEventListener('inboxUnreadChanged', handler);
    return () => window.removeEventListener('inboxUnreadChanged', handler);
  }, []);

  const isMoreActive = moreItems.some(item => location.pathname === item.path);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

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
                <span>{item.label}</span>
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
            <div className="relative">
              <MoreHorizontal size={22} strokeWidth={1.8} />
              {inboxUnread > 0 && (
                <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-blue-500 border-2 border-background" />
              )}
            </div>
            <span>More</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="px-0 pb-safe rounded-t-2xl">
          <div className="flex flex-col gap-1 py-4">
            {moreItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              const showBadge = item.path === '/inbox' && inboxUnread > 0;
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
                  <div className="relative">
                    <Icon size={20} />
                    {showBadge && (
                      <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                        {inboxUnread > 9 ? '9+' : inboxUnread}
                      </span>
                    )}
                  </div>
                  {item.label}
                  {showBadge && (
                    <span className="ml-auto inline-flex items-center rounded-full bg-blue-500 px-2 py-0.5 text-xs font-semibold text-white">
                      {inboxUnread}
                    </span>
                  )}
                </RouterNavLink>
              );
            })}
            <div className="mx-6 my-1 border-t border-border" />
            <button
              onClick={() => { onWebhookOpen(); setMoreOpen(false); }}
              className="flex items-center gap-4 px-6 py-3 text-base font-medium text-foreground hover:bg-muted"
            >
              <Key size={20} />
              Webhook URLs
            </button>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-4 px-6 py-3 text-base font-medium text-destructive hover:bg-muted"
            >
              <LogOut size={20} />
              Sign Out
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
