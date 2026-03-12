import { ReactNode, useRef, useState, useEffect, useCallback } from 'react';
import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';
import { DestinationHero, HERO_HEIGHT, HERO_HEIGHT_MOBILE, useDestinationImageUrl } from './DestinationBackdrop';
import { useTripList } from '@/context/TripListContext';

interface AppLayoutProps {
  children: ReactNode;
}

// Persists across page navigations (AppLayout remounts per page)
let persistedScrollTop = 0;
let persistedTripId: string | null = null;

function getHeroHeight() {
  return window.innerWidth >= 768 ? HERO_HEIGHT : HERO_HEIGHT_MOBILE;
}

export function AppLayout({ children }: AppLayoutProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { activeTripId } = useTripList();
  const hasHero = !!useDestinationImageUrl();

  // Reset when trip changes
  const isNewTrip = activeTripId !== persistedTripId;
  if (isNewTrip) {
    persistedTripId = activeTripId;
    persistedScrollTop = 0;
  }

  // Snap: if past halfway → collapsed, otherwise → open
  const heroH = getHeroHeight();
  const snappedCollapsed = !isNewTrip && persistedScrollTop > heroH / 2;
  const [heroScrolledPast, setHeroScrolledPast] = useState(snappedCollapsed);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    persistedScrollTop = el.scrollTop;
    const h = getHeroHeight();
    const past = el.scrollTop > h - 40;
    setHeroScrolledPast(past);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onScroll]);

  // On mount: snap to collapsed or open (with RAF backup for lazy-loaded content)
  useEffect(() => {
    const target = snappedCollapsed ? heroH : 0;
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
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto">
        <DestinationHero />
        <AppHeader heroScrolledPast={heroScrolledPast} hasHero={hasHero} />
        <main className="container px-1.5 sm:px-6 py-4 sm:py-6 pb-4 md:pb-6 min-h-screen">
          {children}
        </main>
      </div>
      <MobileBottomNav />
    </div>
  );
}
