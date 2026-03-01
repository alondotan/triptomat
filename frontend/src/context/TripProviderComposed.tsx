import React, { ReactNode } from 'react';
import { TripListProvider } from './TripListContext';
import { ActiveTripProvider } from './ActiveTripContext';
import { POIProvider } from './POIContext';
import { TransportProvider } from './TransportContext';
import { ItineraryProvider } from './ItineraryContext';
import { FinanceProvider } from './FinanceContext';
import { ContactsProvider } from './ContactsContext';

/**
 * Composed provider that nests all domain contexts in the correct order.
 * Drop-in replacement for the old monolithic TripProvider.
 */
export function TripProvider({ children }: { children: ReactNode }) {
  return (
    <TripListProvider>
      <ActiveTripProvider>
        <POIProvider>
          <TransportProvider>
            <ItineraryProvider>
              <FinanceProvider>
                <ContactsProvider>
                  {children}
                </ContactsProvider>
              </FinanceProvider>
            </ItineraryProvider>
          </TransportProvider>
        </POIProvider>
      </ActiveTripProvider>
    </TripListProvider>
  );
}
