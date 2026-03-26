import React, { ReactNode } from 'react';
import { TripListProvider } from '@/features/trip/TripListContext';
import { ActiveTripProvider } from '@/features/trip/ActiveTripContext';
import { POIProvider } from '@/features/poi/POIContext';
import { TransportProvider } from '@/features/transport/TransportContext';
import { ItineraryProvider } from '@/features/itinerary/ItineraryContext';
import { FinanceProvider } from '@/features/finance/FinanceContext';

/**
 * Composed provider that nests all domain contexts in the correct order.
 * Contacts are now part of ItineraryProvider (6 providers instead of 7).
 */
export function TripProvider({ children }: { children: ReactNode }) {
  return (
    <TripListProvider>
      <ActiveTripProvider>
        <POIProvider>
          <TransportProvider>
            <ItineraryProvider>
              <FinanceProvider>
                {children}
              </FinanceProvider>
            </ItineraryProvider>
          </TransportProvider>
        </POIProvider>
      </ActiveTripProvider>
    </TripListProvider>
  );
}
