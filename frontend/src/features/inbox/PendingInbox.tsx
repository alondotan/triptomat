import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Inbox, Link2, ExternalLink, Trash2, Star } from 'lucide-react';
import { getCategoryIcon } from '@/shared/lib/subCategoryConfig';
import { SourceEmail, SourceRecommendation } from '@/types/webhook';
import { fetchSourceEmails, linkSourceEmailToTrip, deleteSourceEmail } from '@/features/inbox/webhookService';
import { fetchPendingRecommendations, linkRecommendationToTrip, deleteRecommendation } from '@/features/inbox/recommendationService';
import { useTripList } from '@/features/trip/TripListContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { useToast } from '@/shared/hooks/use-toast';
import { format } from 'date-fns';

export function PendingInbox() {
  const { t } = useTranslation();
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
      toast({ title: t('inboxPage.itemLinked'), description: t('inboxPage.linkedSuccess') });
      setLinkDialogOpen(false);
      loadItems();
      if (activeTrip?.id === selectedTripId) {
        loadTripData(selectedTripId);
      }
    } catch (error) {
      console.error('Failed to link:', error);
      toast({ title: t('inboxPage.error'), description: t('inboxPage.linkFailed'), variant: 'destructive' });
    }
  };

  const handleDeleteEmail = async (id: string) => {
    try {
      await deleteSourceEmail(id);
      setEmails(emails.filter(i => i.id !== id));
      toast({ title: t('inboxPage.deleted') });
    } catch (error) {
      toast({ title: t('inboxPage.error'), description: t('inboxPage.deleteFailed'), variant: 'destructive' });
    }
  };

  const handleDeleteRecommendation = async (id: string) => {
    try {
      await deleteRecommendation(id);
      setRecommendations(recommendations.filter(r => r.id !== id));
      toast({ title: t('inboxPage.deleted') });
    } catch (error) {
      toast({ title: t('inboxPage.error'), description: t('inboxPage.deleteFailed'), variant: 'destructive' });
    }
  };

  const openLinkDialog = (id: string, type: 'email' | 'recommendation') => {
    setSelectedItemId(id);
    setSelectedItemType(type);
    setSelectedTripId('');
    setLinkDialogOpen(true);
  };

  const renderCategoryIcon = (category?: string) => {
    const Icon = getCategoryIcon(category || '');
    return <Icon className="h-4 w-4" aria-hidden="true" />;
  };

  const getEmailTitle = (item: SourceEmail) => {
    const pd = item.parsedData;
    const cat = pd?.metadata?.category;
    if (cat === 'transportation') {
      const segments = (pd.transportation_details as any)?.segments;
      if (segments?.[0]) return `${segments[0].from?.name} → ${segments[0].to?.name}`;
    } else if (cat === 'accommodation') {
      return (pd.accommodation_details as any)?.establishment_name || t('poiCategory.accommodation');
    } else if (cat === 'attraction') {
      return (pd.attraction_details as any)?.attraction_name || t('poiCategory.attraction');
    } else if (cat === 'eatery') {
      return (pd.eatery_details as any)?.establishment_name || t('poiCategory.eatery');
    }
    return pd?.metadata?.order_number || t('common.unknown');
  };

  const totalPending = emails.length + recommendations.length;

  if (isLoading) {
    return <Card><CardContent className="p-6 text-center" aria-live="polite">{t('common.loading')}</CardContent></Card>;
  }

  if (totalPending === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Inbox className="h-5 w-5" /> {t('inboxPage.pendingInbox')}</CardTitle>
          <CardDescription>{t('inboxPage.unassignedItems')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <Inbox className="h-12 w-12 mb-2 opacity-40" aria-hidden="true" />
            <p>{t('inboxPage.noPendingItems')}</p>
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
            <Inbox className="h-5 w-5" /> {t('inboxPage.pendingInbox')} <Badge variant="secondary">{totalPending}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="emails">
            <TabsList>
              <TabsTrigger value="emails">
                {t('inboxPage.emails')} {emails.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{emails.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="recommendations">
                {t('nav.recommendations')} {recommendations.length > 0 && <Badge variant="secondary" className="ml-1.5 text-xs">{recommendations.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="emails" className="space-y-3 mt-3">
              {emails.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-sm">{t('inboxPage.noPendingEmails')}</p>
              ) : (
                emails.map(item => (
                  <div key={item.id} className="p-3 rounded-lg border bg-card space-y-1">
                    {/* Row 1: icons */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-muted">{renderCategoryIcon(item.parsedData?.metadata?.category)}</div>
                        {item.parsedData?.metadata?.sub_category && (
                          <Badge variant="outline" className="text-xs">{item.parsedData.metadata.sub_category}</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => openLinkDialog(item.id, 'email')}>
                          <Link2 className="h-4 w-4 mr-1" /> {t('inboxPage.linkItem')}
                        </Button>
                        {item.sourceEmailInfo.email_permalink && (
                          <a href={item.sourceEmailInfo.email_permalink} target="_blank" rel="noopener noreferrer" className="p-2" aria-label={t('sourceEmails.openEmail')}>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <Button size="sm" variant="ghost" aria-label={t('common.delete')} onClick={() => { if (window.confirm(t('sourceEmails.confirmDelete'))) handleDeleteEmail(item.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {/* Row 2: title */}
                    <div className="font-medium truncate">{getEmailTitle(item)}</div>
                    {/* Row 3: subject */}
                    {item.sourceEmailInfo.subject && (
                      <p className="text-xs text-muted-foreground truncate">{item.sourceEmailInfo.subject}</p>
                    )}
                  </div>
                ))
              )}
            </TabsContent>

            <TabsContent value="recommendations" className="space-y-3 mt-3">
              {recommendations.length === 0 ? (
                <p className="text-center py-4 text-muted-foreground text-sm">{t('inboxPage.noPendingRecs')}</p>
              ) : (
                recommendations.map(rec => (
                  <div key={rec.id} className="p-3 rounded-lg border bg-card space-y-1">
                    {/* Row 1: icons */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-full bg-muted">
                          <Star className="h-4 w-4" aria-hidden="true" />
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => openLinkDialog(rec.id, 'recommendation')}>
                          <Link2 className="h-4 w-4 mr-1" /> {t('inboxPage.linkItem')}
                        </Button>
                        {rec.sourceUrl && (
                          <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer" className="p-2" aria-label={t('sourceEmails.openEmail')}>
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                        <Button size="sm" variant="ghost" aria-label={t('common.delete')} onClick={() => { if (window.confirm(t('sourceEmails.confirmDelete'))) handleDeleteRecommendation(rec.id); }}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    {/* Row 2: title */}
                    <div className="font-medium truncate">{rec.analysis.main_site || t('nav.recommendations')}</div>
                    {/* Row 3: details */}
                    {rec.sourceUrl && (
                      <p className="text-xs text-muted-foreground truncate">{rec.sourceUrl}</p>
                    )}
                    {rec.analysis.extracted_items && rec.analysis.extracted_items.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {t('inboxPage.itemsExtracted', { count: rec.analysis.extracted_items.length })}
                      </p>
                    )}
                  </div>
                ))
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t('inboxPage.linkToTrip')}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Select value={selectedTripId} onValueChange={setSelectedTripId} aria-label={t('inboxPage.chooseTrip')}>
              <SelectTrigger><SelectValue placeholder={t('inboxPage.chooseTrip')} /></SelectTrigger>
              <SelectContent>
                {trips.map(trip => (
                  <SelectItem key={trip.id} value={trip.id}>
                    {trip.name} ({format(new Date(trip.startDate), 'MMM d')} - {format(new Date(trip.endDate), 'MMM d, yyyy')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleLink} disabled={!selectedTripId}>{t('inboxPage.linkItem')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}