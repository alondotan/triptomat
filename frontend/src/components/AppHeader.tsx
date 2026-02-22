import { NavLink as RouterNavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  CalendarDays,
  Map,
  MapPin,
  Plane,
  Star,
  Table2,
  DollarSign,
  CheckSquare,
  Compass,
  Inbox,
  ChevronDown,
  Plus,
  Trash2,
  LogOut,
  Key,
  Copy,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MobileBottomNav } from './MobileBottomNav';
import { useState, useEffect } from 'react';
import { useTrip } from '@/context/TripContext';
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

const navItems = [
  { path: '/', label: 'Timeline', icon: CalendarDays },
  { path: '/pois', label: 'POIs', icon: MapPin },
  { path: '/transport', label: 'Transport', icon: Plane },
  { path: '/recommendations', label: 'Recs', icon: Star },
  { path: '/itinerary', label: 'Itinerary', icon: Table2 },
  { path: '/map', label: 'Map', icon: Map },
  { path: '/budget', label: 'Budget', icon: DollarSign },
  { path: '/tasks', label: 'Tasks', icon: CheckSquare },
  { path: '/inbox', label: 'Inbox', icon: Inbox },
];

export function AppHeader() {
  const location = useLocation();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [newTripOpen, setNewTripOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [webhookToken, setWebhookToken] = useState<string | null>(null);
  const [inboxUnread, setInboxUnread] = useState<number>(() => {
    try { return parseInt(localStorage.getItem('inbox_unread_count') || '0', 10); } catch { return 0; }
  });
  const { state, dispatch, deleteCurrentTrip, updateCurrentTrip } = useTrip();
  const { toast } = useToast();

  useEffect(() => {
    supabase.from('webhook_tokens').select('token').maybeSingle().then(({ data }) => {
      if (data) setWebhookToken(data.token);
    });
  }, []);

  useEffect(() => {
    const handler = (e: Event) => setInboxUnread((e as CustomEvent).detail.count);
    window.addEventListener('inboxUnreadChanged', handler);
    return () => window.removeEventListener('inboxUnreadChanged', handler);
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  const openEditDialog = () => {
    if (!state.activeTrip) return;
    setEditName(state.activeTrip.name);
    setEditStartDate(state.activeTrip.startDate);
    setEditEndDate(state.activeTrip.endDate);
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    await updateCurrentTrip({ name: editName, startDate: editStartDate, endDate: editEndDate });
    setEditDialogOpen(false);
  };

  const copyWebhookUrl = (type: 'travel' | 'recommendation') => {
    const base = import.meta.env.VITE_SUPABASE_URL;
    const url = `${base}/functions/v1/${type === 'travel' ? 'travel-webhook' : 'recommendation-webhook'}?token=${webhookToken}`;
    navigator.clipboard.writeText(url);
    toast({ title: 'Copied!', description: `${type} webhook URL copied to clipboard` });
  };

  return (
    <>
    <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container px-3 sm:px-6 flex h-14 sm:h-16 items-center justify-between">
        {/* Logo + Trip Selector */}
        <div className="flex items-center gap-3">
          <RouterNavLink to="/" className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-hero-gradient text-primary-foreground">
              <Compass size={20} />
            </div>
          </RouterNavLink>

          {state.activeTrip ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="gap-1 font-bold text-base sm:text-lg px-1 sm:px-2 max-w-[180px] sm:max-w-none truncate">
                  {state.activeTrip.name}
                  <ChevronDown size={16} className="text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                {state.trips.map(trip => (
                  <DropdownMenuItem
                    key={trip.id}
                    onClick={() => dispatch({ type: 'SET_ACTIVE_TRIP', payload: trip.id })}
                    className={cn(trip.id === state.activeTrip?.id && 'bg-accent')}
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

        {/* User actions */}
        <div className="hidden md:flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => setWebhookDialogOpen(true)} title="Webhook URLs">
            <Key size={18} />
          </Button>
          <Button variant="ghost" size="icon" onClick={handleSignOut} title="Sign out">
            <LogOut size={18} />
          </Button>
        </div>

      </div>

      {/* New Trip Form (rendered outside DropdownMenu to prevent focus conflicts) */}
      <CreateTripForm open={newTripOpen} onOpenChange={setNewTripOpen} />

      {/* Delete Trip Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Trip?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{state.activeTrip?.name}" and all its data. This action cannot be undone.
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

      {/* Webhook URLs Dialog */}
      <Dialog open={webhookDialogOpen} onOpenChange={setWebhookDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Webhook URLs</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Use these URLs to send data from external services. Your personal token is included.
            </p>
            {webhookToken ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Travel Webhook (emails/bookings)</label>
                  <div className="flex gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                      {import.meta.env.VITE_SUPABASE_URL}/functions/v1/travel-webhook?token={webhookToken}
                    </code>
                    <Button size="icon" variant="outline" onClick={() => copyWebhookUrl('travel')}>
                      <Copy size={14} />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Recommendation Webhook</label>
                  <div className="flex gap-2">
                    <code className="flex-1 p-2 bg-muted rounded text-xs break-all">
                      {import.meta.env.VITE_SUPABASE_URL}/functions/v1/recommendation-webhook?token={webhookToken}
                    </code>
                    <Button size="icon" variant="outline" onClick={() => copyWebhookUrl('recommendation')}>
                      <Copy size={14} />
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Loading token...</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
    <MobileBottomNav onWebhookOpen={() => setWebhookDialogOpen(true)} />
    </>
  );
}
