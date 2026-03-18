import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { useTransport } from '@/context/TransportContext';
import { useContacts } from '@/context/ContactsContext';
import { AppLayout } from '@/components/layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, FileText, ThumbsUp, ThumbsDown, Star, Trash2, ChevronDown, ChevronUp, Users, Loader2, AlertTriangle, RefreshCw, RotateCw } from 'lucide-react';
import { SubCategoryIcon } from '@/components/shared/SubCategoryIcon';
import { POIDetailDialog } from '@/components/poi/POIDetailDialog';
import { ContactEditDialog } from '@/components/shared/ContactEditDialog';
import type { PointOfInterest, Contact } from '@/types/trip';
import { SourceRecommendation } from '@/types/webhook';
import { fetchTripRecommendations, deleteRecommendation } from '@/services/recommendationService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { UrlSubmit } from '@/components/UrlSubmit';
import { TextSubmit } from '@/components/TextSubmit';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const Recommendations = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { pois } = usePOI();
  const { transportation } = useTransport();
  const { contacts, updateContact, deleteContact } = useContacts();
  const { toast } = useToast();
  const [recommendations, setRecommendations] = useState<SourceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedPoi, setSelectedPoi] = useState<PointOfInterest | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [sourceTextDialog, setSourceTextDialog] = useState<{ title: string; text: string } | null>(null);

  const handleRefreshMapList = async (rec: SourceRecommendation) => {
    const listId = rec.analysis.map_list_id;
    if (!listId) return;
    setSyncing(prev => ({ ...prev, [rec.id]: true }));
    try {
      const { data: tokenData } = await supabase.from('webhook_tokens').select('token').single();
      if (!tokenData?.token) throw new Error('No webhook token');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/sync-maps-list`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ list_id: listId, token: tokenData.token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      toast({
        title: t('recsPage.synced', { name: rec.sourceTitle }),
        description: data.new_places > 0
          ? t('recsPage.newPlacesFound', { count: data.new_places })
          : t('recsPage.noNewPlaces'),
      });
    } catch (e: any) {
      toast({ title: t('recsPage.syncFailed'), description: e.message, variant: 'destructive' });
    }
    setSyncing(prev => ({ ...prev, [rec.id]: false }));
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteRecommendation(id);
      setRecommendations(prev => prev.filter(r => r.id !== id));
      toast({ title: t('recsPage.recDeleted') });
    } catch {
      toast({ title: t('recsPage.deleteError'), variant: 'destructive' });
    }
  };

  const handleResend = async (rec: SourceRecommendation) => {
    if (!rec.sourceUrl || !activeTrip) return;
    setSyncing(prev => ({ ...prev, [rec.id]: true }));
    try {
      const { data: tokenData } = await supabase.from('webhook_tokens').select('token').single();
      if (!tokenData?.token) throw new Error('No webhook token');

      // Delete old recommendation first
      await deleteRecommendation(rec.id);

      // Re-submit to gateway
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30_000);
      const res = await fetch(import.meta.env.VITE_GATEWAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: rec.sourceUrl, webhook_token: tokenData.token, overwrite: true }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();

      if (res.status === 202) {
        const jobId = data.job_id;
        const meta = data.source_metadata || {};
        await supabase.from('source_recommendations').insert([{
          recommendation_id: jobId,
          trip_id: activeTrip.id,
          source_url: rec.sourceUrl,
          source_title: meta.title || rec.sourceTitle || null,
          source_image: meta.image || rec.sourceImage || null,
          status: 'processing',
          analysis: {},
          linked_entities: [],
        }]);
        toast({ title: t('recsPage.resent') });
      } else {
        toast({ title: t('recsPage.resendFailed'), variant: 'destructive' });
      }
      // Re-fetch to update UI
      fetchTripRecommendations(activeTrip.id).then(setRecommendations).catch(console.error);
    } catch (e: any) {
      toast({ title: t('recsPage.resendFailed'), description: e.message, variant: 'destructive' });
    }
    setSyncing(prev => ({ ...prev, [rec.id]: false }));
  };

  useEffect(() => {
    if (!activeTrip) return;
    setLoading(true);
    fetchTripRecommendations(activeTrip.id)
      .then(setRecommendations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [activeTrip?.id]);

  // Real-time: re-fetch when a new recommendation arrives for this trip
  useEffect(() => {
    const tripId = activeTrip?.id;
    if (!tripId) return;
    let channel: ReturnType<typeof import('@/integrations/supabase/client')['supabase']['channel']> | null = null;
    import('@/integrations/supabase/client').then(({ supabase }) => {
      channel = supabase
        .channel(`source-recs-rt-${tripId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'source_recommendations',
          filter: `trip_id=eq.${tripId}`,
        }, () => {
          fetchTripRecommendations(tripId).then(setRecommendations).catch(console.error);
        })
        .subscribe();
    });
    return () => {
      import('@/integrations/supabase/client').then(({ supabase }) => {
        if (channel) supabase.removeChannel(channel);
      });
    };
  }, [activeTrip?.id]);

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">{t('recsPage.title')}</h2>
          <p className="text-muted-foreground">{t('recsPage.sources', { count: recommendations.length })}</p>
        </div>

        <UrlSubmit />
        <TextSubmit />

        {recommendations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            {t('recsPage.noRecs')}
          </div>
        )}

        {recommendations.map(rec => {
          // ── Processing state ──
          if (rec.status === 'processing') {
            return (
              <Card key={rec.id} className="overflow-hidden opacity-80">
                {rec.sourceImage && (
                  <div className="w-full h-40 overflow-hidden">
                    <img
                      src={rec.sourceImage}
                      alt={rec.sourceTitle || ''}
                      className="w-full h-full object-cover"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  </div>
                )}
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Loader2 size={16} className="text-primary animate-spin" />
                      {rec.sourceTitle || t('recsPage.analyzing')}
                    </CardTitle>
                    <Badge variant="outline" className="text-orange-600 border-orange-300">{t('recsPage.processing')}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {rec.sourceUrl && !rec.sourceUrl.startsWith('text://') && (
                    <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-xs">
                      <ExternalLink size={12} /> {rec.sourceUrl}
                    </a>
                  )}
                  {rec.analysis?.source_text && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSourceTextDialog({ title: rec.sourceTitle || t('recsPage.viewSourceText'), text: rec.analysis.source_text! }); }}
                      className="text-primary hover:underline flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <FileText size={12} /> {t('recsPage.viewSourceText')}
                    </button>
                  )}
                  <p className="text-xs text-muted-foreground">{t('recsPage.analysisInProgress')}</p>
                </CardContent>
              </Card>
            );
          }

          // ── Failed state ──
          if (rec.status === 'failed') {
            return (
              <Card key={rec.id} className="overflow-hidden border-destructive/30">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <AlertTriangle size={16} className="text-destructive" />
                      {rec.sourceTitle || t('recsPage.failed')}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="destructive">{t('recsPage.failed')}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(rec.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  {rec.sourceUrl && !rec.sourceUrl.startsWith('text://') && (
                    <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-primary hover:underline flex items-center gap-1 text-xs">
                      <ExternalLink size={12} /> {rec.sourceUrl}
                    </a>
                  )}
                  {rec.analysis?.source_text && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setSourceTextDialog({ title: rec.sourceTitle || t('recsPage.viewSourceText'), text: rec.analysis.source_text! }); }}
                      className="text-primary hover:underline flex items-center gap-1 text-xs cursor-pointer"
                    >
                      <FileText size={12} /> {t('recsPage.viewSourceText')}
                    </button>
                  )}
                  {rec.error && (
                    <p className="text-xs text-destructive bg-destructive/10 p-2 rounded">{rec.error}</p>
                  )}
                </CardContent>
              </Card>
            );
          }

          // ── Normal state (pending / linked) ──
          const isExpanded = expandedId === rec.id;
          const linkedPoiIds = rec.linkedEntities
            .filter(e => e.entity_type === 'poi')
            .map(e => e.entity_id);
          const linkedTransportIds = rec.linkedEntities
            .filter(e => e.entity_type === 'transportation')
            .map(e => e.entity_id);
          const linkedContactIds = rec.linkedEntities
            .filter(e => e.entity_type === 'contact')
            .map(e => e.entity_id);
          const linkedPois = pois.filter(p => linkedPoiIds.includes(p.id));
          const linkedTransport = transportation.filter(t => linkedTransportIds.includes(t.id));
          const linkedContacts = contacts.filter(c => linkedContactIds.includes(c.id));
          const hasLinkedEntities = linkedPois.length > 0 || linkedTransport.length > 0 || linkedContacts.length > 0;
          const placesCount = linkedPois.length + linkedTransport.length;

          return (
            <Card key={rec.id} className="overflow-hidden">
              {rec.sourceImage && (
                <div className="w-full h-40 overflow-hidden">
                  <img
                    src={rec.sourceImage}
                    alt={rec.sourceTitle || rec.analysis.main_site || ''}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              )}
              <CardHeader
                className="pb-2 cursor-pointer select-none hover:bg-muted/30 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : rec.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Star size={16} className="text-primary shrink-0" />
                      {rec.sourceTitle || rec.analysis.main_site || t('recsPage.title')}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 ms-6">
                      {hasLinkedEntities ? (
                        <>
                          {placesCount > 0 && t('recsPage.placesAdded', { count: placesCount })}
                          {placesCount > 0 && linkedContacts.length > 0 && ', '}
                          {linkedContacts.length > 0 && t('recsPage.contactsAdded', { count: linkedContacts.length })}
                        </>
                      ) : (
                        t('recsPage.nothingAdded')
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasLinkedEntities ? (
                      <Badge variant="outline" className="text-xs flex items-center gap-1 cursor-pointer">
                        {t('recsPage.details')}
                        {isExpanded
                          ? <ChevronUp size={14} />
                          : <ChevronDown size={14} />
                        }
                      </Badge>
                    ) : rec.sourceUrl && (
                      <Button size="sm" variant="outline" className="text-xs gap-1" onClick={(e) => { e.stopPropagation(); handleResend(rec); }} disabled={syncing[rec.id]}>
                        <RotateCw className={`h-3.5 w-3.5 ${syncing[rec.id] ? 'animate-spin' : ''}`} />
                        {t('recsPage.resend')}
                      </Button>
                    )}
                    {rec.analysis.map_list_id && (
                      <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleRefreshMapList(rec); }} disabled={syncing[rec.id]}>
                        <RefreshCw className={`h-4 w-4 ${syncing[rec.id] ? 'animate-spin' : ''}`} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); handleDelete(rec.id); }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {rec.sourceUrl && (
                  <a href={rec.sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 text-xs">
                    <ExternalLink size={12} /> {rec.sourceUrl}
                  </a>
                )}

                {/* Sites list */}
                {rec.analysis.sites_list && rec.analysis.sites_list.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t('recsPage.sitesMentioned')}</p>
                    <div className="flex flex-wrap gap-1">
                      {rec.analysis.sites_list.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {s.site} <span className="text-muted-foreground ml-1">({s.site_type})</span>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Extracted items */}
                {rec.analysis.extracted_items && rec.analysis.extracted_items.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">{t('recsPage.extractedItems')}</p>
                    <div className="space-y-1.5">
                      {rec.analysis.extracted_items.map((item, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                          {item.sentiment === 'good' ? (
                            <ThumbsUp size={14} className="text-primary mt-0.5 shrink-0" />
                          ) : item.sentiment === 'bad' ? (
                            <ThumbsDown size={14} className="text-destructive mt-0.5 shrink-0" />
                          ) : null}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{item.name}</span>
                              <Badge variant="outline" className="text-xs flex items-center gap-1">
                                <SubCategoryIcon type={item.category} size={12} />
                                {item.category}
                              </Badge>
                              {item.site && <span className="text-xs text-muted-foreground">@ {item.site}</span>}
                            </div>
                            {item.paragraph && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.paragraph}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Linked entities — shown when expanded */}
                {isExpanded && hasLinkedEntities && (
                  <div className="pt-3 border-t">
                    <p className="text-xs font-medium text-muted-foreground mb-2">{t('recsPage.objectsCreated')}</p>
                    <div className="space-y-1.5">
                      {linkedPois.map(poi => (
                        <button
                          key={poi.id}
                          className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/10 w-full text-left hover:bg-primary/10 transition-colors"
                          onClick={() => setSelectedPoi(poi)}
                        >
                          <SubCategoryIcon type={poi.subCategory || poi.category} size={14} />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{poi.name}</span>
                            {poi.location.city && (
                              <span className="text-xs text-muted-foreground ml-1">@ {poi.location.city}</span>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">{poi.status}</Badge>
                        </button>
                      ))}
                      {linkedTransport.map(t => (
                        <div key={t.id} className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/10">
                          <SubCategoryIcon type={t.category} size={14} />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium capitalize">{t.category}</span>
                            {t.segments.length > 0 && (
                              <span className="text-xs text-muted-foreground ml-1">
                                {t.segments[0].from.name} → {t.segments[t.segments.length - 1].to.name}
                              </span>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">{t.status}</Badge>
                        </div>
                      ))}
                      {linkedContacts.map(c => (
                        <button
                          key={c.id}
                          className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/10 w-full text-left hover:bg-primary/10 transition-colors"
                          onClick={() => setSelectedContact(c)}
                        >
                          <Users size={14} className="text-teal-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground ml-1 capitalize">({t(`contactRole.${c.role}`, c.role)})</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  {t('recsPage.added')} {new Date(rec.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          );
        })}

        {/* POI Detail Dialog */}
        {selectedPoi && (
          <POIDetailDialog
            poi={selectedPoi}
            open={!!selectedPoi}
            onOpenChange={(open) => { if (!open) setSelectedPoi(null); }}
          />
        )}

        {/* Contact Edit Dialog */}
        <ContactEditDialog
          contact={selectedContact}
          open={!!selectedContact}
          onOpenChange={(open: boolean) => { if (!open) setSelectedContact(null); }}
          onSave={async (data) => {
            if (selectedContact) {
              await updateContact(selectedContact.id, data);
              setSelectedContact(null);
            }
          }}
          onDelete={async (id) => {
            await deleteContact(id);
            setSelectedContact(null);
          }}
        />

        {/* Source Text Dialog */}
        <Dialog open={!!sourceTextDialog} onOpenChange={(open) => { if (!open) setSourceTextDialog(null); }}>
          <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <FileText size={16} />
                {sourceTextDialog?.title}
              </DialogTitle>
            </DialogHeader>
            <pre className="flex-1 overflow-y-auto p-3 bg-muted rounded-lg text-sm whitespace-pre-wrap">{sourceTextDialog?.text}</pre>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
};

export default Recommendations;
