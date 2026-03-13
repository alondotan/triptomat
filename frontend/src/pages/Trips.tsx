import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useTripList } from '@/context/TripListContext';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useWorldTree, type WorldTreeNode } from '@/hooks/useWorldTree';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CalendarDays, MapPin, Check, Settings, LogOut, MoreVertical, Plus, Compass } from 'lucide-react';
import { CreateTripForm } from '@/components/forms/CreateTripForm';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Trip } from '@/types/trip';

const COMMON_CURRENCIES = [
  { code: 'ILS', label: '₪ ILS — Israeli Shekel' },
  { code: 'USD', label: '$ USD — US Dollar' },
  { code: 'EUR', label: '€ EUR — Euro' },
  { code: 'GBP', label: '£ GBP — British Pound' },
  { code: 'JPY', label: '¥ JPY — Japanese Yen' },
  { code: 'AED', label: 'AED — UAE Dirham' },
  { code: 'CHF', label: 'CHF — Swiss Franc' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'THB', label: '฿ THB — Thai Baht' },
];

const COUNTRY_ALIASES: Record<string, string> = {
  'usa': 'united states of america',
  'uk': 'united kingdom',
  'uae': 'united arab emirates',
};

function findCountryNode(node: WorldTreeNode, countryName: string): WorldTreeNode | null {
  const lower = COUNTRY_ALIASES[countryName.toLowerCase()] || countryName.toLowerCase();
  let partialMatch: WorldTreeNode | null = null;
  if (node.type === 'country') {
    const nodeLower = node.name.toLowerCase();
    if (nodeLower === lower) return node;
    if (node.name_he.toLowerCase() === lower) return node;
    if (!partialMatch && (nodeLower.startsWith(lower) || lower.startsWith(nodeLower))) {
      partialMatch = node;
    }
  }
  for (const child of node.children ?? []) {
    const found = findCountryNode(child, countryName);
    if (found) return found;
  }
  return partialMatch;
}

function formatRelativeDate(dateStr: string, t: (key: string, opts?: Record<string, any>) => string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHr / 24);

  if (diffMin < 1) return t('relativeTime.now');
  if (diffMin < 60) return t('relativeTime.minutesAgo', { count: diffMin });
  if (diffHr < 24) return t('relativeTime.hoursAgo', { count: diffHr });
  if (diffDays < 7) return t('relativeTime.daysAgo', { count: diffDays });
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Get the destination image for the first country of a trip (same logic as DestinationHero) */
function getCountryImage(tree: WorldTreeNode | null, countries: string[]): string | null {
  if (!tree || !countries.length) return null;
  for (const country of countries) {
    const countryNode = findCountryNode(tree, country);
    if (!countryNode) continue;
    if (countryNode.image) return countryNode.image;
    for (const child of countryNode.children ?? []) {
      if (child.image) return child.image;
    }
  }
  return null;
}

function TripCard({ trip, isActive, tree, flagMap, onSelect, t }: {
  trip: Trip;
  isActive: boolean;
  tree: WorldTreeNode | null;
  flagMap: Map<string, string>;
  onSelect: () => void;
  t: (key: string, opts?: Record<string, any>) => string;
}) {
  const heroImage = getCountryImage(tree, trip.countries);

  return (
    <button
      onClick={onSelect}
      className={cn(
        'group relative overflow-hidden rounded-xl border text-left transition-all hover:shadow-lg hover:-translate-y-0.5',
        isActive
          ? 'border-primary ring-2 ring-primary/20 shadow-md'
          : 'border-border hover:border-primary/40'
      )}
    >
      {/* Hero image — country destination image */}
      <div className="relative h-40 bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
        {heroImage ? (
          <img
            src={heroImage}
            alt=""
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MapPin size={40} className="text-muted-foreground/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

        {isActive && (
          <div className="absolute top-3 right-3 bg-primary text-primary-foreground rounded-full p-1 shadow">
            <Check size={14} />
          </div>
        )}

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <h3 className="text-lg font-bold text-white drop-shadow-md truncate">{trip.name}</h3>
        </div>
      </div>

      {/* Card body */}
      <div className="p-4 space-y-3">
        {/* Countries with flag icons */}
        {trip.countries.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {trip.countries.map(country => {
              const flagUrl = flagMap.get(country);
              return (
                <div key={country} className="flex items-center gap-1.5 bg-muted rounded-full px-2.5 py-1">
                  {flagUrl && <img src={flagUrl} alt="" className="h-3.5 w-5 object-cover rounded-sm" />}
                  <span className="text-xs font-medium">{country}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <CalendarDays size={12} />
            <span>{t('tripsPage.updated', { time: formatRelativeDate(trip.updatedAt, t) })}</span>
          </div>
          {trip.myRole === 'editor' && (
            <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 font-normal">{t('tripsPage.shared')}</Badge>
          )}
        </div>

        {trip.startDate && trip.endDate && (
          <p className="text-xs text-muted-foreground">
            {new Date(trip.startDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'short' })}
            {' — '}
            {new Date(trip.endDate).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        )}
      </div>
    </button>
  );
}

const TripsPage = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { trips } = useTripList();
  const { activeTrip, setActiveTrip, updateCurrentTrip } = useActiveTrip();
  const { tree } = useWorldTree();
  const { toast } = useToast();
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsCurrency, setPrefsCurrency] = useState('');
  const [newTripOpen, setNewTripOpen] = useState(false);

  // Build country name → flag URL map
  const flagMap = useMemo(() => {
    const map = new Map<string, string>();
    if (!tree) return map;
    function walk(node: WorldTreeNode) {
      if (node.type === 'country' && node.flag) {
        map.set(node.name, node.flag);
      }
      for (const child of node.children ?? []) walk(child);
    }
    walk(tree);
    return map;
  }, [tree]);

  const sortedTrips = useMemo(
    () => [...trips].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [trips]
  );

  const handleSelect = (tripId: string) => {
    setActiveTrip(tripId);
    navigate('/');
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const handleSavePrefs = async () => {
    if (activeTrip) {
      await updateCurrentTrip({ currency: prefsCurrency });
      toast({ title: t('preferences.saved'), description: t('preferences.currencySet', { currency: prefsCurrency }) });
    }
    setPrefsOpen(false);
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Minimal header — just logo + user menu */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container max-w-5xl mx-auto px-4 flex h-14 items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/icon.png" alt="Triptomat" className="h-7 w-7 rounded" />
            <span className="font-bold text-base">{t('nav.triptomat')}</span>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('nav.menu')}>
                <MoreVertical size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => { setPrefsCurrency(activeTrip?.currency || 'ILS'); setPrefsOpen(true); }}>
                <Settings size={14} className="mr-2" /> {t('nav.settings')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={handleSignOut}>
                <LogOut size={14} className="mr-2" /> {t('nav.signOut')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Trips grid */}
      <div className="container max-w-5xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{t('tripsPage.myTrips')}</h1>

        {sortedTrips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <Compass size={56} className="text-primary mb-6" />
            <h2 className="text-2xl font-bold mb-3">{t('tripsPage.welcomeTitle')}</h2>
            <p className="text-muted-foreground max-w-md mb-8">{t('tripsPage.welcomeSubtitle')}</p>
            <Button size="lg" className="gap-2" onClick={() => setNewTripOpen(true)}>
              <Plus size={20} />
              {t('tripsPage.welcomeCta')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sortedTrips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                isActive={trip.id === activeTrip?.id}
                tree={tree}
                flagMap={flagMap}
                onSelect={() => handleSelect(trip.id)}
                t={t}
              />
            ))}
            {/* New trip card */}
            <button
              onClick={() => setNewTripOpen(true)}
              className="group relative overflow-hidden rounded-xl border border-dashed border-border text-left transition-all hover:shadow-lg hover:-translate-y-0.5 hover:border-primary/40"
            >
              <div className="flex flex-col items-center justify-center h-full min-h-[220px] gap-3 text-muted-foreground group-hover:text-primary transition-colors">
                <Plus size={36} className="opacity-50 group-hover:opacity-100 transition-opacity" />
                <span className="font-medium">{t('createTrip.newTrip')}</span>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* New Trip Form */}
      <CreateTripForm open={newTripOpen} onOpenChange={setNewTripOpen} />

      {/* Preferences dialog */}
      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('preferences.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="trips-display-currency" className="text-sm font-medium">{t('preferences.displayCurrency')}</label>
              <p className="text-xs text-muted-foreground">{t('preferences.currencyDescription')}</p>
              <Select value={prefsCurrency} onValueChange={setPrefsCurrency}>
                <SelectTrigger id="trips-display-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {COMMON_CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setPrefsOpen(false)}>{t('common.cancel')}</Button>
              <Button size="sm" onClick={handleSavePrefs}>{t('common.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TripsPage;
