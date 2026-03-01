import React, { createContext, useContext, useReducer, useEffect, useCallback, useMemo, useRef, ReactNode } from 'react';
import { Expense, CostBreakdown } from '@/types/trip';
import * as tripService from '@/services/tripService';
import { convertToPreferred, fetchSingleRate } from '@/services/exchangeRateService';
import { useToast } from '@/hooks/use-toast';
import { useActiveTrip } from './ActiveTripContext';
import { usePOI } from './POIContext';
import { useTransport } from './TransportContext';

// State
interface FinanceState {
  expenses: Expense[];
}

type FinanceAction =
  | { type: 'SET_EXPENSES'; payload: Expense[] }
  | { type: 'ADD_EXPENSE'; payload: Expense }
  | { type: 'UPDATE_EXPENSE'; payload: Expense }
  | { type: 'DELETE_EXPENSE'; payload: string };

function financeReducer(state: FinanceState, action: FinanceAction): FinanceState {
  switch (action.type) {
    case 'SET_EXPENSES':
      return { expenses: action.payload };
    case 'ADD_EXPENSE':
      return { expenses: [action.payload, ...state.expenses] };
    case 'UPDATE_EXPENSE':
      return { expenses: state.expenses.map(e => e.id === action.payload.id ? action.payload : e) };
    case 'DELETE_EXPENSE':
      return { expenses: state.expenses.filter(e => e.id !== action.payload) };
    default:
      return state;
  }
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$', ILS: '₪', EUR: '€', GBP: '£', PHP: '₱', THB: '฿', JPY: '¥', CNY: '¥',
  KRW: '₩', INR: '₹', MYR: 'RM', SGD: 'S$', AUD: 'A$', NZD: 'NZ$', CAD: 'C$',
  CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', CZK: 'Kč', HUF: 'Ft',
  TRY: '₺', MXN: 'MX$', BRL: 'R$', ZAR: 'R', EGP: 'E£', IDR: 'Rp', VND: '₫',
  TWD: 'NT$', HKD: 'HK$', AED: 'د.إ', SAR: '﷼', QAR: 'QR', KWD: 'KD', JOD: 'JD',
  GEL: '₾', ISK: 'kr', RON: 'lei', BGN: 'лв',
};

// Context type
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
  const { activeTrip, exchangeRates, refreshKey, setExchangeRates } = useActiveTrip();
  const { pois, updatePOI: updatePOIInContext } = usePOI();
  const { transportation, updateTransportation: updateTransportInContext } = useTransport();
  const [state, dispatch] = useReducer(financeReducer, { expenses: [] });

  // Track pending exchange-rate fetches to avoid repeated calls during render
  const pendingRateFetches = useRef<Set<string>>(new Set());

  // Load expenses when active trip changes
  useEffect(() => {
    if (activeTrip) {
      tripService.fetchExpenses(activeTrip.id).then(expenses => dispatch({ type: 'SET_EXPENSES', payload: expenses }));
    } else {
      dispatch({ type: 'SET_EXPENSES', payload: [] });
    }
  }, [activeTrip?.id, refreshKey]);

  const addExpense = useCallback(async (e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newE = await tripService.createExpense(e);
      dispatch({ type: 'ADD_EXPENSE', payload: newE });
    } catch (error) {
      console.error('Failed to add expense:', error);
      toast({ title: 'Error', description: 'Failed to add expense.', variant: 'destructive' });
    }
  }, [toast]);

  const updateExpense = useCallback(async (id: string, updates: Partial<Expense>) => {
    try {
      await tripService.updateExpense(id, updates);
      const existing = state.expenses.find(e => e.id === id);
      if (existing) dispatch({ type: 'UPDATE_EXPENSE', payload: { ...existing, ...updates } });
    } catch (error) {
      console.error('Failed to update expense:', error);
      toast({ title: 'Error', description: 'Failed to update expense.', variant: 'destructive' });
    }
  }, [state.expenses, toast]);

  const deleteExpense = useCallback(async (id: string) => {
    try {
      await tripService.deleteExpense(id);
      dispatch({ type: 'DELETE_EXPENSE', payload: id });
    } catch (error) {
      console.error('Failed to delete expense:', error);
      toast({ title: 'Error', description: 'Failed to delete expense.', variant: 'destructive' });
    }
  }, [toast]);

  const togglePaidStatus = useCallback(async (entityType: 'poi' | 'transport' | 'expense', id: string, isPaid: boolean) => {
    try {
      if (entityType === 'poi') {
        await tripService.updatePOI(id, { isPaid });
        const existing = pois.find(p => p.id === id);
        if (existing) updatePOIInContext({ ...existing, isPaid });
      } else if (entityType === 'transport') {
        await tripService.updateTransportation(id, { isPaid });
        const existing = transportation.find(t => t.id === id);
        if (existing) updateTransportInContext({ ...existing, isPaid });
      } else {
        await tripService.updateExpense(id, { isPaid });
        const existing = state.expenses.find(e => e.id === id);
        if (existing) dispatch({ type: 'UPDATE_EXPENSE', payload: { ...existing, isPaid } });
      }
    } catch (error) {
      console.error('Failed to toggle paid status:', error);
      toast({ title: 'Error', description: 'Failed to update paid status.', variant: 'destructive' });
    }
  }, [pois, transportation, state.expenses, updatePOIInContext, updateTransportInContext, toast]);

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
    state.expenses.forEach(e => {
      const converted = exchangeRates ? (convertToPreferred(e.amount, e.currency, exchangeRates) ?? e.amount) : e.amount;
      manualExpenses += converted;
    });
    const total = transport + lodging + activities + services + manualExpenses;
    return { transport, lodging, activities, services, total };
  }, [activeTrip?.currency, pois, transportation, state.expenses, exchangeRates]);

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
    expenses: state.expenses,
    addExpense,
    updateExpense,
    deleteExpense,
    togglePaidStatus,
    getCostBreakdown,
    formatCurrency,
    formatDualCurrency,
    convertToPreferredCurrency,
  }), [state.expenses, addExpense, updateExpense, deleteExpense, togglePaidStatus, getCostBreakdown, formatCurrency, formatDualCurrency, convertToPreferredCurrency]);

  return <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>;
}

export function useFinance() {
  const context = useContext(FinanceContext);
  if (!context) throw new Error('useFinance must be used within a FinanceProvider');
  return context;
}
