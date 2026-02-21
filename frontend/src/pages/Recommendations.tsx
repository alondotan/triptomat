import { useEffect, useState } from 'react';
import { useTrip } from '@/context/TripContext';
import { AppLayout } from '@/components/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, ThumbsUp, ThumbsDown, Star, Trash2 } from 'lucide-react';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { SourceRecommendation } from '@/types/webhook';
import { fetchTripRecommendations, deleteRecommendation } from '@/services/recommendationService';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';

const Recommendations = () => {
  const { state } = useTrip();
  const { toast } = useToast();
  const [recommendations, setRecommendations] = useState<SourceRecommendation[]>([]);
  const [loading, setLoading] = useState(true);

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
    if (!state.activeTrip) return;
    setLoading(true);
    fetchTripRecommendations(state.activeTrip.id)
      .then(setRecommendations)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [state.activeTrip?.id]);

  if (!state.activeTrip) {
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

        {recommendations.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            No recommendations yet for this trip.
          </div>
        )}

        {recommendations.map(rec => (
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
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Star size={16} className="text-primary" />
                  {rec.sourceTitle || rec.analysis.main_site || 'Recommendation'}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant={rec.status === 'linked' ? 'default' : 'secondary'}>{rec.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(rec.id)}>
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

              <p className="text-xs text-muted-foreground">
                Added: {new Date(rec.createdAt).toLocaleDateString()}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppLayout>
  );
};

export default Recommendations;
