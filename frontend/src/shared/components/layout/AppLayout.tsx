import { ReactNode, useState, useEffect, useLayoutEffect } from 'react';
import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileFAB } from './MobileFAB';
import { DestinationHero, HERO_HEIGHT, HERO_HEIGHT_MOBILE } from './DestinationBackdrop';
import { useTripList } from '@/features/trip/TripListContext';
import { useV2Mode } from '@/context/V2ModeContext';

interface AppLayoutProps {
  children: ReactNode;
  hideHero?: boolean;
  /** When true, children fill all available height (no scroll on mobile) */
  fillHeight?: boolean;
  /** When true, hide the floating action button (e.g. on pages with their own primary action) */
  hideFAB?: boolean;
  /** Override the hero image URL (e.g. with a location image instead of country) */
  heroImageOverride?: string | null;
  /** Override the hero/header title (e.g. "Country — City" instead of trip name) */
  heroTitleOverride?: string;
}

// Persists across page navigations (AppLayout remounts per page)
let persistedScrollTop = 0;
let persistedTripId: string | null = null;

function getHeroHeight() {
  return window.innerWidth >= 768 ? HERO_HEIGHT : HERO_HEIGHT_MOBILE;
}

export function AppLayout({ children, hideHero = false, fillHeight = false, hideFAB = false, heroImageOverride, heroTitleOverride }: AppLayoutProps) {
  const isV2 = useV2Mode();
  // In V2 mode, skip the shell entirely — V2Layout handles chrome
  if (isV2) return <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">{children}</div>;

  const { trips, activeTripId } = useTripList();
  const activeTrip = trips.find(t => t.id === activeTripId) || null;
  // A hero is expected when the trip has countries (or an override is provided),
  // even before the image URL resolves — this prevents the header title from
  // flashing briefly before the hero image loads.
  const hasHero = !hideHero && !!(heroImageOverride || activeTrip?.countries?.length);

  // Reset when trip changes
  const isNewTrip = activeTripId !== persistedTripId;
  if (isNewTrip) {
    persistedTripId = activeTripId;
    persistedScrollTop = 0;
  }

  // When on a hideHero page, persist scroll as "collapsed" so next page stays collapsed
  const heroH = getHeroHeight();
  if (hideHero) {
    persistedScrollTop = heroH;
  }

  // Snap: if past halfway → collapsed, otherwise → open
  const snappedCollapsed = !isNewTrip && persistedScrollTop > heroH / 2;
  const [heroScrolledPast, setHeroScrolledPast] = useState(snappedCollapsed);

  // Track window scroll for hero visibility (non-fillHeight pages use native document scroll)
  useEffect(() => {
    if (fillHeight) return;
    const onScroll = () => {
      if (!hideHero) persistedScrollTop = window.scrollY;
      const h = getHeroHeight();
      setHeroScrolledPast(window.scrollY > h - 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hideHero, fillHeight]);

  // Restore scroll position before first paint
  useLayoutEffect(() => {
    if (fillHeight) return;
    const target = snappedCollapsed && !hideHero ? heroH : 0;
    window.scrollTo(0, target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // fillHeight pages: lock document scroll
  useEffect(() => {
    if (!fillHeight) return;
    window.scrollTo(0, 0);
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
    };
  }, [fillHeight]);

  // fillHeight mode (Map): fixed layout, no document scroll
  if (fillHeight) {
    return (
      <div className="h-[100dvh] flex flex-col">
        <AppHeader heroScrolledPast={true} hasHero={false} />
        <main className="flex-1 min-h-0 flex flex-col container px-1.5 sm:px-6 py-4 sm:py-6 pb-4 md:pb-6">
          {children}
        </main>
        {/* Spacer for fixed bottom nav on mobile */}
        <div className="md:hidden shrink-0 h-[calc(4rem+env(safe-area-inset-bottom))]" />
        {!hideFAB && <MobileFAB />}
        <MobileBottomNav />
      </div>
    );
  }

  // Normal pages: native document scroll (most reliable on mobile)
  return (
    <>
      {!hideHero && <DestinationHero heroImageOverride={heroImageOverride} heroTitleOverride={heroTitleOverride} />}
      <AppHeader heroScrolledPast={hideHero ? true : heroScrolledPast} hasHero={hasHero} heroTitleOverride={heroTitleOverride} />
      <main className="container px-1.5 sm:px-6 py-4 sm:py-6 pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-6 min-h-screen">
        {children}
      </main>
      {!hideFAB && <MobileFAB />}
      <MobileBottomNav />
    </>
  );
}
