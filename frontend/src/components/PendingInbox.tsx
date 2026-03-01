import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Inbox, Link2, ExternalLink, Plane, Hotel, MapPin, Trash2, UtensilsCrossed, Star } from 'lucide-react';
import { SourceEmail, SourceRecommendation } from '@/types/webhook';
import { fetchSourceEmails, linkSourceEmailToTrip, deleteSourceEmail } from '@/services/webhookService';
import { fetchPendingRecommendations, linkRecommendationToTrip, deleteRecommendation } from '@/services/recommendationService';
import { useTripList } from '@/context/TripListContext';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

export function PendingInbox() {
  const { trips } = useTripList();
  const { activeTrip, loadTripData } = useActiveTrip();
  const { toast } = useToast();
  const [emails, setEmails] = useState<SourceEmail[]>([]);
  const [recommendations, setRecommendations] = useState<SourceRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedItemType, setSelectedItemType] = useState<'email' | 'recommendation'>('email');
  const [selectedTripId, setSelectedTripId] = useState<string>('');

  const loadItems = async () => {
    try {
      const [pendingEmails, pendingRecs] = await Promise.all([
        fetchSourceEmails('pending'),
        fetchPendingRecommendations(),
      ]);
      setEmails(pendingEmails);
      setRecommendations(pendingRecs);
    } catch (error) {
      console.error('Failed to load pending items:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { loadItems(); }, []);

  // Real-time: re-fetch when pending emails or recommendations change
  useEffect(() => {
    let channel: ReturnType<typeof import('@/integrations/supabase/client')['supabase']['channel']> | null = null;
    import('@/integrations/supabase/client').then(({ supabase }) => {
      channel = supabase
        .channel('pending-inbox-rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'source_emails' }, () => {
          loadItems();
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'source_recommendations' }, () => {
          loadItems();
        })
        .subscribe();
    });
    return () => {
      import('@/integrations/supabase/client').then(({ supabase }) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, []);

  const handleLink = async () => {
    if (!selectedItemId || !selectedTripId) return;
    try {
      if (selectedItemType === 'email') {
        await linkSourceEmailToTrip(selectedItemId, selectedTripId);
      } else {
        await linkRecommendationToTrip(selectedItemId, selectedTripId);
      }
      toast({ title: 'Item Linked', description: 'Successfully linked to trip.' });
      setLinkDialogOpen(false);
      loadItems();
      if (activeTrip?.id === selectedTripId) {
        loadTripData(selectedTripId);
      }
    } catch (error) {
      console.error('Failed to link:', error);
      toast({ title: 'Error', description: 'Failed to link item.', variant: 'destructive' });
    }
  };

  const handleDeleteEmail = async (id: string) => {
    try {
      await deleteSourceEmail(id);
      setEmails(emails.filter(i => i.id !== id));
      toast({ title: 'Deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  const handleDeleteRecommendation = async (id: string) => {
    try {
      await deleteRecommendation(id);
      setRecommendations(recommendations.filter(r => r.id !== id));
      toast({ title: 'Deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
    }
  };

  const openLinkDialog = (id: string, type: 'email' | 'recommendation') => {
    setSelectedItemId(id);
    setSelectedItemType(type);
    setSelectedTripId('');
    setLinkDialogOpen(true);
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'transportation': return <Plane className="h-4 w-4" />;
      case 'accommodation': return <Hotel className="h-4 w-4" />;
      case 'attraction': return <MapPin className="h-4 w-4" />;
      case 'eatery': return <UtensilsCrossed className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  const getEmailTitle = (item: SourceEmail) => {
    const pd = item.parsedData;
    const cat = pd?.metadata?.category;
    if (cat === 'transportation') {
      const segments = (pd.transportation_details as any)?.segments;
      if (segments?.[0]) return `${segments[0].from?.name} → ${segments[0].to?.name}`;
    } else if (cat === 'accommodation') {
      return (pd.accommodation_details as any)?.establishment_name || 'Accommodation';
    } else if (cat === 'attraction') {
      return (pd.attraction_details as any)?.attraction_name || 'Attraction';
    } else if (cat === 'eatery') {
      return (pd.eatery_details as any)?.establishment_name || 'Restaurant';
    }
    return pd?.metadata?.order_number || 'Unknown';
  };

  const totalPending = emails.length + recommendations.length;

  if (isLoading) {
    return <Card><CardContent className="p-6 text-center">Loading...</CardContent></Card>;
  }

  if (totalPending === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> Pending Inbox</CardTitle>
          <CardDescription>Unassigned items will appear here</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-2 opacity-40" />
            <p>No pending items</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Inbox className="h-5 w-5" /> Pending Inbox <Badge variant="secondary">{totalPending}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="emails">
            <TabsList>
              <TabsTrigger value="emails">
                Emails {emails.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{emails.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="recommendations">
                Recommendations {recommendations.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{recommendations.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="emails" className="space-y-3 mt-3">
              {emails.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-sm">No pending emails</p>
              ) : (
                emails.map(item => (
                  <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">{getCategoryIcon(item.parsedData?.metadata?.category)}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{getEmailTitle(item)}</span>
                          {item.parsedData?.metadata?.sub_category && (
                            <Badge variant="outline" className="text-xs">{item.parsedData.metadata.sub_category}</Badge>
                          )}
                        </div>
                        {item.sourceEmailInfo.subject && (
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">{item.sourceEmailInfo.subject}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => openLinkDialog(item.id, 'email')}>
                        <Link2 className="h-4 w-4 mr-1" /> Link
                      </Button>
                      {item.sourceEmailInfo.email_permalink && (
                        <a href={item.sourceEmailInfo.email_permalink} target="_blank" rel="noopener noreferrer" className="p-2">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteEmail(item.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="recommendations" className="space-y-3 mt-3">
              {recommendations.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-sm">No pending recommendations</p>
              ) : (
                recommendations.map(rec => (
                  <div key={rec.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-full bg-muted">
                        <Star className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="font-medium">{rec.analysis.main_site || 'Recommendation'}</span>
                        {rec.sourceUrl && (
                          <p className="text-xs text-muted-foreground truncate max-w-[250px]">{rec.sourceUrl}</p>
                        )}
                        {rec.analysis.extracted_items && rec.analysis.extracted_items.length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {rec.analysis.extracted_items.length} items extracted
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => openLinkDialog(rec.id, 'recommendation')}>
                        <Link2 className="h-4 w-4 mr-1" /> Link
                      </Button>
                      {rec.sourceUrl && (
                        <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-2">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteRecommendation(rec.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Link to Trip</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedTripId} onValueChange={setSelectedTripId}>
              <SelectTrigger><SelectValue placeholder="Choose a trip..." /></SelectTrigger>
              <SelectContent>
                {trips.map(trip => (
                  <SelectItem key={trip.id} value={trip.id}>
                    {trip.name} ({format(new Date(trip.startDate), 'MMM d')} - {format(new Date(trip.endDate), 'MMM d, yyyy')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleLink} disabled={!selectedTripId}>Link Item</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}