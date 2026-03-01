import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Merge, Loader2 } from 'lucide-react';
import { SubCategoryIcon } from './SubCategoryIcon';
import type { PointOfInterest, Transportation } from '@/types/trip';

const statusLabels: Record<string, string> = {
  candidate: 'מועמד',
  in_plan: 'בתוכנית',
  matched: 'משודך',
  booked: 'הוזמן',
  visited: 'בוקר',
  completed: 'הושלם',
};

interface MergeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityType: 'poi' | 'transportation';
  items: [PointOfInterest, PointOfInterest] | [Transportation, Transportation];
  onConfirm: (primaryId: string, secondaryId: string) => Promise<void>;
}

function POISummary({ poi }: { poi: PointOfInterest }) {
  const sourceCount =
    (poi.sourceRefs.email_ids?.length || 0) +
    (poi.sourceRefs.recommendation_ids?.length || 0);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <SubCategoryIcon type={poi.subCategory || poi.category} size={16} />
        <span className="font-semibold text-base">{poi.name}</span>
      </div>
      {poi.subCategory && (
        <div className="text-muted-foreground text-xs">{poi.subCategory}</div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-xs">{statusLabels[poi.status] || poi.status}</Badge>
        {poi.isPaid && <Badge variant="default" className="text-xs">שולם</Badge>}
        {poi.isCancelled && <Badge variant="destructive" className="text-xs">מבוטל</Badge>}
      </div>
      {(poi.location.city || poi.location.country) && (
        <div className="text-muted-foreground">
          {[poi.location.city, poi.location.country].filter(Boolean).join(', ')}
        </div>
      )}
      {poi.location.address && (
        <div className="text-muted-foreground text-xs">{poi.location.address}</div>
      )}
      {poi.details.cost?.amount != null && poi.details.cost.amount > 0 && (
        <div>עלות: {poi.details.cost.amount} {poi.details.cost.currency || ''}</div>
      )}
      {poi.details.order_number && (
        <div className="text-xs">הזמנה: {poi.details.order_number}</div>
      )}
      {poi.details.notes?.user_summary && (
        <div className="text-xs text-muted-foreground italic">
          {poi.details.notes.user_summary}
        </div>
      )}
      {sourceCount > 0 && (
        <div className="text-xs text-muted-foreground">{sourceCount} מקורות</div>
      )}
    </div>
  );
}

function TransportSummary({ transport }: { transport: Transportation }) {
  const sourceCount =
    (transport.sourceRefs.email_ids?.length || 0) +
    (transport.sourceRefs.recommendation_ids?.length || 0);

  const route = transport.segments.length > 0
    ? `${transport.segments[0].from.name} → ${transport.segments[transport.segments.length - 1].to.name}`
    : 'Route TBD';

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center gap-2">
        <SubCategoryIcon type={transport.category} size={16} />
        <span className="font-semibold text-base">{route}</span>
      </div>
      <div className="text-muted-foreground text-xs">{transport.category}</div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-xs">{statusLabels[transport.status] || transport.status}</Badge>
        {transport.isPaid && <Badge variant="default" className="text-xs">שולם</Badge>}
        {transport.isCancelled && <Badge variant="destructive" className="text-xs">מבוטל</Badge>}
      </div>
      {transport.segments.length > 0 && (
        <div className="text-xs text-muted-foreground">{transport.segments.length} קטעים</div>
      )}
      {transport.cost.total_amount > 0 && (
        <div>עלות: {transport.cost.total_amount} {transport.cost.currency || ''}</div>
      )}
      {transport.booking.carrier_name && (
        <div className="text-xs">חברה: {transport.booking.carrier_name}</div>
      )}
      {transport.booking.order_number && (
        <div className="text-xs">הזמנה: {transport.booking.order_number}</div>
      )}
      {transport.additionalInfo.notes && (
        <div className="text-xs text-muted-foreground italic">
          {transport.additionalInfo.notes}
        </div>
      )}
      {sourceCount > 0 && (
        <div className="text-xs text-muted-foreground">{sourceCount} מקורות</div>
      )}
    </div>
  );
}

export function MergeConfirmDialog({
  open,
  onOpenChange,
  entityType,
  items,
  onConfirm,
}: MergeConfirmDialogProps) {
  const [primaryId, setPrimaryId] = useState(items[0].id);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    const secondaryId = primaryId === items[0].id ? items[1].id : items[0].id;
    setLoading(true);
    try {
      await onConfirm(primaryId, secondaryId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge size={18} />
            מיזוג פריטים
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          בחר את הפריט הראשי (ישמר). נתונים חסרים ישלמו מהפריט השני, שיימחק.
        </p>

        <RadioGroup value={primaryId} onValueChange={setPrimaryId} className="grid grid-cols-2 gap-4">
          {items.map((item, i) => (
            <Label
              key={item.id}
              htmlFor={`merge-item-${i}`}
              className={`flex flex-col gap-3 rounded-lg border-2 p-4 cursor-pointer transition-colors ${
                primaryId === item.id
                  ? 'border-primary bg-primary/5'
                  : 'border-muted hover:border-muted-foreground/30'
              }`}
            >
              <div className="flex items-center gap-2">
                <RadioGroupItem value={item.id} id={`merge-item-${i}`} />
                <span className="text-xs font-medium">
                  {primaryId === item.id ? 'ראשי (ישמר)' : 'משני (יימחק)'}
                </span>
              </div>
              {entityType === 'poi' ? (
                <POISummary poi={item as PointOfInterest} />
              ) : (
                <TransportSummary transport={item as Transportation} />
              )}
            </Label>
          ))}
        </RadioGroup>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            ביטול
          </Button>
          <Button onClick={handleConfirm} disabled={loading} className="gap-1.5">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Merge size={16} />}
            מזג
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
