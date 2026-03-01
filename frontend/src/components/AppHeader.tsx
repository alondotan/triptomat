import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  Compass,
  Map,
  MapPin,
  Plane,
  Star,
  Table2,
  DollarSign,
  CheckSquare,
  Users,
  Inbox,
  Hotel,
  Menu,
  ChevronDown,
  Plus,
  Trash2,
  LogOut,
  Pencil,
  Settings,
  Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useState, useEffect } from 'react';
import { useTripList } from '@/context/TripListContext';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { CreateTripForm } from './forms/CreateTripForm';
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

const navItems = [
  { path: '/', label: 'Timeline', icon: CalendarDays },
  { path: '/pois', label: 'POIs', icon: MapPin },
  { path: '/accommodation', label: 'Stay', icon: Hotel },
  { path: '/transport', label: 'Transport', icon: Plane },
  { path: '/recommendations', label: 'Recs', icon: Star },
  { path: '/itinerary', label: 'Itinerary', icon: Table2 },
  { path: '/map', label: 'Map', icon: Map },
  { path: '/budget', label: 'Budget', icon: DollarSign },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
  { path: '/contacts', label: 'Contacts', icon: Users },
  { path: '/inbox', label: 'Inbox', icon: Inbox },
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

export function AppHeader() {
  const location = useLocation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [hamburgerOpen, setHamburgerOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [prefsCurrency, setPrefsCurrency] = useState('');
  const [inboxUnread, setInboxUnread] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('inbox_unread_count') || '0', 10); } catch { return 0; }
  });
  const { trips } = useTripList();
  const { activeTrip, setActiveTrip, deleteCurrentTrip, updateCurrentTrip } = useActiveTrip();
  const { toast } = useToast();

  useEffect(() => {
    const handler = (e: Event) => setInboxUnread((e as CustomEvent).detail.count);
    window.addEventListener('inboxUnreadChanged', handler);
    return () => window.removeEventListener('inboxUnreadChanged', handler);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const openEditDialog = () => {
    if (!activeTrip) return;
    setEditName(activeTrip.name);
    setEditStartDate(activeTrip.startDate);
    setEditEndDate(activeTrip.endDate);
    setHamburgerOpen(false);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    await updateCurrentTrip({ name: editName, startDate: editStartDate, endDate: editEndDate });
    setEditDialogOpen(false);
  };

  const openPrefs = () => {
    setPrefsCurrency(activeTrip?.currency || 'ILS');
    setHamburgerOpen(false);
    setPrefsOpen(true);
  };

  const handleSavePrefs = async () => {
    if (activeTrip) {
      await updateCurrentTrip({ currency: prefsCurrency });
      toast({ title: 'Preferences saved', description: `Currency set to ${prefsCurrency}` });
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
            <Button variant="ghost" size="icon" onClick={() => setHamburgerOpen(true)}>
              <Menu size={22} />
            </Button>
          </div>

          {/* Center: Trip name */}
          <div className="flex items-center justify-center min-w-0">
            <span className="font-bold text-base truncate">
              {activeTrip?.name || 'Triptomat'}
            </span>
          </div>

          {/* Right: Inbox */}
          <div className="flex items-center justify-end">
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
          </div>
        </div>

        {/* ── DESKTOP HEADER ── */}
        <div className="hidden md:flex items-center gap-3">
          <RouterNavLink to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-hero-gradient text-primary-foreground">
              <Compass size={20} />
            </div>
          </RouterNavLink>

          {activeTrip ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1 font-bold text-base sm:text-lg px-1 sm:px-2 max-w-[180px] sm:max-w-none truncate">
                  {activeTrip.name}
                  <ChevronDown size={16} className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {trips.map(trip => (
                  <DropdownMenuItem
                    key={trip.id}
                    onClick={() => setActiveTrip(trip.id)}
                    className={cn(trip.id === activeTrip?.id && 'bg-accent')}
                  >
                    <div className="flex flex-col">
                      <span>{trip.name}</span>
                      <span className="text-xs text-muted-foreground">{trip.countries.join(', ')}</span>
                    </div>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={openEditDialog}>
                  <Pencil size={14} className="mr-2" /> Edit Trip
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setNewTripOpen(true)}>
                  <Plus size={14} className="mr-2" /> New Trip
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => setDeleteDialogOpen(true)}
                >
                  <Trash2 size={14} className="mr-2" /> Delete Trip
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="text-muted-foreground text-sm">No trip selected</span>
          )}
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-1">
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
                {item.label}
              </RouterNavLink>
            );
          })}
        </nav>

        {/* Desktop user actions */}
        <div className="hidden md:flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => { setPrefsCurrency(activeTrip?.currency || 'ILS'); setPrefsOpen(true); }} title="Preferences">
            <Settings size={18} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
            <LogOut size={18} />
          </Button>
        </div>

      </div>

      {/* ── MOBILE HAMBURGER SHEET ── */}
      <Sheet open={hamburgerOpen} onOpenChange={setHamburgerOpen}>
        <SheetContent side="left" className="px-0 w-72">
          <SheetHeader className="px-6 pb-4 border-b border-border">
            <SheetTitle className="text-left flex items-center gap-2">
              <Compass size={18} /> Triptomat
            </SheetTitle>
          </SheetHeader>

          <div className="flex flex-col overflow-y-auto">
            {/* Trip list */}
            {trips.length > 0 && (
              <div className="py-3">
                <p className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">My Trips</p>
                {trips.map(trip => (
                  <button
                    key={trip.id}
                    onClick={() => { setActiveTrip(trip.id); setHamburgerOpen(false); }}
                    className="w-full flex items-center justify-between px-6 py-2.5 text-sm hover:bg-muted transition-colors"
                  >
                    <div className="text-left">
                      <p className="font-medium">{trip.name}</p>
                      {trip.countries.length > 0 && (
                        <p className="text-xs text-muted-foreground">{trip.countries.join(', ')}</p>
                      )}
                    </div>
                    {trip.id === activeTrip?.id && <Check size={16} className="text-primary shrink-0" />}
                  </button>
                ))}
              </div>
            )}

            <div className="mx-6 border-t border-border" />

            {/* Trip actions */}
            <div className="py-3">
              <p className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Trip</p>
              <button
                onClick={openEditDialog}
                disabled={!activeTrip}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-40"
              >
                <Pencil size={16} /> Edit Trip
              </button>
              <button
                onClick={() => { setHamburgerOpen(false); setNewTripOpen(true); }}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Plus size={16} /> New Trip
              </button>
              <button
                onClick={() => { setHamburgerOpen(false); setDeleteDialogOpen(true); }}
                disabled={!activeTrip}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-destructive hover:bg-muted transition-colors disabled:opacity-40"
              >
                <Trash2 size={16} /> Delete Trip
              </button>
            </div>

            <div className="mx-6 border-t border-border" />

            {/* Preferences & tools */}
            <div className="py-3">
              <p className="px-6 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Settings</p>
              <button
                onClick={openPrefs}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
              >
                <Settings size={16} /> User Preferences
              </button>
            </div>

            <div className="mx-6 border-t border-border" />

            <div className="py-3">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-6 py-2.5 text-sm font-medium text-destructive hover:bg-muted transition-colors"
              >
                <LogOut size={16} /> Sign Out
              </button>
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
            <AlertDialogTitle>Delete Trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{activeTrip?.name}" and all its data. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { deleteCurrentTrip(); setDeleteDialogOpen(false); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Trip
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Trip Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Trip</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1">
              <label className="text-sm font-medium">Trip Name</label>
              <input
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={editName}
                onChange={e => setEditName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Start Date</label>
                <input
                  type="date"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editStartDate}
                  onChange={e => setEditStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">End Date</label>
                <input
                  type="date"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={editEndDate}
                  min={editStartDate}
                  onChange={e => setEditEndDate(e.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveEdit} disabled={!editName.trim()}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* User Preferences Dialog */}
      <Dialog open={prefsOpen} onOpenChange={setPrefsOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>User Preferences</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Display Currency</label>
              <p className="text-xs text-muted-foreground">All costs will be shown converted to this currency.</p>
              <Select value={prefsCurrency} onValueChange={setPrefsCurrency}>
                <SelectTrigger>
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
              <Button variant="outline" size="sm" onClick={() => setPrefsOpen(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSavePrefs}>Save</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

    </header>
    </>
  );
}
