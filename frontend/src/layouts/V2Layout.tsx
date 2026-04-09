import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { V2ModeProvider } from '@/context/V2ModeContext';

interface NavItem {
  label: string;
  icon: string;
  href: string;
}

// Bottom nav (mobile, max 5)
const BOTTOM_NAV: NavItem[] = [
  { label: 'Home',     icon: 'home',           href: '/v2' },
  { label: 'Schedule', icon: 'calendar_today', href: '/v2/schedule' },
  { label: 'Explore',  icon: 'auto_awesome',   href: '/v2/recommendations' },
  { label: 'Budget',   icon: 'payments',       href: '/v2/budget' },
  { label: 'More',     icon: 'menu',           href: '/v2/more' },
];

// Full nav (desktop sidebar + mobile menu)
const NAV_ITEMS: NavItem[] = [
  { label: 'Home',          icon: 'home',              href: '/v2' },
  { label: 'Schedule',      icon: 'calendar_today',    href: '/v2/schedule' },
  { label: 'Itinerary',     icon: 'route',             href: '/v2/itinerary' },
  { label: 'Explore',       icon: 'auto_awesome',      href: '/v2/recommendations' },
  { label: 'Attractions',   icon: 'attractions',       href: '/v2/attractions' },
  { label: 'Eateries',      icon: 'restaurant',        href: '/v2/eateries' },
  { label: 'Hotels',        icon: 'hotel',             href: '/v2/accommodation' },
  { label: 'Transport',     icon: 'directions_car',    href: '/v2/transport' },
  { label: 'Budget',        icon: 'payments',          href: '/v2/budget' },
  { label: 'Inbox',         icon: 'inbox',             href: '/v2/inbox' },
  { label: 'Tasks',         icon: 'checklist',         href: '/v2/tasks' },
  { label: 'Research',      icon: 'bookmark',          href: '/v2/sources' },
  { label: 'Documents',     icon: 'folder',            href: '/v2/documents' },
  { label: 'Contacts',      icon: 'contacts',          href: '/v2/contacts' },
  { label: 'Map',           icon: 'map',               href: '/v2/map' },
  { label: 'Weather',       icon: 'partly_cloudy_day', href: '/v2/weather' },
  { label: 'Trips',         icon: 'luggage',           href: '/v2/trips' },
];

export function V2Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { activeTrip } = useActiveTrip();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/v2' ? location.pathname === '/v2' : location.pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-v2-background text-v2-on-surface font-manrope">

      {/* ── Top App Bar ── */}
      <header className="sticky top-0 z-50 bg-v2-surface-container-lowest/80 backdrop-blur-xl border-b border-v2-outline-variant/20 shadow-sm">
        <div className="flex items-center justify-between px-4 md:px-6 h-16 max-w-7xl mx-auto">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-v2-primary">explore</span>
            <h1 className="text-lg font-bold bg-gradient-to-r from-v2-primary to-sky-400 bg-clip-text text-transparent font-plus-jakarta tracking-tight">
              Triptomat
            </h1>
          </div>

          {/* Desktop nav links */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.slice(0, 5).map((item) => (
              <Link
                key={item.href}
                to={item.href}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                  isActive(item.href)
                    ? 'bg-v2-primary/10 text-v2-primary'
                    : 'text-v2-on-surface-variant hover:bg-v2-surface-container hover:text-v2-on-surface'
                }`}
              >
                <span
                  className="material-symbols-outlined text-[18px]"
                  style={{ fontVariationSettings: isActive(item.href) ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right actions */}
          <div className="flex items-center gap-2">
            {activeTrip && (
              <span className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-v2-on-surface-variant bg-v2-surface-container px-3 py-1.5 rounded-full">
                <span className="material-symbols-outlined text-sm">flight_takeoff</span>
                {activeTrip.name}
              </span>
            )}
            <button className="p-2 rounded-full hover:bg-v2-surface-container transition-colors">
              <span className="material-symbols-outlined text-v2-on-surface-variant">search</span>
            </button>
            {/* Switch back to V1 */}
            <Link
              to="/"
              className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-v2-on-surface-variant bg-v2-surface-container hover:bg-v2-surface-container-high transition-colors"
            >
              <span className="material-symbols-outlined text-sm">switch_left</span>
              V1
            </Link>
            {/* Mobile menu toggle */}
            <button
              className="md:hidden p-2 rounded-full hover:bg-v2-surface-container transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              <span className="material-symbols-outlined text-v2-on-surface-variant">
                {mobileMenuOpen ? 'close' : 'menu'}
              </span>
            </button>
          </div>
        </div>

        {/* Mobile slide-down menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-v2-surface-container-lowest border-t border-v2-outline-variant/20 px-4 py-3 space-y-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  isActive(item.href)
                    ? 'bg-v2-primary/10 text-v2-primary'
                    : 'text-v2-on-surface-variant hover:bg-v2-surface-container'
                }`}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontVariationSettings: isActive(item.href) ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                {item.label}
              </Link>
            ))}
            <Link
              to="/"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-v2-on-surface-variant hover:bg-v2-surface-container"
            >
              <span className="material-symbols-outlined">switch_left</span>
              Switch to V1
            </Link>
          </div>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="pb-20 md:pb-0">
        {children}
      </main>

      {/* ── Mobile Bottom Navigation ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around items-center px-2 pb-safe pt-2 bg-v2-surface-container-lowest/90 backdrop-blur-2xl rounded-t-3xl z-50 shadow-[0_-4px_24px_rgba(0,0,0,0.06)] border-t border-v2-outline-variant/10">
        {BOTTOM_NAV.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex flex-col items-center justify-center px-3 py-1.5 rounded-2xl min-w-[52px] transition-colors ${
                active ? 'bg-v2-primary/10 text-v2-primary' : 'text-v2-on-surface-variant'
              }`}
            >
              <span
                className="material-symbols-outlined text-[22px]"
                style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="text-[9px] font-bold uppercase tracking-wider mt-0.5 font-plus-jakarta">
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function V2LayoutWithMode({ children }: { children: React.ReactNode }) {
  return (
    <V2ModeProvider>
      <V2Layout>{children}</V2Layout>
    </V2ModeProvider>
  );
}
