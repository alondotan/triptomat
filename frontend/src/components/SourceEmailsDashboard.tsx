import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ExternalLink, Mail, Plane, Hotel, MapPin, Trash2, ChevronDown, ChevronRight, Calendar, DollarSign, MapPinned, User } from 'lucide-react';
import { SourceEmail } from '@/types/webhook';
import { fetchSourceEmails, deleteSourceEmail } from '@/services/webhookService';
import { useToast } from '@/hooks/use-toast';
import { useTrip } from '@/context/TripContext';
import { format } from 'date-fns';

export function SourceEmailsDashboard() {
  const { state } = useTrip();
  const { toast } = useToast();
  const [items, setItems] = useState<SourceEmail[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const loadItems = async () => {
      try {
        const allItems = await fetchSourceEmails('linked');
        setItems(allItems);
      } catch (error) {
        console.error('Failed to load source emails:', error);
      } finally {
        setIsLoading(false);
      }
    };
    loadItems();
  }, []);

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getCategoryIcon = (category?: string) => {
    switch (category) {
      case 'transportation': return <Plane className="h-4 w-4" />;
      case 'accommodation': return <Hotel className="h-4 w-4" />;
      default: return <MapPin className="h-4 w-4" />;
    }
  };

  const getTripName = (tripId?: string) => {
    if (!tripId) return null;
    const trip = state.trips.find(t => t.id === tripId);
    return trip?.name;
  };

  if (isLoading) return <Card><CardContent className="p-6 text-center">Loading...</CardContent></Card>;

  if (items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" /> Source Emails</CardTitle>
          <CardDescription>All linked emails across trips</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center py-8 text-muted-foreground">
            <Mail className="h-12 w-12 mb-2 opacity-40" />
            <p>No source emails yet</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mail className="h-5 w-5" /> Source Emails <Badge variant="secondary">{items.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.map(item => {
          const tripName = getTripName(item.tripId);
          const isExpanded = expandedIds.has(item.id);
          return (
            <Collapsible key={item.id} open={isExpanded} onOpenChange={() => toggleExpanded(item.id)}>
              <div className="rounded-lg border bg-card">
                <div className="flex items-center justify-between p-3 hover:bg-accent/50 transition-colors">
                  <CollapsibleTrigger className="flex items-center gap-3 flex-1 text-left cursor-pointer">
                    {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                    <div className="p-2 rounded-full bg-muted">{getCategoryIcon(item.parsedData?.metadata?.category)}</div>
                    <div>
                      <span className="font-medium">{item.sourceEmailInfo.subject || item.parsedData?.metadata?.order_number || 'Email'}</span>
                      <p className="text-sm text-muted-foreground">
                        {tripName && <Badge variant="outline" className="text-xs mr-2">{tripName}</Badge>}
                        {item.parsedData?.metadata?.order_number && `Order: ${item.parsedData.metadata.order_number}`}
                        {' • '}{format(new Date(item.createdAt), 'MMM d, yyyy')}
                      </p>
                    </div>
                  </CollapsibleTrigger>
                  <div className="flex items-center gap-2">
                    <Badge className={item.status === 'linked' ? 'bg-primary text-primary-foreground' : ''}>
                      {item.status}
                    </Badge>
                    {item.sourceEmailInfo.email_permalink && (
                      <a href={item.sourceEmailInfo.email_permalink} target="_blank" rel="noopener noreferrer" className="p-2 rounded-md hover:bg-muted">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                    <Button size="sm" variant="ghost" onClick={async () => {
                      try {
                        await deleteSourceEmail(item.id);
                        setItems(prev => prev.filter(i => i.id !== item.id));
                        toast({ title: 'Deleted' });
                      } catch {
                        toast({ title: 'Error', description: 'Failed to delete.', variant: 'destructive' });
                      }
                    }}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <CollapsibleContent>
                  <EmailDetails parsedData={item.parsedData} />
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </CardContent>
    </Card>
  );
}

function EmailDetails({ parsedData }: { parsedData: SourceEmail['parsedData'] }) {
  if (!parsedData) return null;
  const { metadata, sites_hierarchy, accommodation_details, transportation_details, attraction_details, eatery_details, additional_info } = parsedData;
  const accom = accommodation_details as Record<string, any> | undefined;
  const transport = transportation_details as Record<string, any> | undefined;
  const attraction = attraction_details as Record<string, any> | undefined;
  const eatery = eatery_details as Record<string, any> | undefined;

  return (
    <div className="px-4 pb-4 pt-1 space-y-3 border-t">
      {/* Metadata */}
      {metadata && (
        <div className="flex flex-wrap gap-2 text-xs">
          {metadata.category && <Badge variant="outline">{metadata.category}</Badge>}
          {metadata.sub_category && <Badge variant="outline">{metadata.sub_category}</Badge>}
          {metadata.date && <Badge variant="outline">{metadata.date}</Badge>}
          {metadata.action && <Badge variant="outline">{metadata.action}</Badge>}
          {sites_hierarchy?.map((node, i) => (
            <Badge key={i} variant="outline">🌍 {node.site}</Badge>
          ))}
        </div>
      )}

      {/* Accommodation */}
      {accom && Object.keys(accom).length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-1"><Hotel className="h-3.5 w-3.5" /> Accommodation</h4>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {accom.establishment_name && (
              <div><span className="text-muted-foreground">Name:</span> {accom.establishment_name}</div>
            )}
            {accom.checkin_date && (
              <div className="flex items-center gap-1"><Calendar className="h-3 w-3 text-muted-foreground" /> Check-in: {accom.checkin_date} {accom.checkin_hour && `at ${accom.checkin_hour}`}</div>
            )}
            {accom.checkout_date && (
              <div className="flex items-center gap-1"><Calendar className="h-3 w-3 text-muted-foreground" /> Check-out: {accom.checkout_date} {accom.checkout_hour && `at ${accom.checkout_hour}`}</div>
            )}
            {accom.cost && (
              <div className="flex items-center gap-1"><DollarSign className="h-3 w-3 text-muted-foreground" /> {accom.cost.amount?.toLocaleString()} {accom.cost.currency}</div>
            )}
            {accom.location_details && (
              <div className="flex items-center gap-1 col-span-2"><MapPinned className="h-3 w-3 text-muted-foreground" /> {[accom.location_details.street, accom.location_details.city, accom.location_details.country].filter(Boolean).join(', ')}</div>
            )}
          </div>
          {accom.rooms && accom.rooms.length > 0 && (
            <div className="text-sm">
              {accom.rooms.map((r: any, i: number) => (
                <div key={i} className="flex items-center gap-1"><User className="h-3 w-3 text-muted-foreground" /> {r.room_type}{r.occupancy_details && ` — ${r.occupancy_details}`}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Transportation */}
      {transport && transport.segments && transport.segments.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold flex items-center gap-1"><Plane className="h-3.5 w-3.5" /> Transportation</h4>
          {transport.segments.map((seg: any, i: number) => (
            <div key={i} className="text-sm bg-muted/50 rounded p-2 space-y-1">
              <div className="font-medium">{seg.from?.name || seg.from?.code} → {seg.to?.name || seg.to?.code}</div>
              <div className="text-muted-foreground text-xs">
                {seg.carrier && `${seg.carrier} `}{seg.flight_number && `#${seg.flight_number} `}
                {seg.departure_time && `Dep: ${seg.departure_time} `}
                {seg.arrival_time && `Arr: ${seg.arrival_time}`}
              </div>
            </div>
          ))}
          {transport.cost && <div className="text-sm flex items-center gap-1"><DollarSign className="h-3 w-3 text-muted-foreground" /> {transport.cost.amount?.toLocaleString()} {transport.cost.currency}</div>}
          {transport.baggage_allowance && (
            <div className="text-xs text-muted-foreground">
              {transport.baggage_allowance.cabin_bag && <div>Cabin: {transport.baggage_allowance.cabin_bag}</div>}
              {transport.baggage_allowance.checked_bag && <div>Checked: {transport.baggage_allowance.checked_bag}</div>}
            </div>
          )}
        </div>
      )}

      {/* Attraction */}
      {attraction && Object.keys(attraction).length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Attraction</h4>
          <div className="text-sm">
            {attraction.attraction_name && <div>{attraction.attraction_name}</div>}
            {attraction.reservation_date && <div className="text-muted-foreground">Date: {attraction.reservation_date} {attraction.reservation_hour && `at ${attraction.reservation_hour}`}</div>}
          </div>
        </div>
      )}

      {/* Eatery */}
      {eatery && Object.keys(eatery).length > 0 && (
        <div className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Eatery</h4>
          <div className="text-sm">
            {eatery.establishment_name && <div>{eatery.establishment_name}</div>}
            {eatery.reservation_date && <div className="text-muted-foreground">Date: {eatery.reservation_date} {eatery.reservation_hour && `at ${eatery.reservation_hour}`}</div>}
          </div>
        </div>
      )}

      {/* Additional Info */}
      {additional_info && (additional_info.summary || additional_info.raw_notes) && (
        <div className="text-sm border-t pt-2">
          {additional_info.summary && <p className="text-muted-foreground">{additional_info.summary}</p>}
          {additional_info.raw_notes && <p className="text-xs text-muted-foreground mt-1">{additional_info.raw_notes}</p>}
        </div>
      )}
    </div>
  );
}
