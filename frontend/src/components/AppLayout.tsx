import { ReactNode } from 'react';
import { AppHeader } from './AppHeader';
import { MobileBottomNav } from './MobileBottomNav';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="h-[100dvh] flex flex-col">
      <AppHeader />
      <main className="flex-1 min-h-0 overflow-y-auto container px-3 sm:px-6 py-4 sm:py-6 pb-4 md:pb-6">
        {children}
      </main>
      <MobileBottomNav />
    </div>
  );
}
