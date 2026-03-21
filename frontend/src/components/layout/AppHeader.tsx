import { NavLink as RouterNavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  Compass,
  Map,
  Table2,
  DollarSign,
  CheckSquare,
  Inbox,
  Menu,
  ChevronDown,
  Plus,
  Trash2,
  LogOut,
  Pencil,
  Settings,
  Check,
  Network,
  Share2,
  Sparkles,
  MoreVertical,
  ListIcon,
  FileText,
  LayoutDashboard,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState, useEffect, useCallback } from 'react';
import { useTripList } from '@/context/TripListContext';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useLanguage } from '@/context/LanguageContext';
import { CreateTripForm } from '@/components/forms/CreateTripForm';
import { EditTripDialog } from '@/components/trip/EditTripDialog';
import { LocationTreeDialog } from '@/components/trip/LocationTreeDialog';
import { ShareTripDialog } from '@/components/trip/ShareTripDialog';
import { AIChatSheet, type TripContext } from '@/components/chat/AIChatSheet';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Bell } from 'lucide-react';
import { subscribeToPush, unsubscribeFromPush, isSubscribed, getPushPermissionState } from '@/services/pushNotificationService';
import { useAiUsage } from '@/hooks/useAiUsage';
import { Crown } from 'lucide-react';

const navItems = [
  { path: '/overview', labelKey: 'nav.home', icon: LayoutDashboard },
  { path: '/', labelKey: 'nav.timeline', icon: CalendarDays },
  { path: '/itinerary', labelKey: 'nav.itinerary', icon: Table2 },
  { path: '/map', labelKey: 'nav.map', icon: Map },
  { path: '/budget', labelKey: 'nav.budget', icon: DollarSign },
  { path: '/tasks', labelKey: 'nav.tasks', icon: CheckSquare },
  { path: '/documents', labelKey: 'nav.docs', icon: FileText },
  { path: '/inbox', labelKey: 'nav.inbox', icon: Inbox },
];

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

interface AppHeaderProps {
  heroScrolledPast?: boolean;
  hasHero?: boolean;
}

const LANGUAGE_OPTIONS = [
  { code: 'he' as const, label: 'עברית' },
  { code: 'en' as const, label: 'English' },
];

export function AppHeader({ heroScrolledPast = false, hasHero = false }: AppHeaderProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const location = useLocation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [prefsCurrency, setPrefsCurrency] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushPermission, setPushPermission] = useState<ReturnType<typeof getPushPermissionState>>('default');
  const [inboxUnread, setInboxUnread] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('inbox_unread_count') || '0', 10); } catch { return 0; }
  });
  const { trips, isLoading: tripsLoading } = useTripList();
  const { activeTrip, setActiveTrip, deleteCurrentTrip, updateCurrentTrip, tripLocationTree, myRole } = useActiveTrip();
  const [locationTreeOpen, setLocationTreeOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [tierDialogOpen, setTierDialogOpen] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  const { data: aiUsage } = useAiUsage();
  const userTier = aiUsage?.tier || 'free';

  // Navigate to trips page when no trips exist
  useEffect(() => {
    if (!tripsLoading && trips.length === 0) {
      navigate('/trips');
    }
  }, [tripsLoading, trips.length, navigate]);

  // 3 most recently opened trips for the dropdown menus
  const recentTrips = (() => {
    let lastOpened: Record<string, number> = {};
    try { lastOpened = JSON.parse(localStorage.getItem('trip_last_opened') || '{}'); } catch { /* ignore */ }
    return [...trips].sort((a, b) => (lastOpened[b.id] || 0) - (lastOpened[a.id] || 0)).slice(0, 3);
  })();

  useEffect(() => {
    const handler = (e: Event) => setInboxUnread((e as CustomEvent).detail.count);
    window.addEventListener('inboxUnreadChanged', handler);
    return () => window.removeEventListener('inboxUnreadChanged', handler);
  }, []);

  // Recalculate unread count from DB — called on mount + real-time changes
  const refreshUnread = useCallback(async () => {
    try {
      const { data } = await supabase.from('source_emails').select('id').eq('status', 'linked');
      if (!data) return;
      const readIdsRaw = localStorage.getItem('inbox_read_ids');
      const readIds = readIdsRaw ? new Set<string>(JSON.parse(readIdsRaw)) : null;
      // If user has never visited inbox, don't show badge (first-visit init happens in SourceEmailsDashboard)
      if (!readIds) return;
      const count = data.filter(row => !readIds.has(row.id)).length;
      setInboxUnread(count);
      localStorage.setItem('inbox_unread_count', String(count));
    } catch { /* ignore */ }
  }, []);

  // Refresh unread on mount + subscribe to real-time source_emails changes
  useEffect(() => {
    refreshUnread();
    const channel = supabase
      .channel('header-inbox-unread')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'source_emails' }, () => {
        refreshUnread();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshUnread]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    const { getCognitoLogoutUrl } = await import('@/lib/cognito');
    window.location.href = getCognitoLogoutUrl();
  };

  const openEditDialog = () => {
    setHamburgerOpen(false);
    setEditDialogOpen(true);
  };

  // Check push subscription state when prefs dialog opens
  useEffect(() => {
    if (prefsOpen) {
      setPushPermission(getPushPermissionState());
      isSubscribed().then(setPushEnabled).catch(() => setPushEnabled(false));
    }
  }, [prefsOpen]);

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const success = await subscribeToPush();
      setPushEnabled(success);
      setPushPermission(getPushPermissionState());
      toast({ title: success ? t('preferences.notificationsEnabled') : t('preferences.notificationsDenied') });
    } else {
      await unsubscribeFromPush();
      setPushEnabled(false);
      toast({ title: t('preferences.notificationsDisabled') });
    }
  };

  const handleSavePrefs = async () => {
    if (activeTrip) {
      await updateCurrentTrip({ currency: prefsCurrency });
      toast({ title: t('preferences.saved'), description: t('preferences.currencySet', { currency: prefsCurrency }) });
    }
    setPrefsOpen(false);
  };

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container px-3 sm:px-6 flex h-14 sm:h-16 items-center justify-between">

        {/* ── MOBILE HEADER ── */}
        <div className="md:hidden grid grid-cols-[auto_1fr_auto] items-center w-full">
          {/* Left: Hamburger */}
          <div className="flex items-center">
            <Button variant="ghost" size="icon" aria-label={t('nav.menu')} onClick={() => setHamburgerOpen(true)}>
              <Menu size={22} />
            </Button>
          </div>

          {/* Center: Trip name (fades in when hero scrolls past) */}
          <div className="flex items-center justify-center min-w-0">
            <span className={cn(
              'font-bold text-base truncate transition-opacity duration-300',
              hasHero && !heroScrolledPast ? 'opacity-0' : 'opacity-100'
            )}>
              {activeTrip?.name || t('nav.triptomat')}
            </span>
          </div>

          {/* Right: AI + Inbox + User menu */}
          <div className="flex items-center justify-end">
            <button
              onClick={() => setAiChatOpen(true)}
              className="relative p-2 rounded-lg transition-colors text-muted-foreground"
              aria-label="AI Chat"
            >
              <Sparkles size={22} />
            </button>
            <RouterNavLink
              to="/inbox"
              className={cn(
                'relative p-2 rounded-lg transition-colors',
                location.pathname === '/inbox' ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Inbox size={22} />
              {inboxUnread > 0 && (
                <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                  {inboxUnread > 9 ? '9+' : inboxUnread}
                </span>
              )}
            </RouterNavLink>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="p-2 rounded-lg transition-colors text-muted-foreground" aria-label={t('nav.menu')}>
                  <MoreVertical size={22} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => setTierDialogOpen(true)}>
                  <Crown size={14} className="mr-2" />
                  <span className="flex-1">{t('aiTier.dialogTitle')}</span>
                  <Badge variant={userTier === 'pro' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4 font-semibold ml-1">
                    {userTier === 'pro' ? t('aiTier.pro') : t('aiTier.free')}
                  </Badge>
                </DropdownMenuItem>
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
        </div>

        {/* ── DESKTOP HEADER ── */}
        <div className="hidden md:flex items-center gap-1">
          <img src="/icon.png" alt="Triptomat" className="h-7 w-7 rounded shrink-0" />
          {activeTrip ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label={t('nav.menu')}>
                  <ChevronDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {recentTrips.map(trip => (
                  <DropdownMenuItem
                    key={trip.id}
                    onClick={() => setActiveTrip(trip.id)}
                    className={cn(trip.id === activeTrip?.id && 'bg-accent')}
                  >
                    <div className="flex flex-col">
                      <span className="flex items-center gap-1.5">
                        {trip.name}
                        {trip.myRole === 'editor' && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-normal">{t('tripsPage.shared')}</Badge>
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">{trip.countries.join(', ')}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => navigate('/trips')}>
                  <ListIcon size={14} className="mr-2" /> {t('nav.showTrips')}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openEditDialog}>
                  <Pencil size={14} className="mr-2" /> {t('editTrip.editTrip')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocationTreeOpen(true)}>
                  <Network size={14} className="mr-2" /> {t('locationTree.title')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShareOpen(true)}>
                  <Share2 size={14} className="mr-2" /> {t('shareTrip.title')}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNewTripOpen(true)}>
                  <Plus size={14} className="mr-2" /> {t('createTrip.newTrip')}
                </DropdownMenuItem>
                {myRole === 'owner' && (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => setDeleteDialogOpen(true)}
                  >
                    <Trash2 size={14} className="mr-2" /> {t('deleteTrip.button')}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <RouterNavLink to="/" className="flex items-center" aria-label={t('nav.triptomat')}>
              <span className="sr-only">Triptomat</span>
            </RouterNavLink>
          )}
        </div>

        {/* Trip name — fades in when hero is scrolled past */}
        {activeTrip && (
          <span className={cn(
            'hidden md:block font-bold text-base truncate max-w-[200px] transition-all duration-300',
            heroScrolledPast ? 'opacity-100' : 'opacity-0'
          )}>
            {activeTrip.name}
          </span>
        )}

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center flex-1 justify-evenly">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            const showUnread = item.path === '/inbox' && inboxUnread > 0;

            return (
              <RouterNavLink
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                )}
              >
                <div className="relative">
                  <Icon size={18} />
                  {showUnread && (
                    <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-500 text-[9px] font-bold text-white">
                      {inboxUnread > 9 ? '9+' : inboxUnread}
                    </span>
                  )}
                </div>
                {t(item.labelKey)}
              </RouterNavLink>
            );
          })}
        </nav>

        {/* Desktop user actions */}
        <div className="hidden md:flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setAiChatOpen(true)} aria-label="AI Chat" title={t('nav.aiAssistant')} className="relative">
            <Sparkles size={18} />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t('nav.menu')} title={t('nav.menu')}>
                <MoreVertical size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => setTierDialogOpen(true)}>
                <Crown size={14} className="mr-2" />
                <span className="flex-1">{t('aiTier.dialogTitle')}</span>
                <Badge variant={userTier === 'pro' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0 h-4 font-semibold ml-1">
                  {userTier === 'pro' ? t('aiTier.pro') : t('aiTier.free')}
                </Badge>
              </DropdownMenuItem>
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

      </div>

      {/* ── MOBILE HAMBURGER SHEET ── */}
      <Sheet open={hamburgerOpen} onOpenChange={setHamburgerOpen}>
        <SheetContent side="left" className="px-0 w-72 overscroll-contain">
          <SheetHeader className="px-6 pb-4 border-b border-border">
            <SheetTitle className="text-left flex items-center gap-2">
              <Compass size={18} /> {t('nav.triptomat')}
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col overflow-y-auto">
            {/* Trip list — 3 most recent */}
            {trips.length > 0 && (
              <div className="py-3">
                <p className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('nav.trips')}</p>
                {recentTrips.map(trip => (
                  <button
                    key={trip.id}
                    onClick={() => { setActiveTrip(trip.id); setHamburgerOpen(false); }}
                    className="w-full flex items-center justify-between px-6 py-2.5 text-sm hover:bg-muted transition-colors"
                  >
                    <div className="text-left">
                      <div className="flex items-center gap-1.5">
                        <p className="font-medium">{trip.name}</p>
                        {trip.myRole === 'editor' && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-3.5 font-normal">{t('tripsPage.shared')}</Badge>
                        )}
                      </div>
                      {trip.countries.length > 0 && (
                        <p className="text-xs text-muted-foreground">{trip.countries.join(', ')}</p>
                      )}
                    </div>
                    {trip.id === activeTrip?.id && <Check size={16} className="text-primary shrink-0" />}
                  </button>
                ))}
                <button
                  onClick={() => { setHamburgerOpen(false); navigate('/trips'); }}
                  className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-primary hover:bg-muted transition-colors"
                >
                  <ListIcon size={16} /> {t('nav.showTrips')}
                </button>
              </div>
            )}

            <div className="mx-6 border-t border-border" />

            {/* Trip actions */}
            <div className="py-3">
              <p className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('nav.trips')}</p>
              <button
                onClick={openEditDialog}
                disabled={!activeTrip}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
              >
                <Pencil size={16} /> {t('editTrip.editTrip')}
              </button>
              <button
                onClick={() => { setHamburgerOpen(false); setLocationTreeOpen(true); }}
                disabled={!activeTrip}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
              >
                <Network size={16} /> {t('locationTree.title')}
              </button>
              <button
                onClick={() => { setHamburgerOpen(false); setShareOpen(true); }}
                disabled={!activeTrip}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
              >
                <Share2 size={16} /> {t('shareTrip.title')}
              </button>
              <button
                onClick={() => { setHamburgerOpen(false); setNewTripOpen(true); }}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Plus size={16} /> {t('createTrip.newTrip')}
              </button>
              {myRole === 'owner' && (
                <button
                  onClick={() => { setHamburgerOpen(false); setDeleteDialogOpen(true); }}
                  disabled={!activeTrip}
                  className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-destructive hover:bg-muted transition-colors disabled:opacity-40"
                >
                  <Trash2 size={16} /> {t('deleteTrip.button')}
                </button>
              )}
            </div>

          </div>
        </SheetContent>
      </Sheet>

      {/* New Trip Form */}
      <CreateTripForm open={newTripOpen} onOpenChange={setNewTripOpen} />

      {/* Delete Trip Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteTrip.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteTrip.message', { name: activeTrip?.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteCurrentTrip().then(() => navigate('/trips')); setDeleteDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('deleteTrip.button')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Trip Dialog */}
      <EditTripDialog open={editDialogOpen} onOpenChange={setEditDialogOpen} />

      {/* Location Tree Dialog */}
      <LocationTreeDialog open={locationTreeOpen} onOpenChange={setLocationTreeOpen} hierarchy={tripLocationTree} />

      {/* Share Trip Dialog */}
      <ShareTripDialog open={shareOpen} onOpenChange={setShareOpen} />

      {/* AI Chat */}
      <AIChatSheet
        open={aiChatOpen}
        onOpenChange={setAiChatOpen}
        tripContext={activeTrip ? {
          tripId: activeTrip.id,
          tripName: activeTrip.name,
          countries: activeTrip.countries,
          startDate: activeTrip.startDate,
          endDate: activeTrip.endDate,
          numberOfDays: activeTrip.numberOfDays,
          status: activeTrip.status,
          currency: activeTrip.currency,
          locations: (tripLocationTree || []).flatMap(n => [n.site, ...(n.sub_sites || []).flatMap(s => [s.site, ...(s.sub_sites || []).map(c => c.site)])]),
        } : null}
      />

      {/* User Preferences Dialog */}
      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('preferences.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="display-currency" className="text-sm font-medium">{t('preferences.displayCurrency')}</label>
              <p className="text-xs text-muted-foreground">{t('preferences.currencyDescription')}</p>
              <Select value={prefsCurrency} onValueChange={setPrefsCurrency}>
                <SelectTrigger id="display-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1200]">
                  {COMMON_CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="display-language" className="text-sm font-medium">{t('preferences.language')}</label>
              <p className="text-xs text-muted-foreground">{t('preferences.languageDescription')}</p>
              <Select value={language} onValueChange={(val) => setLanguage(val as 'he' | 'en')}>
                <SelectTrigger id="display-language">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="z-[1200]">
                  {LANGUAGE_OPTIONS.map(opt => (
                    <SelectItem key={opt.code} value={opt.code}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {pushPermission !== 'unsupported' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    <label htmlFor="push-notifications" className="text-sm font-medium">{t('preferences.notifications')}</label>
                  </div>
                  <Switch
                    id="push-notifications"
                    checked={pushEnabled}
                    onCheckedChange={handlePushToggle}
                    disabled={pushPermission === 'denied'}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  {pushPermission === 'denied' ? t('preferences.notificationsDenied') : t('preferences.notificationsDescription')}
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setPrefsOpen(false)}>{t('common.cancel')}</Button>
              <Button size="sm" onClick={handleSavePrefs}>{t('common.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Tier Comparison Dialog */}
      <Dialog open={tierDialogOpen} onOpenChange={setTierDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('aiTier.dialogTitle')}</DialogTitle>
            <p className="text-sm text-muted-foreground">{t('aiTier.dialogSubtitle')}</p>
          </DialogHeader>
          <div className="pt-2">
            {/* Column headers */}
            <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-0 items-center pb-2 border-b border-border mb-1">
              <div />
              <div className="text-center w-20">
                <Badge variant="secondary" className="text-xs px-2 py-0.5 font-semibold">
                  {t('aiTier.free')}
                </Badge>
                {userTier === 'free' && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t('aiTier.currentPlan')}</p>
                )}
              </div>
              <div className="text-center w-20">
                <Badge className="text-xs px-2 py-0.5 font-semibold bg-gradient-to-r from-amber-500 to-orange-500 border-0 text-white">
                  {t('aiTier.pro')}
                </Badge>
                {userTier === 'pro' ? (
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t('aiTier.currentPlan')}</p>
                ) : (
                  <p className="text-[10px] text-amber-600 font-medium mt-0.5">{t('aiTier.comingSoon')}</p>
                )}
              </div>
            </div>

            {/* Feature rows */}
            {[
              { label: t('aiTier.featureUrlAnalysis'), free: 5, pro: 50 },
              { label: t('aiTier.featureAiChat'), free: 20, pro: 200 },
              { label: t('aiTier.featureWhatsapp'), free: 15, pro: 150 },
              { label: t('aiTier.featureEmailParsing'), free: 10, pro: 100 },
            ].map((row, i) => (
              <div key={i} className={cn(
                'grid grid-cols-[1fr_auto_auto] gap-x-4 items-center py-2.5',
                i % 2 === 0 && 'bg-muted/40 -mx-6 px-6 rounded'
              )}>
                <span className="text-sm">{row.label}</span>
                <span className="text-xs text-muted-foreground text-center w-20">{t('aiTier.perDay', { count: row.free })}</span>
                <span className="text-xs font-medium text-center w-20">{t('aiTier.perDay', { count: row.pro })}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </header>
    </>
  );
}
