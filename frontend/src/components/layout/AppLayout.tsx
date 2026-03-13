import { ReactNode, useRef, useState, useEffect, useCallback } from 'react';
import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
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
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSnappingRef = useRef(false);
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

  // Smooth-snap to a target scroll position within the hero zone
  const snapTo = useCallback((target: number) => {
    const el = scrollRef.current;
    if (!el) return;
    isSnappingRef.current = true;
    el.scrollTo({ top: target, behavior: 'smooth' });
    // Reset snapping flag after animation completes
    const resetTimer = setTimeout(() => { isSnappingRef.current = false; }, 350);
    return () => clearTimeout(resetTimer);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // On hideHero pages, keep persistedScrollTop pinned to heroH
    // so navigating away stays collapsed
    if (!hideHero) persistedScrollTop = el.scrollTop;
    const h = getHeroHeight();
    const past = el.scrollTop > h - 40;
    setHeroScrolledPast(past);

    // Don't trigger snap while we're already snapping
    if (isSnappingRef.current) return;

    // Only snap when scroll is within the hero zone (partial state)
    if (el.scrollTop > 0 && el.scrollTop < h) {
      // Debounce: wait for scroll to stop, then snap
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        const currentH = getHeroHeight();
        if (!scrollRef.current) return;
        const pos = scrollRef.current.scrollTop;
        // Only snap if still in the partial zone
        if (pos > 0 && pos < currentH) {
          const target = pos > currentH / 2 ? currentH : 0;
          snapTo(target);
        }
      }, 150);
    }
  }, [snapTo]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
  }, [onScroll]);

  // On mount: snap to collapsed or open (with RAF backup for lazy-loaded content)
  useEffect(() => {
    const target = snappedCollapsed && !hideHero ? heroH : 0;
    const apply = () => {
      if (scrollRef.current) scrollRef.current.scrollTop = target;
    };
    apply();
    // Backup: content may not be rendered yet (lazy loading)
    const id1 = requestAnimationFrame(() => {
      apply();
      requestAnimationFrame(apply);
    });
    // Extra backup for slow lazy loads
    const id2 = setTimeout(apply, 50);
    return () => { cancelAnimationFrame(id1); clearTimeout(id2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-[100dvh] flex flex-col">
      <div ref={scrollRef} className={`flex-1 min-h-0 ${fillHeight ? 'overflow-hidden flex flex-col md:overflow-y-auto' : 'overflow-y-auto'}`}>
        {!hideHero && <DestinationHero />}
        <AppHeader heroScrolledPast={hideHero ? true : heroScrolledPast} hasHero={hasHero} />
        <main className={`container px-1.5 sm:px-6 py-4 sm:py-6 pb-4 md:pb-6 ${fillHeight ? 'flex flex-col min-h-0 flex-1' : 'min-h-screen'}`}>
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
