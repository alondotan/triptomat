import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useTransport } from '@/context/TransportContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowDown } from 'lucide-react';
import { TransportMiniMap } from '@/components/transport/TransportMiniMap';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { createTransportSchema } from '@/schemas/transport.schema';
import type { TransportStatus } from '@/types/trip';
import { useTripMode } from '@/hooks/useTripMode';
import { TripDaySelect } from '@/components/shared/TripDaySelect';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'];

const TRANSPORT_CATEGORY_KEYS = [
  'airplane', 'domesticFlight', 'internationalFlight',
  'train', 'nightTrain', 'highSpeedTrain',
  'bus', 'subway', 'tram',
  'ferry', 'cruise', 'cruiseShip',
  'taxi', 'carRental', 'rideshare', 'privateTransfer',
  'car', 'walk', 'bicycle', 'motorcycle', 'scooter',
  'boatTaxi', 'cableCar', 'funicular', 'rv', 'otherTransportation',
] as const;

interface SegmentFormData {
  fromName: string;
  fromCode: string;
  toName: string;
  toCode: string;
  departureTime: string;
  arrivalTime: string;
  flightNumber: string;
}

const emptySegment = (): SegmentFormData => ({
  fromName: '', fromCode: '', toName: '', toCode: '',
  departureTime: '', arrivalTime: '', flightNumber: '',
});

interface CreateTransportFormProps {
  /** Controlled mode: when provided, hides the trigger button and uses external state */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Called with the new transport's id after successful creation */
  onCreated?: (id: string) => void;
  /** Pre-fill departure location for first segment */
  initialFrom?: string;
  /** Pre-fill destination location for first segment */
  initialTo?: string;
}

export function CreateTransportForm({ open: openProp, onOpenChange, onCreated, initialFrom, initialTo }: CreateTransportFormProps = {}) {
  const { t } = useTranslation();
  const isControlled = openProp !== undefined;
  const { activeTrip } = useActiveTrip();
  const { addTransportation } = useTransport();
  const { isResearch, isPlanning } = useTripMode();
  const { toast } = useToast();
  const [openInternal, setOpenInternal] = useState(false);
  const open = isControlled ? openProp! : openInternal;
  const setOpen = (v: boolean) => { if (isControlled) { onOpenChange?.(v); } else { setOpenInternal(v); } };
  const [category, setCategory] = useState('airplane');
  const status: TransportStatus = 'suggested';
  const [segments, setSegments] = useState<SegmentFormData[]>([emptySegment()]);

  // Pre-fill from/to when the controlled dialog opens
  useEffect(() => {
    if (open && (initialFrom || initialTo)) {
      setSegments([{ ...emptySegment(), fromName: initialFrom || '', toName: initialTo || '' }]);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [orderNumber, setOrderNumber] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState(activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(true);
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setCategory('airplane');
    // status is always 'suggested' for new transports
    setSegments([emptySegment()]);
    setOrderNumber(''); setCarrierName('');
    setCostAmount(''); setCostCurrency(activeTrip?.currency || 'ILS'); setIsPaid(true); setNotes('');
  };

  const updateSegment = (index: number, field: keyof SegmentFormData, value: string) => {
    setSegments(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const addSegment = () => {
    setSegments(prev => {
      const last = prev[prev.length - 1];
      return [...prev, { ...emptySegment(), fromName: last.toName, fromCode: last.toCode }];
    });
  };

  const removeSegment = (index: number) => {
    setSegments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;

    const validation = createTransportSchema.safeParse({
      category,
      status,
      segments: segments.map(s => ({
        fromName: s.fromName.trim(),
        fromCode: s.fromCode || undefined,
        toName: s.toName.trim(),
        toCode: s.toCode || undefined,
        departureTime: s.departureTime || undefined,
        arrivalTime: s.arrivalTime || undefined,
        flightNumber: s.flightNumber || undefined,
      })),
      carrierName: carrierName || undefined,
      orderNumber: orderNumber || undefined,
      costAmount: costAmount ? parseFloat(costAmount) : undefined,
      costCurrency: costCurrency || undefined,
      notes: notes || undefined,
    });
    if (!validation.success) {
      toast({ title: "Validation error", description: validation.error.issues[0].message, variant: "destructive" });
      return;
    }

    const result = await addTransportation({
      tripId: activeTrip.id,
      category,
      status,
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      cost: {
        total_amount: costAmount ? parseFloat(costAmount) : 0,
        currency: costCurrency,
      },
      booking: {
        order_number: orderNumber || undefined,
        carrier_name: carrierName || undefined,
      },
      segments: segments.map(s => ({
        from: { name: s.fromName.trim(), code: s.fromCode || undefined },
        to: { name: s.toName.trim(), code: s.toCode || undefined },
        departure_time: s.departureTime,
        arrival_time: s.arrivalTime,
        flight_or_vessel_number: s.flightNumber || undefined,
      })),
      additionalInfo: { notes: notes || undefined },
      isCancelled: false,
      isPaid,
    });

    resetForm();
    setOpen(false);
    if (result) onCreated?.(result.id);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button className="gap-1"><Plus size={16} /> {t('createTransport.newTransport')}</Button>
        </DialogTrigger>
      )}
      <DialogContent className="bg-card sm:max-w-6xl !flex !flex-col overflow-hidden sm:max-h-[85vh] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0">
        <DialogHeader className="shrink-0"><DialogTitle>{t('createTransport.title')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="min-h-0 flex-1 sm:flex sm:flex-col max-sm:overflow-y-auto max-sm:pb-4">
          <div className="sm:grid sm:grid-cols-[2fr_auto_3fr_3fr] sm:gap-5 sm:flex-1 sm:min-h-0">
            {/* Left column: segments (scrollable) */}
            <div className="space-y-2 sm:overflow-y-auto sm:min-h-0 sm:pr-1">
              {segments.map((seg, i) => (
                <div key={i}>
                  <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">{t('createTransport.segment', { num: i + 1 })}</span>
                      {segments.length > 1 && (
                        <button type="button" onClick={() => removeSegment(i)} className="text-destructive/70 hover:text-destructive transition-colors p-0.5" aria-label={t('createTransport.removeSegment')}>
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.fromName} onChange={e => updateSegment(i, 'fromName', e.target.value)} required placeholder={t('createTransport.from')} className="h-7 text-sm bg-background/50" aria-label={t('createTransport.from')} name={`segment-${i}-fromName`} autoComplete="off" />
                      <Input value={seg.fromCode} onChange={e => updateSegment(i, 'fromCode', e.target.value)} placeholder="TLV" className="h-7 text-sm w-14 bg-background/50 text-center" aria-label={t('createTransport.from')} name={`segment-${i}-fromCode`} autoComplete="off" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.toName} onChange={e => updateSegment(i, 'toName', e.target.value)} required placeholder={t('createTransport.to')} className="h-7 text-sm bg-background/50" aria-label={t('createTransport.to')} name={`segment-${i}-toName`} autoComplete="off" />
                      <Input value={seg.toCode} onChange={e => updateSegment(i, 'toCode', e.target.value)} placeholder="CDG" className="h-7 text-sm w-14 bg-background/50 text-center" aria-label={t('createTransport.to')} name={`segment-${i}-toCode`} autoComplete="off" />
                    </div>
                    {!isResearch && (
                      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{isPlanning ? t('createTransport.departureDay') : t('createTransport.departure')}</Label>
                          {isPlanning ? (
                            <div className="flex gap-1">
                              <TripDaySelect value={seg.departureTime ? parseInt(seg.departureTime) || '' : ''} onChange={(v) => updateSegment(i, 'departureTime', v ? String(v) : '')} className="h-7 text-[11px]" />
                              <Input type="time" value="" onChange={e => updateSegment(i, 'departureTime', seg.departureTime + 'T' + e.target.value)} className="h-7 text-[11px] w-20 bg-background/50" placeholder="HH:mm" aria-label={t('createTransport.departureTime')} name={`segment-${i}-departureTime`} autoComplete="off" />
                            </div>
                          ) : (
                            <Input type="datetime-local" value={seg.departureTime} onChange={e => updateSegment(i, 'departureTime', e.target.value)} className="h-7 text-[11px] bg-background/50" aria-label={t('createTransport.departureTime')} name={`segment-${i}-departureTime`} autoComplete="off" />
                          )}
                        </div>
                        <div>
                          <Label className="text-[10px] text-muted-foreground">{isPlanning ? t('createTransport.arrivalDay') : t('createTransport.arrival')}</Label>
                          {isPlanning ? (
                            <div className="flex gap-1">
                              <TripDaySelect value={seg.arrivalTime ? parseInt(seg.arrivalTime) || '' : ''} onChange={(v) => updateSegment(i, 'arrivalTime', v ? String(v) : '')} className="h-7 text-[11px]" />
                              <Input type="time" value="" onChange={e => updateSegment(i, 'arrivalTime', seg.arrivalTime + 'T' + e.target.value)} className="h-7 text-[11px] w-20 bg-background/50" placeholder="HH:mm" aria-label={t('createTransport.arrivalTime')} name={`segment-${i}-arrivalTime`} autoComplete="off" />
                            </div>
                          ) : (
                            <Input type="datetime-local" value={seg.arrivalTime} onChange={e => updateSegment(i, 'arrivalTime', e.target.value)} className="h-7 text-[11px] bg-background/50" aria-label={t('createTransport.arrivalTime')} name={`segment-${i}-arrivalTime`} autoComplete="off" />
                          )}
                        </div>
                        <Input value={seg.flightNumber} onChange={e => updateSegment(i, 'flightNumber', e.target.value)} placeholder={t('createTransport.flightNumber')} className="h-7 text-sm w-20 bg-background/50" aria-label={t('createTransport.flightNumber')} name={`segment-${i}-flightNumber`} autoComplete="off" />
                      </div>
                    )}
                  </div>
                  {i < segments.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowDown size={12} className="text-muted-foreground/50" aria-hidden="true" />
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="w-full gap-1 text-xs text-muted-foreground hover:text-foreground h-7" onClick={addSegment}>
                <Plus size={13} /> {t('createTransport.addSegment')}
              </Button>
            </div>

            {/* Divider */}
            <div className="max-sm:h-px max-sm:bg-border max-sm:my-4 sm:w-px sm:bg-border" />

            {/* Right column: details */}
            <div className="space-y-4 max-sm:mt-0">
              {/* Transport Details */}
              <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('createTransport.details')}</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="transport-type" className="text-xs text-muted-foreground">{t('createTransport.type')}</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TRANSPORT_CATEGORY_KEYS.map(key => (
                          <SelectItem key={key} value={key}>{t(`transportCategory.${key}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label htmlFor="transport-carrier" className="text-xs text-muted-foreground">{t('createTransport.carrierName')}</Label>
                    <Input id="transport-carrier" name="carrierName" value={carrierName} onChange={e => setCarrierName(e.target.value)} placeholder={t('createTransport.carrierPlaceholder')} className="h-8" autoComplete="off" />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="transport-order" className="text-xs text-muted-foreground">{t('createTransport.orderNumber')}</Label>
                    <Input id="transport-order" name="orderNumber" value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder={t('createTransport.orderPlaceholder')} className="h-8" autoComplete="off" />
                  </div>
                </div>
              </div>

              {/* Cost */}
              <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('createTransport.cost')}</span>
                <div className="space-y-1">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="h-8" name="costAmount" autoComplete="off" />
                    <Select value={costCurrency} onValueChange={setCostCurrency}>
                      <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
                  <Label htmlFor="transport-is-paid" className="text-sm">{t('createTransport.paid')}</Label>
                  <Switch id="transport-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
                </div>
              </div>

              <Button type="submit" className="w-full h-9 sm:hidden">{t('createTransport.addTransportation')}</Button>
            </div>

            {/* Right column: map + notes + submit (desktop only) */}
            <div className="max-sm:hidden flex flex-col gap-3 min-h-0">
              <TransportMiniMap
                points={segments.flatMap(s => [
                  { name: s.fromName, code: s.fromCode },
                  { name: s.toName, code: s.toCode },
                ])}
                className="flex-1 min-h-[200px]"
              />
              <div className="space-y-1">
                <Label htmlFor="transport-notes" className="text-xs text-muted-foreground">{t('createTransport.notes')}</Label>
                <Textarea id="transport-notes" name="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('createTransport.notesPlaceholder')} rows={2} className="text-sm resize-none" autoComplete="off" />
              </div>
              <Button type="submit" className="w-full h-9">{t('createTransport.addTransportation')}</Button>
            </div>
          </div>

          {/* Notes on mobile (below the grid) */}
          <div className="sm:hidden mt-4 space-y-1">
            <Label htmlFor="transport-notes-mobile" className="text-xs text-muted-foreground">{t('createTransport.notes')}</Label>
            <Textarea id="transport-notes-mobile" name="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('createTransport.notesPlaceholder')} rows={2} className="text-sm resize-none" autoComplete="off" />
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
