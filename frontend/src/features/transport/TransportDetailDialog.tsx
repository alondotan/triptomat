import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useTransport } from '@/features/transport/TransportContext';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Save, Plus, Trash2, ArrowDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import type { Transportation, TransportStatus } from '@/types/trip';
import { useTripMode } from '@/shared/hooks/useTripMode';
import { TransportMiniMap } from '@/features/transport/TransportMiniMap';

const statusLabels: Record<string, string> = {
  suggested: 'Suggested',
  interested: 'Interested',
  planned: 'Planned',
  scheduled: 'Scheduled',
  booked: 'Booked',
  visited: 'Visited',
  skipped: 'Skipped',
};

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'];

const TRANSPORT_CATEGORIES = [
  { value: 'airplane',            label: 'Airplane' },
  { value: 'domesticFlight',      label: 'Domestic Flight' },
  { value: 'internationalFlight', label: 'International Flight' },
  { value: 'train',               label: 'Train' },
  { value: 'nightTrain',          label: 'Night Train' },
  { value: 'highSpeedTrain',      label: 'High-Speed Train' },
  { value: 'bus',                 label: 'Bus' },
  { value: 'subway',              label: 'Subway / Metro' },
  { value: 'tram',                label: 'Tram' },
  { value: 'ferry',               label: 'Ferry' },
  { value: 'cruise',              label: 'Cruise' },
  { value: 'cruiseShip',          label: 'Cruise Ship' },
  { value: 'taxi',                label: 'Taxi' },
  { value: 'carRental',           label: 'Car Rental' },
  { value: 'rideshare',           label: 'Rideshare' },
  { value: 'privateTransfer',     label: 'Private Transfer' },
  { value: 'car',                 label: 'Car' },
  { value: 'walk',                label: 'Walking' },
  { value: 'bicycle',             label: 'Bicycle' },
  { value: 'motorcycle',          label: 'Motorcycle' },
  { value: 'scooter',             label: 'Scooter' },
  { value: 'boatTaxi',            label: 'Boat Taxi' },
  { value: 'cableCar',            label: 'Cable Car' },
  { value: 'funicular',           label: 'Funicular' },
  { value: 'rv',                  label: 'RV / Campervan' },
  { value: 'otherTransportation', label: 'Other' },
];

interface SegmentFormData {
  fromName: string;
  fromCode: string;
  toName: string;
  toCode: string;
  departureTime: string;
  arrivalTime: string;
  flightNumber: string;
}

interface TransportDetailDialogProps {
  transport: Transportation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function segmentsToForm(transport: Transportation): SegmentFormData[] {
  if (transport.segments.length === 0) {
    return [{ fromName: '', fromCode: '', toName: '', toCode: '', departureTime: '', arrivalTime: '', flightNumber: '' }];
  }
  return transport.segments.map(s => ({
    fromName: s.from.name || '',
    fromCode: s.from.code || '',
    toName: s.to.name || '',
    toCode: s.to.code || '',
    departureTime: s.departure_time?.slice(0, 16) || '',
    arrivalTime: s.arrival_time?.slice(0, 16) || '',
    flightNumber: s.flight_or_vessel_number || '',
  }));
}

export function TransportDetailDialog({ transport, open, onOpenChange }: TransportDetailDialogProps) {
  const { t } = useTranslation();
  const { updateTransportation, deleteTransportation } = useTransport();
  const { activeTrip } = useActiveTrip();
  const { isResearch } = useTripMode();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [category, setCategory] = useState(transport.category);
  const [isBooked, setIsBooked] = useState(transport.status === 'booked');
  const [costAmount, setCostAmount] = useState(transport.cost.total_amount?.toString() || '');
  const [costCurrency, setCostCurrency] = useState(transport.cost.currency || activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(transport.isPaid);
  const [orderNumber, setOrderNumber] = useState(transport.booking.order_number || '');
  const [carrierName, setCarrierName] = useState(transport.booking.carrier_name || '');
  const [notes, setNotes] = useState(transport.additionalInfo.notes || '');
  const [freeCancellationUntil, setFreeCancellationUntil] = useState(
    transport.booking.free_cancellation_until ? transport.booking.free_cancellation_until.slice(0, 16) : ''
  );
  const [segments, setSegments] = useState<SegmentFormData[]>(segmentsToForm(transport));

  useEffect(() => {
    setCategory(transport.category);
    setIsBooked(transport.status === 'booked');
    setCostAmount(transport.cost.total_amount?.toString() || '');
    setCostCurrency(transport.cost.currency || activeTrip?.currency || 'ILS');
    setIsPaid(transport.isPaid);
    setOrderNumber(transport.booking.order_number || '');
    setCarrierName(transport.booking.carrier_name || '');
    setNotes(transport.additionalInfo.notes || '');
    setFreeCancellationUntil(transport.booking.free_cancellation_until ? transport.booking.free_cancellation_until.slice(0, 16) : '');
    setSegments(segmentsToForm(transport));
  }, [transport]);

  const updateSegment = (index: number, field: keyof SegmentFormData, value: string) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addSegment = () => {
    setSegments(prev => {
      const last = prev[prev.length - 1];
      return [...prev, { fromName: last.toName, fromCode: last.toCode, toName: '', toCode: '', departureTime: '', arrivalTime: '', flightNumber: '' }];
    });
  };

  const removeSegment = (index: number) => {
    setSegments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    const updatedSegments = segments.map((s, i) => {
      const orig = transport.segments[i];
      return {
        ...(orig || {}),
        from: { ...(orig?.from || {}), name: s.fromName, code: s.fromCode || undefined },
        to: { ...(orig?.to || {}), name: s.toName, code: s.toCode || undefined },
        departure_time: s.departureTime ? new Date(s.departureTime).toISOString() : (orig?.departure_time || new Date().toISOString()),
        arrival_time: s.arrivalTime ? new Date(s.arrivalTime).toISOString() : (orig?.arrival_time || new Date().toISOString()),
        flight_or_vessel_number: s.flightNumber || undefined,
      };
    });

    const updated: Transportation = {
      ...transport,
      isPaid,
      category,
      status: isBooked ? 'booked' : (['visited', 'skipped'].includes(transport.status) ? transport.status : transport.status === 'booked' ? 'suggested' : transport.status),
      cost: { total_amount: costAmount ? parseFloat(costAmount) : 0, currency: costCurrency },
      booking: { ...transport.booking, order_number: orderNumber || undefined, carrier_name: carrierName || undefined, free_cancellation_until: freeCancellationUntil ? `${freeCancellationUntil}:00` : null },
      segments: updatedSegments,
      additionalInfo: { ...transport.additionalInfo, notes: notes || undefined },
    };

    await updateTransportation(updated);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setCategory(transport.category);
    setIsBooked(transport.status === 'booked');
    setCostAmount(transport.cost.total_amount?.toString() || '');
    setCostCurrency(transport.cost.currency || activeTrip?.currency || 'ILS');
    setIsPaid(transport.isPaid);
    setOrderNumber(transport.booking.order_number || '');
    setCarrierName(transport.booking.carrier_name || '');
    setNotes(transport.additionalInfo.notes || '');
    setFreeCancellationUntil(transport.booking.free_cancellation_until ? transport.booking.free_cancellation_until.slice(0, 16) : '');
    setSegments(segmentsToForm(transport));
    onOpenChange(false);
  };

  const handleDelete = async () => {
    await deleteTransportation(transport.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-6xl !flex !flex-col overflow-hidden sm:max-h-[85vh] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>Edit transport</DialogTitle>
        </DialogHeader>
        <div className="min-h-0 flex-1 sm:flex sm:flex-col max-sm:overflow-y-auto max-sm:pb-4">
          <div className="sm:grid sm:grid-cols-[2fr_auto_3fr_3fr] sm:gap-5 sm:flex-1 sm:min-h-0">
            {/* Left column: segments (scrollable) */}
            <div className="space-y-2 sm:overflow-y-auto sm:min-h-0 sm:pr-1">
              {segments.map((seg, i) => (
                <div key={i}>
                  <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Segment {i + 1}</span>
                      {segments.length > 1 && (
                        <button type="button" onClick={() => removeSegment(i)} className="text-destructive/70 hover:text-destructive transition-colors p-0.5" aria-label="Remove segment">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.fromName} onChange={e => updateSegment(i, 'fromName', e.target.value)} placeholder="Origin" className="h-7 text-sm bg-background/50" aria-label="Origin name" name={`detail-segment-${i}-fromName`} autoComplete="off" />
                      <Input value={seg.fromCode} onChange={e => updateSegment(i, 'fromCode', e.target.value)} placeholder="Code" className="h-7 text-sm w-14 bg-background/50 text-center" aria-label="Origin code" name={`detail-segment-${i}-fromCode`} autoComplete="off" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.toName} onChange={e => updateSegment(i, 'toName', e.target.value)} placeholder="Destination" className="h-7 text-sm bg-background/50" aria-label="Destination name" name={`detail-segment-${i}-toName`} autoComplete="off" />
                      <Input value={seg.toCode} onChange={e => updateSegment(i, 'toCode', e.target.value)} placeholder="Code" className="h-7 text-sm w-14 bg-background/50 text-center" aria-label="Destination code" name={`detail-segment-${i}-toCode`} autoComplete="off" />
                    </div>
                    {!isResearch && (<>
                      <div className="grid grid-cols-2 gap-1.5 items-end">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{t('createTransport.departure')}</Label>
                          <Input type="datetime-local" value={seg.departureTime} onChange={e => updateSegment(i, 'departureTime', e.target.value)} className="h-7 text-[11px] bg-background/50" aria-label={t('createTransport.departureTime')} name={`detail-segment-${i}-departureTime`} autoComplete="off" />
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{t('createTransport.arrival')}</Label>
                          <Input type="datetime-local" value={seg.arrivalTime} onChange={e => updateSegment(i, 'arrivalTime', e.target.value)} className="h-7 text-[11px] bg-background/50" aria-label={t('createTransport.arrivalTime')} name={`detail-segment-${i}-arrivalTime`} autoComplete="off" />
                        </div>
                      </div>
                      <Input value={seg.flightNumber} onChange={e => updateSegment(i, 'flightNumber', e.target.value)} placeholder={t('createTransport.flightNumber')} className="h-7 text-sm bg-background/50 w-28" aria-label={t('createTransport.flightNumber')} name={`detail-segment-${i}-flightNumber`} autoComplete="off" />
                    </>)}
                  </div>
                  {i < segments.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowDown size={12} className="text-muted-foreground/50" aria-hidden="true" />
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="w-full gap-1 text-xs text-muted-foreground hover:text-foreground h-7" onClick={addSegment}>
                <Plus size={13} /> Add segment
              </Button>
            </div>

            {/* Divider */}
            <div className="max-sm:h-px max-sm:bg-border max-sm:my-4 sm:w-px sm:bg-border" />

            {/* Right column: details */}
            <div className="space-y-4 max-sm:mt-0">
              {/* Transport Details */}
              <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Details</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="detail-transport-type" className="text-xs text-muted-foreground">Type</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSPORT_CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Status</Label>
                    <div className="h-8 flex items-center">
                      <Badge variant={transport.status === 'booked' ? 'default' : 'secondary'} className="text-xs">
                        {statusLabels[transport.status] || transport.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="detail-transport-carrier" className="text-xs text-muted-foreground">Carrier</Label>
                    <Input id="detail-transport-carrier" name="carrierName" value={carrierName} onChange={e => setCarrierName(e.target.value)} className="h-8" autoComplete="off" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="detail-transport-order" className="text-xs text-muted-foreground">Order number</Label>
                    <Input id="detail-transport-order" name="orderNumber" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="h-8" autoComplete="off" />
                  </div>
                </div>
              </div>

              {/* Cost & Booking */}
              <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Cost & Booking</span>
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="h-8" name="costAmount" autoComplete="off" />
                    <Select value={costCurrency} onValueChange={setCostCurrency}>
                      <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
                  <Label htmlFor="transport-detail-is-booked" className="text-sm">Booked?</Label>
                  <Switch id="transport-detail-is-booked" checked={isBooked} onCheckedChange={setIsBooked} />
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
                  <Label htmlFor="transport-detail-is-paid" className="text-sm">Paid?</Label>
                  <Switch id="transport-detail-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="transport-detail-free-cancel" className="text-xs text-muted-foreground">{t('poiDetail.freeCancellationUntil')}</Label>
                  <Input id="transport-detail-free-cancel" name="freeCancellationUntil" type="datetime-local" value={freeCancellationUntil} onChange={e => setFreeCancellationUntil(e.target.value)} className="h-8" />
                </div>
              </div>

            </div>

            {/* Right column: map + notes + buttons (desktop only) */}
            <div className="max-sm:hidden flex flex-col gap-3 min-h-0">
              <TransportMiniMap
                points={segments.flatMap(s => [
                  { name: s.fromName, code: s.fromCode },
                  { name: s.toName, code: s.toCode },
                ])}
                className="flex-1 min-h-[200px]"
              />
              <div className="space-y-1">
                <Label htmlFor="detail-transport-notes" className="text-xs text-muted-foreground">{t('createTransport.notes')}</Label>
                <Textarea id="detail-transport-notes" name="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-sm resize-none" autoComplete="off" />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleSave} size="sm" className="flex-1 gap-1">
                  <Save size={14} /> {t('common.save')}
                </Button>
                <Button variant="outline" size="sm" onClick={handleCancel} className="flex-1">
                  {t('common.cancel')}
                </Button>
                <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" className="flex-1 gap-1 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10">
                      <Trash2 size={14} /> {t('common.delete')}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t('transportDetail.deleteConfirm')}</AlertDialogTitle>
                      <AlertDialogDescription>{t('poiDetail.cannotUndo')}</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          </div>

          {/* Mobile: map + notes + buttons (below the grid) */}
          <div className="sm:hidden mt-4 space-y-3">
            <TransportMiniMap
              points={segments.flatMap(s => [
                { name: s.fromName, code: s.fromCode },
                { name: s.toName, code: s.toCode },
              ])}
              className="w-full h-40"
            />
            <div className="space-y-1">
              <Label htmlFor="detail-transport-notes-mobile" className="text-xs text-muted-foreground">{t('createTransport.notes')}</Label>
              <Textarea id="detail-transport-notes-mobile" name="notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-sm resize-none" autoComplete="off" />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} size="sm" className="flex-1 gap-1">
                <Save size={14} /> {t('common.save')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleCancel} className="flex-1">
                {t('common.cancel')}
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" className="flex-1 gap-1 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10">
                    <Trash2 size={14} /> {t('common.delete')}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('transportDetail.deleteConfirm')}</AlertDialogTitle>
                    <AlertDialogDescription>{t('poiDetail.cannotUndo')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
