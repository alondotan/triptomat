import React, { createContext, useContext, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Expense, CostBreakdown } from '@/types/trip';
import { updatePOI } from '@/features/poi/poiService';
import { updateTransportation } from '@/features/transport/transportService';
import { convertToPreferred, fetchSingleRate } from '@/features/finance/exchangeRateService';
import { useToast } from '@/shared/hooks/use-toast';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { useTransport } from '@/features/transport/TransportContext';
import { useExpenses, useAddExpense, useUpdateExpense, useDeleteExpense } from './useExpenseQueries';

/**
 * Thin wrapper that combines:
 *   - Expense CRUD (now backed by TanStack Query hooks in `useExpenseQueries.ts`)
 *   - Cross-entity helpers (`togglePaidStatus`, `getCostBreakdown`)
 *   - Pure currency formatters
 *
 * The context exists mainly to expose pure compute functions that depend on
 * other contexts (POI, Transport, ActiveTrip). New code that only needs
 * expenses should use `useExpenses` / `useAddExpense` directly.
 */

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', ILS: '₪', EUR: '€', GBP: '£', PHP: '₱', THB: '฿', JPY: '¥', CNY: '¥',
  KRW: '₩', INR: '₹', MYR: 'RM', SGD: 'S$', AUD: 'A$', NZD: 'NZ$', CAD: 'C$',
  CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', CZK: 'Kč', HUF: 'Ft',
  TRY: '₺', MXN: 'MX$', BRL: 'R$', ZAR: 'R', EGP: 'E£', IDR: 'Rp', VND: '₫',
  TWD: 'NT$', HKD: 'HK$', AED: 'د.إ', SAR: '﷼', QAR: 'QR', KWD: 'KD', JOD: 'JD',
  GEL: '₾', ISK: 'kr', RON: 'lei', BGN: 'лв',
};

interface FinanceContextType {
  expenses: Expense[];
  addExpense: (e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  togglePaidStatus: (entityType: 'poi' | 'transport' | 'expense', id: string, isPaid: boolean) => Promise<void>;
  getCostBreakdown: () => CostBreakdown;
  formatCurrency: (amount: number, currency?: string) => string;
  formatDualCurrency: (amount: number, originalCurrency: string) => string;
  convertToPreferredCurrency: (amount: number, fromCurrency: string) => number | null;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export function FinanceProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const { activeTrip, exchangeRates, setExchangeRates } = useActiveTrip();
  const { pois, updatePOI: updatePOIInContext } = usePOI();
  const { transportation, updateTransportation: updateTransportInContext } = useTransport();

  const tripId = activeTrip?.id;
  const { data: expenses = [] } = useExpenses(tripId);
  const addMutation = useAddExpense(tripId);
  const updateMutation = useUpdateExpense(tripId);
  const deleteMutation = useDeleteExpense(tripId);

  // Track pending exchange-rate fetches to avoid repeated calls during render
  const pendingRateFetches = useRef<Set<string>>(new Set());

  const addExpense = useCallback(async (e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      await addMutation.mutateAsync(e);
    } catch { /* toast handled inside mutation */ }
  }, [addMutation]);

  const updateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
    try {
      await updateMutation.mutateAsync({ id, updates });
    } catch { /* toast handled inside mutation */ }
  }, [updateMutation]);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      await deleteMutation.mutateAsync(id);
    } catch { /* toast handled inside mutation */ }
  }, [deleteMutation]);

  const togglePaidStatus = useCallback(async (entityType: 'poi' | 'transport' | 'expense', id: string, isPaid: boolean) => {
    try {
      if (entityType === 'poi') {
        await updatePOI(id, { isPaid });
        const existing = pois.find(p => p.id === id);
        if (existing) updatePOIInContext({ ...existing, isPaid });
      } else if (entityType === 'transport') {
        await updateTransportation(id, { isPaid });
        const existing = transportation.find(t => t.id === id);
        if (existing) updateTransportInContext({ ...existing, isPaid });
      } else {
        await updateMutation.mutateAsync({ id, updates: { isPaid } });
      }
    } catch (error) {
      console.error('Failed to toggle paid status:', error);
      toast({ title: 'Error', description: 'Failed to update paid status.', variant: 'destructive' });
    }
  }, [pois, transportation, updatePOIInContext, updateTransportInContext, updateMutation, toast]);

  const getCostBreakdown = useCallback((): CostBreakdown => {
    const preferred = activeTrip?.currency || 'USD';
    let transport = 0, lodging = 0, activities = 0, services = 0;
    pois.forEach(poi => {
      const cost = poi.details.cost?.amount || 0;
      const cur = poi.details.cost?.currency || preferred;
      const converted = exchangeRates ? (convertToPreferred(cost, cur, exchangeRates) ?? cost) : cost;
      if (poi.category === 'accommodation') lodging += converted;
      else if (poi.category === 'eatery' || poi.category === 'attraction') activities += converted;
      else if (poi.category === 'service') services += converted;
    });
    transportation.forEach(t => {
      const cost = t.cost.total_amount || 0;
      const cur = t.cost.currency || preferred;
      const converted = exchangeRates ? (convertToPreferred(cost, cur, exchangeRates) ?? cost) : cost;
      transport += converted;
    });
    let manualExpenses = 0;
    expenses.forEach(e => {
      const converted = exchangeRates ? (convertToPreferred(e.amount, e.currency, exchangeRates) ?? e.amount) : e.amount;
      manualExpenses += converted;
    });
    const total = transport + lodging + activities + services + manualExpenses;
    return { transport, lodging, activities, services, total };
  }, [activeTrip?.currency, pois, transportation, expenses, exchangeRates]);

  const formatCurrency = useCallback((amount: number, currency?: string): string => {
    const cur = currency || activeTrip?.currency || 'USD';
    return `${CURRENCY_SYMBOLS[cur] || cur + ' '}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }, [activeTrip?.currency]);

  const formatDualCurrency = useCallback((amount: number, originalCurrency: string): string => {
    const preferred = activeTrip?.currency || 'ILS';
    const original = formatCurrency(amount, originalCurrency);
    if (originalCurrency === preferred) return original;
    if (!exchangeRates) return original;
    const converted = convertToPreferred(amount, originalCurrency, exchangeRates);
    if (converted === null) {
      const key = `${originalCurrency}_${preferred}`;
      if (!pendingRateFetches.current.has(key)) {
        pendingRateFetches.current.add(key);
        setTimeout(() => {
          fetchSingleRate(originalCurrency, preferred).then(rate => {
            pendingRateFetches.current.delete(key);
            if (rate && exchangeRates) {
              const updatedRates = { ...exchangeRates, rates: { ...exchangeRates.rates, [originalCurrency]: rate } };
              setExchangeRates(updatedRates);
            }
          });
        }, 0);
      }
      return original;
    }
    return `${original} (${formatCurrency(Math.round(converted), preferred)})`;
  }, [activeTrip?.currency, exchangeRates, formatCurrency, setExchangeRates]);

  const convertToPreferredCurrency = useCallback((amount: number, fromCurrency: string): number | null => {
    if (!exchangeRates) return null;
    return convertToPreferred(amount, fromCurrency, exchangeRates);
  }, [exchangeRates]);

  const value = useMemo(() => ({
    expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    togglePaidStatus,
    getCostBreakdown,
    formatCurrency,
    formatDualCurrency,
    convertToPreferredCurrency,
  }), [expenses, addExpense, updateExpense, deleteExpense, togglePaidStatus, getCostBreakdown, formatCurrency, formatDualCurrency, convertToPreferredCurrency]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used within a FinanceProvider');
  return context;
}
