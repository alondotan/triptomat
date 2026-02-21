import React, { createContext, useContext, useReducer, useEffect, ReactNode, useCallback } from 'react';
import { Trip, PointOfInterest, Transportation, Mission, ItineraryDay, CostBreakdown, Expense } from '@/types/trip';
import { SiteHierarchyNode } from '@/types/webhook';
import * as tripService from '@/services/tripService';
import { useToast } from '@/hooks/use-toast';
import { ExchangeRates, fetchExchangeRates, convertToPreferred, fetchSingleRate } from '@/services/exchangeRateService';

// State type
interface TripState {
  trips: Trip[];
  activeTrip: Trip | null;
  pois: PointOfInterest[];
  transportation: Transportation[];
  missions: Mission[];
  itineraryDays: ItineraryDay[];
  expenses: Expense[];
  tripSitesHierarchy: SiteHierarchyNode[];
  exchangeRates: ExchangeRates | null;
  isLoading: boolean;
  error: string | null;
}

// Action types
type TripAction =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'LOAD_TRIPS'; payload: Trip[] }
  | { type: 'SET_ACTIVE_TRIP'; payload: string }
  | { type: 'CREATE_TRIP'; payload: Trip }
  | { type: 'DELETE_TRIP'; payload: string }
  | { type: 'UPDATE_TRIP'; payload: Partial<Trip> & { id: string } }
  | { type: 'SET_POIS'; payload: PointOfInterest[] }
  | { type: 'ADD_POI'; payload: PointOfInterest }
  | { type: 'UPDATE_POI'; payload: PointOfInterest }
  | { type: 'DELETE_POI'; payload: string }
  | { type: 'SET_TRANSPORTATION'; payload: Transportation[] }
  | { type: 'ADD_TRANSPORTATION'; payload: Transportation }
  | { type: 'UPDATE_TRANSPORTATION'; payload: Transportation }
  | { type: 'DELETE_TRANSPORTATION'; payload: string }
  | { type: 'SET_MISSIONS'; payload: Mission[] }
  | { type: 'ADD_MISSION'; payload: Mission }
  | { type: 'UPDATE_MISSION'; payload: { id: string; updates: Partial<Mission> } }
  | { type: 'DELETE_MISSION'; payload: string }
  | { type: 'SET_ITINERARY_DAYS'; payload: ItineraryDay[] }
  | { type: 'SET_TRIP_SITES_HIERARCHY'; payload: SiteHierarchyNode[] }
  | { type: 'SET_EXCHANGE_RATES'; payload: ExchangeRates | null }
  | { type: 'SET_EXPENSES'; payload: Expense[] }
  | { type: 'ADD_EXPENSE'; payload: Expense }
  | { type: 'UPDATE_EXPENSE'; payload: Expense }
  | { type: 'DELETE_EXPENSE'; payload: string };

function tripReducer(state: TripState, action: TripAction): TripState {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload };
    case 'LOAD_TRIPS':
      return {
        ...state,
        trips: action.payload,
        activeTrip: action.payload.length > 0 ? action.payload[0] : null,
        isLoading: false,
      };
    case 'SET_ACTIVE_TRIP': {
      const trip = state.trips.find(t => t.id === action.payload);
      return { ...state, activeTrip: trip || null, pois: [], transportation: [], missions: [], itineraryDays: [], expenses: [], tripSitesHierarchy: [] };
    }
    case 'CREATE_TRIP':
      return {
        ...state,
        trips: [action.payload, ...state.trips],
        activeTrip: action.payload,
        pois: [], transportation: [], missions: [], itineraryDays: [], expenses: [], tripSitesHierarchy: [],
      };
    case 'DELETE_TRIP': {
      const filtered = state.trips.filter(t => t.id !== action.payload);
      return {
        ...state,
        trips: filtered,
        activeTrip: filtered.length > 0 ? filtered[0] : null,
        pois: [], transportation: [], missions: [], itineraryDays: [], expenses: [], tripSitesHierarchy: [],
      };
    }
    case 'UPDATE_TRIP': {
      const { id, ...updates } = action.payload;
      const updatedTrips = state.trips.map(t => t.id === id ? { ...t, ...updates } : t);
      const updatedActive = state.activeTrip?.id === id ? { ...state.activeTrip, ...updates } : state.activeTrip;
      return { ...state, trips: updatedTrips, activeTrip: updatedActive };
    }
    case 'SET_POIS':
      return { ...state, pois: action.payload };
    case 'ADD_POI':
      return { ...state, pois: [...state.pois, action.payload] };
    case 'UPDATE_POI':
      return { ...state, pois: state.pois.map(p => p.id === action.payload.id ? action.payload : p) };
    case 'DELETE_POI':
      return { ...state, pois: state.pois.filter(p => p.id !== action.payload) };
    case 'SET_TRANSPORTATION':
      return { ...state, transportation: action.payload };
    case 'ADD_TRANSPORTATION':
      return { ...state, transportation: [...state.transportation, action.payload] };
    case 'UPDATE_TRANSPORTATION':
      return { ...state, transportation: state.transportation.map(t => t.id === action.payload.id ? action.payload : t) };
    case 'DELETE_TRANSPORTATION':
      return { ...state, transportation: state.transportation.filter(t => t.id !== action.payload) };
    case 'SET_MISSIONS':
      return { ...state, missions: action.payload };
    case 'ADD_MISSION':
      return { ...state, missions: [...state.missions, action.payload] };
    case 'UPDATE_MISSION':
      return { ...state, missions: state.missions.map(m => m.id === action.payload.id ? { ...m, ...action.payload.updates } : m) };
    case 'DELETE_MISSION':
      return { ...state, missions: state.missions.filter(m => m.id !== action.payload) };
     case 'SET_ITINERARY_DAYS':
      return { ...state, itineraryDays: action.payload };
    case 'SET_TRIP_SITES_HIERARCHY':
      return { ...state, tripSitesHierarchy: action.payload };
    case 'SET_EXCHANGE_RATES':
      return { ...state, exchangeRates: action.payload };
    case 'SET_EXPENSES':
      return { ...state, expenses: action.payload };
    case 'ADD_EXPENSE':
      return { ...state, expenses: [action.payload, ...state.expenses] };
    case 'UPDATE_EXPENSE':
      return { ...state, expenses: state.expenses.map(e => e.id === action.payload.id ? action.payload : e) };
    case 'DELETE_EXPENSE':
      return { ...state, expenses: state.expenses.filter(e => e.id !== action.payload) };
    default:
      return state;
  }
}

// Context
interface TripContextType {
  state: TripState;
  dispatch: React.Dispatch<TripAction>;
  loadTrips: () => Promise<void>;
  loadTripData: (tripId: string) => Promise<void>;
  createNewTrip: (name: string, description: string, startDate: string, endDate: string, countries?: string[]) => Promise<void>;
  deleteCurrentTrip: () => Promise<void>;
  updateCurrentTrip: (updates: Partial<Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>>) => Promise<void>;
  addPOI: (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>) => Promise<PointOfInterest | undefined>;
  updatePOI: (poi: PointOfInterest) => Promise<void>;
  deletePOI: (poiId: string) => Promise<void>;
  addTransportation: (t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Transportation | undefined>;
  updateTransportation: (t: Transportation) => Promise<void>;
  deleteTransportation: (id: string) => Promise<void>;
  addMission: (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateMission: (id: string, updates: Partial<Mission>) => Promise<void>;
  deleteMission: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updateExpense: (id: string, updates: Partial<Expense>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  getCostBreakdown: () => CostBreakdown;
  formatCurrency: (amount: number, currency?: string) => string;
  formatDualCurrency: (amount: number, originalCurrency: string) => string;
  convertToPreferredCurrency: (amount: number, fromCurrency: string) => number | null;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

export function TripProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [state, dispatch] = useReducer(tripReducer, {
    trips: [],
    activeTrip: null,
    pois: [],
    transportation: [],
    missions: [],
    itineraryDays: [],
    expenses: [],
    tripSitesHierarchy: [],
    exchangeRates: null,
    isLoading: true,
    error: null,
  });

  const loadTrips = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const trips = await tripService.fetchTrips();
      dispatch({ type: 'LOAD_TRIPS', payload: trips });
    } catch (error) {
      console.error('Failed to load trips:', error);
      dispatch({ type: 'SET_ERROR', payload: 'Failed to load trips' });
      dispatch({ type: 'SET_LOADING', payload: false });
    }
  }, []);

  const loadTripData = useCallback(async (tripId: string) => {
    try {
      const [pois, transportation, missions, itineraryDays, expenses] = await Promise.all([
        tripService.fetchPOIs(tripId),
        tripService.fetchTransportation(tripId),
        tripService.fetchMissions(tripId),
        tripService.fetchItineraryDays(tripId),
        tripService.fetchExpenses(tripId),
      ]);
      dispatch({ type: 'SET_POIS', payload: pois });
      dispatch({ type: 'SET_TRANSPORTATION', payload: transportation });
      dispatch({ type: 'SET_MISSIONS', payload: missions });
      dispatch({ type: 'SET_ITINERARY_DAYS', payload: itineraryDays });
      dispatch({ type: 'SET_EXPENSES', payload: expenses });

      // Load sites_hierarchy from source_emails AND source_recommendations for this trip
      try {
        const { supabase } = await import('@/integrations/supabase/client');
        const [{ data: emails }, { data: recommendations }] = await Promise.all([
          supabase
            .from('source_emails')
            .select('parsed_data')
            .eq('trip_id', tripId)
            .eq('status', 'linked'),
          supabase
            .from('source_recommendations')
            .select('analysis')
            .eq('trip_id', tripId)
            .eq('status', 'linked'),
        ]);
        const allHierarchy: SiteHierarchyNode[] = [];
        for (const email of (emails || [])) {
          const pd = email.parsed_data as any;
          if (pd?.sites_hierarchy && Array.isArray(pd.sites_hierarchy)) {
            allHierarchy.push(...pd.sites_hierarchy);
          }
        }
        for (const rec of (recommendations || [])) {
          const analysis = rec.analysis as any;
          if (analysis?.sites_hierarchy && Array.isArray(analysis.sites_hierarchy)) {
            allHierarchy.push(...analysis.sites_hierarchy);
          }
        }
        dispatch({ type: 'SET_TRIP_SITES_HIERARCHY', payload: allHierarchy });
      } catch (e) {
        console.error('Failed to load trip sites hierarchy:', e);
      }
    } catch (error) {
      console.error('Failed to load trip data:', error);
    }
  }, []);

  useEffect(() => { loadTrips(); }, [loadTrips]);

  useEffect(() => {
    if (state.activeTrip) {
      loadTripData(state.activeTrip.id);
      // Fetch exchange rates for this trip's preferred currency
      fetchExchangeRates(state.activeTrip.currency, state.activeTrip.countries)
        .then(rates => dispatch({ type: 'SET_EXCHANGE_RATES', payload: rates }))
        .catch(e => console.error('Failed to fetch exchange rates:', e));
    }
  }, [state.activeTrip?.id, loadTripData]);

  const createNewTrip = async (name: string, description: string, startDate: string, endDate: string, countries: string[] = []) => {
    try {
      const newTrip = await tripService.createTrip({
        name, description, startDate, endDate, currency: 'ILS', countries, status: 'research',
      });
      dispatch({ type: 'CREATE_TRIP', payload: newTrip });
      toast({ title: 'Trip Created', description: `"${name}" has been created.` });
    } catch (error) {
      console.error('Failed to create trip:', error);
      toast({ title: 'Error', description: 'Failed to create trip.', variant: 'destructive' });
    }
  };

  const updateCurrentTrip = async (updates: Partial<Omit<Trip, 'id' | 'createdAt' | 'updatedAt'>>) => {
    if (!state.activeTrip) return;
    try {
      await tripService.updateTrip(state.activeTrip.id, updates);
      dispatch({ type: 'UPDATE_TRIP', payload: { id: state.activeTrip.id, ...updates } });
      toast({ title: 'Trip updated' });
    } catch (error) {
      console.error('Failed to update trip:', error);
      toast({ title: 'Error', description: 'Failed to update trip.', variant: 'destructive' });
    }
  };

  const deleteCurrentTrip = async () => {
    if (!state.activeTrip) return;
    try {
      await tripService.deleteTrip(state.activeTrip.id);
      dispatch({ type: 'DELETE_TRIP', payload: state.activeTrip.id });
      toast({ title: 'Trip Deleted' });
    } catch (error) {
      console.error('Failed to delete trip:', error);
      toast({ title: 'Error', description: 'Failed to delete trip.', variant: 'destructive' });
    }
  };

  const addPOI = async (poi: Omit<PointOfInterest, 'id' | 'createdAt' | 'updatedAt'>): Promise<PointOfInterest | undefined> => {
    try {
      const newPOI = await tripService.createPOI(poi);
      dispatch({ type: 'ADD_POI', payload: newPOI });
      return newPOI;
    } catch (error) {
      console.error('Failed to add POI:', error);
      toast({ title: 'Error', description: 'Failed to add item.', variant: 'destructive' });
      return undefined;
    }
  };

  const updatePOIAction = async (poi: PointOfInterest) => {
    try {
      await tripService.updatePOI(poi.id, poi);
      dispatch({ type: 'UPDATE_POI', payload: poi });
    } catch (error) {
      console.error('Failed to update POI:', error);
      toast({ title: 'Error', description: 'Failed to update item.', variant: 'destructive' });
    }
  };

  const deletePOIAction = async (poiId: string) => {
    try {
      await tripService.deletePOI(poiId);
      dispatch({ type: 'DELETE_POI', payload: poiId });
    } catch (error) {
      console.error('Failed to delete POI:', error);
      toast({ title: 'Error', description: 'Failed to delete item.', variant: 'destructive' });
    }
  };

  const addTransportationAction = async (t: Omit<Transportation, 'id' | 'createdAt' | 'updatedAt'>): Promise<Transportation | undefined> => {
    try {
      const newT = await tripService.createTransportation(t);
      dispatch({ type: 'ADD_TRANSPORTATION', payload: newT });
      return newT;
    } catch (error) {
      console.error('Failed to add transportation:', error);
      toast({ title: 'Error', description: 'Failed to add transportation.', variant: 'destructive' });
      return undefined;
    }
  };

  const updateTransportationAction = async (t: Transportation) => {
    try {
      await tripService.updateTransportation(t.id, t);
      dispatch({ type: 'UPDATE_TRANSPORTATION', payload: t });
    } catch (error) {
      console.error('Failed to update transportation:', error);
      toast({ title: 'Error', description: 'Failed to update transportation.', variant: 'destructive' });
    }
  };

  const deleteTransportationAction = async (id: string) => {
    try {
      await tripService.deleteTransportation(id);
      dispatch({ type: 'DELETE_TRANSPORTATION', payload: id });
    } catch (error) {
      console.error('Failed to delete transportation:', error);
      toast({ title: 'Error', description: 'Failed to delete transportation.', variant: 'destructive' });
    }
  };

  const addMissionAction = async (m: Omit<Mission, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newM = await tripService.createMission(m);
      dispatch({ type: 'ADD_MISSION', payload: newM });
    } catch (error) {
      console.error('Failed to add mission:', error);
      toast({ title: 'Error', description: 'Failed to add mission.', variant: 'destructive' });
    }
  };

  const updateMissionAction = async (id: string, updates: Partial<Mission>) => {
    try {
      await tripService.updateMission(id, updates);
      dispatch({ type: 'UPDATE_MISSION', payload: { id, updates } });
    } catch (error) {
      console.error('Failed to update mission:', error);
      toast({ title: 'Error', description: 'Failed to update mission.', variant: 'destructive' });
    }
  };

  const deleteMissionAction = async (id: string) => {
    try {
      await tripService.deleteMission(id);
      dispatch({ type: 'DELETE_MISSION', payload: id });
    } catch (error) {
      console.error('Failed to delete mission:', error);
      toast({ title: 'Error', description: 'Failed to delete mission.', variant: 'destructive' });
    }
  };

  const addExpenseAction = async (e: Omit<Expense, 'id' | 'createdAt' | 'updatedAt'>) => {
    try {
      const newE = await tripService.createExpense(e);
      dispatch({ type: 'ADD_EXPENSE', payload: newE });
    } catch (error) {
      console.error('Failed to add expense:', error);
      toast({ title: 'Error', description: 'Failed to add expense.', variant: 'destructive' });
    }
  };

  const updateExpenseAction = async (id: string, updates: Partial<Expense>) => {
    try {
      await tripService.updateExpense(id, updates);
      const existing = state.expenses.find(e => e.id === id);
      if (existing) dispatch({ type: 'UPDATE_EXPENSE', payload: { ...existing, ...updates } });
    } catch (error) {
      console.error('Failed to update expense:', error);
      toast({ title: 'Error', description: 'Failed to update expense.', variant: 'destructive' });
    }
  };

  const deleteExpenseAction = async (id: string) => {
    try {
      await tripService.deleteExpense(id);
      dispatch({ type: 'DELETE_EXPENSE', payload: id });
    } catch (error) {
      console.error('Failed to delete expense:', error);
      toast({ title: 'Error', description: 'Failed to delete expense.', variant: 'destructive' });
    }
  };

  const getCostBreakdown = (): CostBreakdown => {
    const preferred = state.activeTrip?.currency || 'USD';
    let transport = 0, lodging = 0, activities = 0, services = 0;
    state.pois.forEach(poi => {
      const cost = poi.details.cost?.amount || 0;
      const cur = poi.details.cost?.currency || preferred;
      const converted = state.exchangeRates ? (convertToPreferred(cost, cur, state.exchangeRates) ?? cost) : cost;
      if (poi.category === 'accommodation') lodging += converted;
      else if (poi.category === 'eatery' || poi.category === 'attraction') activities += converted;
      else if (poi.category === 'service') services += converted;
    });
    state.transportation.forEach(t => {
      const cost = t.cost.total_amount || 0;
      const cur = t.cost.currency || preferred;
      const converted = state.exchangeRates ? (convertToPreferred(cost, cur, state.exchangeRates) ?? cost) : cost;
      transport += converted;
    });
    // Add manual expenses
    let manualExpenses = 0;
    state.expenses.forEach(e => {
      const converted = state.exchangeRates ? (convertToPreferred(e.amount, e.currency, state.exchangeRates) ?? e.amount) : e.amount;
      manualExpenses += converted;
    });
    const total = transport + lodging + activities + services + manualExpenses;
    return { transport, lodging, activities, services, total };
  };

  const CURRENCY_SYMBOLS: Record<string, string> = { USD: '$', ILS: '₪', EUR: '€', GBP: '£', PHP: '₱', THB: '฿', JPY: '¥', CNY: '¥', KRW: '₩', INR: '₹', MYR: 'RM', SGD: 'S$', AUD: 'A$', NZD: 'NZ$', CAD: 'C$', CHF: 'CHF', SEK: 'kr', NOK: 'kr', DKK: 'kr', PLN: 'zł', CZK: 'Kč', HUF: 'Ft', TRY: '₺', MXN: 'MX$', BRL: 'R$', ZAR: 'R', EGP: 'E£', IDR: 'Rp', VND: '₫', TWD: 'NT$', HKD: 'HK$', AED: 'د.إ', SAR: '﷼', QAR: 'QR', KWD: 'KD', JOD: 'JD', GEL: '₾', ISK: 'kr', RON: 'lei', BGN: 'лв' };

  const formatCurrency = (amount: number, currency?: string): string => {
    const cur = currency || state.activeTrip?.currency || 'USD';
    return `${CURRENCY_SYMBOLS[cur] || cur + ' '}${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  };

  const formatDualCurrency = (amount: number, originalCurrency: string): string => {
    const preferred = state.activeTrip?.currency || 'ILS';
    const original = formatCurrency(amount, originalCurrency);
    if (originalCurrency === preferred) return original;
    if (!state.exchangeRates) return original;
    const converted = convertToPreferred(amount, originalCurrency, state.exchangeRates);
    if (converted === null) {
      fetchSingleRate(originalCurrency, preferred).then(rate => {
        if (rate && state.exchangeRates) {
          const updatedRates = { ...state.exchangeRates, rates: { ...state.exchangeRates.rates, [originalCurrency]: rate } };
          dispatch({ type: 'SET_EXCHANGE_RATES', payload: updatedRates });
        }
      });
      return original;
    }
    return `${original} (${formatCurrency(Math.round(converted), preferred)})`;
  };

  const convertToPreferredCurrency = (amount: number, fromCurrency: string): number | null => {
    if (!state.exchangeRates) return null;
    return convertToPreferred(amount, fromCurrency, state.exchangeRates);
  };

  return (
    <TripContext.Provider value={{
      state, dispatch, loadTrips, loadTripData, createNewTrip, updateCurrentTrip, deleteCurrentTrip,
      addPOI, updatePOI: updatePOIAction, deletePOI: deletePOIAction,
      addTransportation: addTransportationAction, updateTransportation: updateTransportationAction, deleteTransportation: deleteTransportationAction,
      addMission: addMissionAction, updateMission: updateMissionAction, deleteMission: deleteMissionAction,
      addExpense: addExpenseAction, updateExpense: updateExpenseAction, deleteExpense: deleteExpenseAction,
      getCostBreakdown, formatCurrency, formatDualCurrency, convertToPreferredCurrency,
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (!context) throw new Error('useTrip must be used within a TripProvider');
  return context;
}
