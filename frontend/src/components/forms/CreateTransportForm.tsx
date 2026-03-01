import { useState, useEffect } from 'react';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useTransport } from '@/context/TransportContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, ArrowDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { createTransportSchema } from '@/schemas/transport.schema';
import type { TransportStatus } from '@/types/trip';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'];

const TRANSPORT_CATEGORIES = [
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'ferry', label: 'Ferry' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'car_rental', label: 'Car Rental' },
  { value: 'other', label: 'Other' },
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
  const isControlled = openProp !== undefined;
  const { activeTrip } = useActiveTrip();
  const { addTransportation } = useTransport();
  const { toast } = useToast();
  const [openInternal, setOpenInternal] = useState(false);
  const open = isControlled ? openProp! : openInternal;
  const setOpen = (v: boolean) => { isControlled ? onOpenChange?.(v) : setOpenInternal(v); };
  const [category, setCategory] = useState('flight');
  const [status, setStatus] = useState<TransportStatus>('candidate');
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
    setCategory('flight');
    setStatus('candidate');
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
          <Button className="gap-1"><Plus size={16} /> New Transport</Button>
        </DialogTrigger>
      )}
      <DialogContent className="bg-card sm:max-w-4xl !flex !flex-col overflow-hidden sm:max-h-[85vh] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0">
        <DialogHeader className="shrink-0"><DialogTitle>Add Transportation</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="overflow-y-auto min-h-0 flex-1 pr-1 max-sm:pb-4">
          <div className="sm:grid sm:grid-cols-[2fr_auto_3fr] sm:gap-5">
            {/* Left column: segments */}
            <div className="space-y-2">
              {segments.map((seg, i) => (
                <div key={i}>
                  <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Segment {i + 1}</span>
                      {segments.length > 1 && (
                        <button type="button" onClick={() => removeSegment(i)} className="text-destructive/70 hover:text-destructive transition-colors p-0.5">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.fromName} onChange={e => updateSegment(i, 'fromName', e.target.value)} required placeholder="From" className="h-7 text-sm bg-background/50" />
                      <Input value={seg.fromCode} onChange={e => updateSegment(i, 'fromCode', e.target.value)} placeholder="TLV" className="h-7 text-sm w-14 bg-background/50 text-center" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.toName} onChange={e => updateSegment(i, 'toName', e.target.value)} required placeholder="To" className="h-7 text-sm bg-background/50" />
                      <Input value={seg.toCode} onChange={e => updateSegment(i, 'toCode', e.target.value)} placeholder="CDG" className="h-7 text-sm w-14 bg-background/50 text-center" />
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Departure</Label>
                        <Input type="datetime-local" value={seg.departureTime} onChange={e => updateSegment(i, 'departureTime', e.target.value)} className="h-7 text-[11px] bg-background/50" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">Arrival</Label>
                        <Input type="datetime-local" value={seg.arrivalTime} onChange={e => updateSegment(i, 'arrivalTime', e.target.value)} className="h-7 text-[11px] bg-background/50" />
                      </div>
                      <Input value={seg.flightNumber} onChange={e => updateSegment(i, 'flightNumber', e.target.value)} placeholder="Flight #" className="h-7 text-sm w-20 bg-background/50" />
                    </div>
                  </div>
                  {i < segments.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowDown size={12} className="text-muted-foreground/50" />
                    </div>
                  )}
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" className="w-full gap-1 text-xs text-muted-foreground hover:text-foreground h-7" onClick={addSegment}>
                <Plus size={13} /> Add Segment
              </Button>
            </div>

            {/* Divider */}
            <div className="max-sm:h-px max-sm:bg-border max-sm:my-4 sm:w-px sm:bg-border" />

            {/* Right column: details */}
            <div className="space-y-3 max-sm:mt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Type</Label>
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
                  <Select value={status} onValueChange={v => setStatus(v as TransportStatus)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="candidate">Candidate</SelectItem>
                      <SelectItem value="in_plan">In Plan</SelectItem>
                      <SelectItem value="booked">Booked</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Carrier</Label>
                  <Input value={carrierName} onChange={e => setCarrierName(e.target.value)} placeholder="El Al" className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Order #</Label>
                  <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="ABC123" className="h-8" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Cost</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="h-8" />
                  <Select value={costCurrency} onValueChange={setCostCurrency}>
                    <SelectTrigger className="h-8 w-[72px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-1.5">
                <Label htmlFor="transport-is-paid" className="text-sm">Paid</Label>
                <Switch id="transport-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Layover info, seat preferences..." rows={2} className="text-sm resize-none" />
              </div>

              <Button type="submit" className="w-full h-9">Add Transportation</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
