import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  Map,
  MoreHorizontal,
  Table2,
  DollarSign,
  CheckSquare,
  FileText,
  LayoutDashboard,
} from 'lucide-react';
import { useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';

const primaryItems = [
  { path: '/overview', labelKey: 'nav.home', icon: LayoutDashboard },
  { path: '/', labelKey: 'nav.timeline', icon: CalendarDays },
  { path: '/map', labelKey: 'nav.map', icon: Map },
];

const moreItems = [
  { path: '/itinerary', labelKey: 'nav.itinerary', icon: Table2 },
  { path: '/budget', labelKey: 'nav.budget', icon: DollarSign },
  { path: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
  { path: '/documents', labelKey: 'nav.docs', icon: FileText },
];

export function MobileBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive = moreItems.some(item => location.pathname === item.path);

  return (
    <>
      <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
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
                <Icon size={22} strokeWidth={isActive ? 2.5 : 1.8} aria-hidden="true" />
                <span className="whitespace-nowrap">{t(item.labelKey)}</span>
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
            <span className="whitespace-nowrap">{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="px-0 pb-safe rounded-t-2xl overscroll-contain">
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
                  <Icon size={20} aria-hidden="true" />
                  {t(item.labelKey)}
                </RouterNavLink>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
