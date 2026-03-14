import { ReactNode, useRef, useState, useEffect, useCallback } from 'react';
import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { MobileFAB } from './MobileFAB';
import { DestinationHero, HERO_HEIGHT, HERO_HEIGHT_MOBILE, useDestinationImageUrl } from './DestinationBackdrop';
import { useTripList } from '@/context/TripListContext';

interface AppLayoutProps {
  children: ReactNode;
  hideHero?: boolean;
  /** When true, children fill all available height (no scroll on mobile) */
  fillHeight?: boolean;
}

// Persists across page navigations (AppLayout remounts per page)
let persistedScrollTop = 0;
let persistedTripId: string | null = null;

function getHeroHeight() {
  return window.innerWidth >= 768 ? HERO_HEIGHT : HERO_HEIGHT_MOBILE;
}

export function AppLayout({ children, hideHero = false, fillHeight = false }: AppLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { activeTripId } = useTripList();
  const destinationImageUrl = useDestinationImageUrl();
  const hasHero = !hideHero && !!destinationImageUrl;

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

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (!hideHero) persistedScrollTop = el.scrollTop;
    const h = getHeroHeight();
    const past = el.scrollTop > h - 40;
    setHeroScrolledPast(past);
  }, [hideHero]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // On mount: restore persisted scroll position after first paint
  useEffect(() => {
    const target = snappedCollapsed && !hideHero ? heroH : 0;
    // Wait for paint before setting scroll — avoids breaking iOS touch-scroll init
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = target;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Use overflow-y-scroll (not auto) so iOS always considers this scrollable,
  // even before async content loads. Prevents intermittent touch-scroll failures.
  const scrollClass = fillHeight
    ? 'overflow-hidden flex flex-col md:overflow-y-scroll'
    : 'overflow-y-scroll';

  return (
    <div className="h-[100dvh] flex flex-col">
      <div ref={scrollRef} className={`flex-1 min-h-0 overscroll-y-contain ${scrollClass}`}>
        {!hideHero && <DestinationHero />}
        <AppHeader heroScrolledPast={hideHero ? true : heroScrolledPast} hasHero={hasHero} />
        <main className={`container px-1.5 sm:px-6 py-4 sm:py-6 pb-4 md:pb-6 ${fillHeight ? 'flex flex-col min-h-0 flex-1' : 'min-h-screen'}`}>
          {children}
        </main>
      </div>
      <MobileFAB />
      <MobileBottomNav />
    </div>
  );
}
