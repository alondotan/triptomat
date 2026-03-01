import { useEffect, useState } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { useTransport } from '@/context/TransportContext';
import { useContacts } from '@/context/ContactsContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, ThumbsUp, ThumbsDown, Star, Trash2, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { SourceRecommendation } from '@/types/webhook';
import { fetchTripRecommendations, deleteRecommendation } from '@/services/recommendationService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { UrlSubmit } from '@/components/UrlSubmit';
import { TextSubmit } from '@/components/TextSubmit';
import { MapListManager } from '@/components/MapListManager';

const Recommendations = () => {
  const { activeTrip } = useActiveTrip();
  const { pois } = usePOI();
  const { transportation } = useTransport();
  const { contacts } = useContacts();
  const { toast } = useToast();
  const [recommendations, setRecommendations] = useState<SourceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    try {
      await deleteRecommendation(id);
      setRecommendations(prev => prev.filter(r => r.id !== id));
      toast({ title: 'המלצה נמחקה' });
    } catch {
      toast({ title: 'שגיאה', description: 'לא ניתן למחוק.', variant: 'destructive' });
    }
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
    return <AppLayout><div className="text-center py-12 text-muted-foreground">No trip selected</div></AppLayout>;
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
          <h2 className="text-2xl font-bold">Recommendations</h2>
          <p className="text-muted-foreground">{recommendations.length} sources</p>
        </div>

        <UrlSubmit />
        <TextSubmit />
        <MapListManager />

        {recommendations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No recommendations yet for this trip.
          </div>
        )}

        {recommendations.map(rec => {
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
                  <CardTitle className="text-base flex items-center gap-2">
                    <Star size={16} className="text-primary" />
                    {rec.sourceTitle || rec.analysis.main_site || 'Recommendation'}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={rec.status === 'linked' ? 'default' : 'secondary'}>{rec.status}</Badge>
                    {hasLinkedEntities && (
                      isExpanded
                        ? <ChevronUp size={16} className="text-muted-foreground" />
                        : <ChevronDown size={16} className="text-muted-foreground" />
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
                    <p className="text-xs font-medium text-muted-foreground mb-1">Sites mentioned:</p>
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
                    <p className="text-xs font-medium text-muted-foreground mb-1">Extracted items:</p>
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

                {/* Extracted contacts */}
                {rec.analysis.contacts && rec.analysis.contacts.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Contacts mentioned:</p>
                    <div className="space-y-1.5">
                      {rec.analysis.contacts.map((contact, i) => (
                        <div key={i} className="flex items-start gap-2 p-2 rounded bg-muted/50">
                          <Users size={14} className="text-teal-500 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{contact.name}</span>
                              {contact.role && (
                                <Badge variant="outline" className="text-xs capitalize">{contact.role}</Badge>
                              )}
                              {contact.site && <span className="text-xs text-muted-foreground">@ {contact.site}</span>}
                            </div>
                            {contact.paragraph && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{contact.paragraph}</p>
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
                    <p className="text-xs font-medium text-muted-foreground mb-2">אובייקטים שנוצרו:</p>
                    <div className="space-y-1.5">
                      {linkedPois.map(poi => (
                        <div key={poi.id} className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/10">
                          <SubCategoryIcon type={poi.subCategory || poi.category} size={14} />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{poi.name}</span>
                            {poi.location.city && (
                              <span className="text-xs text-muted-foreground ml-1">@ {poi.location.city}</span>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs shrink-0">{poi.status}</Badge>
                        </div>
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
                        <div key={c.id} className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/10">
                          <Users size={14} className="text-teal-500 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="font-medium">{c.name}</span>
                            <span className="text-xs text-muted-foreground ml-1 capitalize">({c.role})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Added: {new Date(rec.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </AppLayout>
  );
};

export default Recommendations;
