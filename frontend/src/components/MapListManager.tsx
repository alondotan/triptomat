import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Map, RefreshCw, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

interface MapList {
  id: string;
  url: string;
  name: string;
  last_synced_at: string | null;
  item_count: number;
  created_at: string;
}

interface MapListItem {
  id: string;
  place_name: string;
  synced_at: string;
}

export function MapListManager() {
  const { activeTrip } = useActiveTrip();
  const { toast } = useToast();
  const tripId = activeTrip?.id;

  const [lists, setLists] = useState<MapList[]>([]);
  const [items, setItems] = useState<Record<string, MapListItem[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [webhookToken, setWebhookToken] = useState<string | null>(null);

  const [showAdd, setShowAdd] = useState(false);
  const [newUrl, setNewUrl] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    supabase.from('webhook_tokens').select('token').single()
      .then(({ data }) => setWebhookToken(data?.token ?? null));
  }, []);

  const fetchLists = useCallback(async () => {
    if (!tripId) return;
    const { data } = await supabase
      .from('map_lists')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false });
    setLists((data as MapList[]) || []);
  }, [tripId]);

  useEffect(() => { fetchLists(); }, [fetchLists]);

  const loadItems = async (listId: string) => {
    const { data } = await supabase
      .from('map_list_items')
      .select('id, place_name, synced_at')
      .eq('list_id', listId)
      .order('synced_at', { ascending: true });
    setItems(prev => ({ ...prev, [listId]: (data as MapListItem[]) || [] }));
  };

  const toggleExpand = (listId: string) => {
    const next = !expanded[listId];
    setExpanded(prev => ({ ...prev, [listId]: next }));
    if (next && !items[listId]) loadItems(listId);
  };

  const handleAdd = async () => {
    if (!tripId || !newUrl.trim()) return;
    setAdding(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { data: newList, error } = await supabase
      .from('map_lists')
      .insert({
        trip_id: tripId,
        user_id: user!.id,
        url: newUrl.trim(),
        name: 'Google Maps List',
      })
      .select()
      .single();
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setAdding(false);
      return;
    }
    setNewUrl(''); setShowAdd(false);
    await fetchLists();
    setAdding(false);
    // Auto-sync immediately to fetch places and resolve the list name
    await handleSync(newList as MapList);
  };

  const handleSync = async (list: MapList) => {
    if (!webhookToken) return;
    setSyncing(prev => ({ ...prev, [list.id]: true }));
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/sync-maps-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: list.id, token: webhookToken }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      toast({
        title: `Synced "${list.name}"`,
        description: data.new_places > 0
          ? `${data.new_places} new places sent for analysis. ${data.total_places} total.`
          : `No new places found (${data.total_places} already synced).`,
      });
      await fetchLists();
      if (expanded[list.id]) loadItems(list.id);
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e.message, variant: 'destructive' });
    }
    setSyncing(prev => ({ ...prev, [list.id]: false }));
  };

  const handleDelete = async (listId: string) => {
    await supabase.from('map_lists').delete().eq('id', listId);
    setLists(prev => prev.filter(l => l.id !== listId));
  };

  if (!tripId) return null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map size={16} className="text-muted-foreground" />
          <h2 className="font-semibold text-sm">Google Maps Lists</h2>
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowAdd(v => !v)}>
          <Plus size={13} /> Add List
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Link a public Google Maps saved list. Places will be imported as recommendations.
      </p>

      {showAdd && (
        <div className="space-y-2 border rounded-md p-3 bg-muted/30">
          <Input placeholder="Google Maps list URL" value={newUrl} onChange={e => setNewUrl(e.target.value)} className="text-sm h-8" />
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAdd} disabled={adding || !newUrl.trim()}>
              {adding ? 'Adding…' : 'Add'}
            </Button>
          </div>
        </div>
      )}

      {lists.length === 0 && !showAdd && (
        <p className="text-xs text-muted-foreground text-center py-2">No lists yet.</p>
      )}

      <div className="space-y-2">
        {lists.map(list => (
          <div key={list.id} className="border rounded-md overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted/20">
              <button className="flex items-center gap-1 flex-1 min-w-0 text-left" onClick={() => toggleExpand(list.id)}>
                {expanded[list.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                <span className="text-sm font-medium truncate">{list.name}</span>
                <span className="text-xs text-muted-foreground ml-1 shrink-0">
                  {list.item_count > 0 && `(${list.item_count})`}
                </span>
              </button>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 shrink-0"
                onClick={() => handleSync(list)}
                disabled={syncing[list.id] || !webhookToken}
                title={list.last_synced_at ? 'Sync again' : 'Syncing...'}
              >
                <RefreshCw size={13} className={syncing[list.id] || !list.last_synced_at ? 'animate-spin' : ''} />
              </Button>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleDelete(list.id)}
                title="Remove list"
              >
                <Trash2 size={13} />
              </Button>
            </div>

            {expanded[list.id] && (
              <div className="px-3 py-2 space-y-1 border-t">
                <p className="text-xs text-muted-foreground">
                  {list.last_synced_at
                    ? `Last synced: ${new Date(list.last_synced_at).toLocaleString()}`
                    : 'Not synced yet — click ↻ to import.'}
                </p>
                {(items[list.id] || []).map(item => (
                  <div key={item.id} className="text-xs text-foreground py-0.5 flex items-center gap-1">
                    <span className="text-muted-foreground">•</span> {item.place_name}
                  </div>
                ))}
                {(items[list.id] || []).length === 0 && list.last_synced_at && (
                  <p className="text-xs text-muted-foreground">No items recorded.</p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
