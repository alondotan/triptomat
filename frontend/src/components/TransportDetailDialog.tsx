import { useState, useEffect } from 'react';
import { useTrip } from '@/context/TripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Plus, Trash2, ArrowDown } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import type { Transportation, TransportStatus } from '@/types/trip';

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
  const { updateTransportation, state } = useTrip();

  const [category, setCategory] = useState(transport.category);
  const [status, setStatus] = useState<TransportStatus>(transport.status);
  const [costAmount, setCostAmount] = useState(transport.cost.total_amount?.toString() || '');
  const [costCurrency, setCostCurrency] = useState(transport.cost.currency || state.activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(transport.isPaid);
  const [orderNumber, setOrderNumber] = useState(transport.booking.order_number || '');
  const [carrierName, setCarrierName] = useState(transport.booking.carrier_name || '');
  const [notes, setNotes] = useState(transport.additionalInfo.notes || '');
  const [segments, setSegments] = useState<SegmentFormData[]>(segmentsToForm(transport));

  useEffect(() => {
    setCategory(transport.category);
    setStatus(transport.status);
    setCostAmount(transport.cost.total_amount?.toString() || '');
    setCostCurrency(transport.cost.currency || state.activeTrip?.currency || 'ILS');
    setIsPaid(transport.isPaid);
    setOrderNumber(transport.booking.order_number || '');
    setCarrierName(transport.booking.carrier_name || '');
    setNotes(transport.additionalInfo.notes || '');
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
      status,
      cost: { total_amount: costAmount ? parseFloat(costAmount) : 0, currency: costCurrency },
      booking: { ...transport.booking, order_number: orderNumber || undefined, carrier_name: carrierName || undefined },
      segments: updatedSegments,
      additionalInfo: { ...transport.additionalInfo, notes: notes || undefined },
    };

    await updateTransportation(updated);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card sm:max-w-4xl !flex !flex-col overflow-hidden sm:max-h-[85vh] max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0">
        <DialogHeader className="shrink-0">
          <DialogTitle>עריכת תחבורה</DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto min-h-0 flex-1 pr-1 max-sm:pb-4">
          <div className="sm:grid sm:grid-cols-[2fr_auto_3fr] sm:gap-5">
            {/* Left column: segments */}
            <div className="space-y-2">
              {segments.map((seg, i) => (
                <div key={i}>
                  <div className="rounded-xl bg-secondary/50 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">קטע {i + 1}</span>
                      {segments.length > 1 && (
                        <button type="button" onClick={() => removeSegment(i)} className="text-destructive/70 hover:text-destructive transition-colors p-0.5">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.fromName} onChange={e => updateSegment(i, 'fromName', e.target.value)} placeholder="מוצא" className="h-7 text-sm bg-background/50" />
                      <Input value={seg.fromCode} onChange={e => updateSegment(i, 'fromCode', e.target.value)} placeholder="קוד" className="h-7 text-sm w-14 bg-background/50 text-center" />
                    </div>
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                      <Input value={seg.toName} onChange={e => updateSegment(i, 'toName', e.target.value)} placeholder="יעד" className="h-7 text-sm bg-background/50" />
                      <Input value={seg.toCode} onChange={e => updateSegment(i, 'toCode', e.target.value)} placeholder="קוד" className="h-7 text-sm w-14 bg-background/50 text-center" />
                    </div>
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
                      <div>
                        <Label className="text-[10px] text-muted-foreground">יציאה</Label>
                        <Input type="datetime-local" value={seg.departureTime} onChange={e => updateSegment(i, 'departureTime', e.target.value)} className="h-7 text-[11px] bg-background/50" />
                      </div>
                      <div>
                        <Label className="text-[10px] text-muted-foreground">הגעה</Label>
                        <Input type="datetime-local" value={seg.arrivalTime} onChange={e => updateSegment(i, 'arrivalTime', e.target.value)} className="h-7 text-[11px] bg-background/50" />
                      </div>
                      <Input value={seg.flightNumber} onChange={e => updateSegment(i, 'flightNumber', e.target.value)} placeholder="טיסה #" className="h-7 text-sm w-20 bg-background/50" />
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
                <Plus size={13} /> הוסף קטע
              </Button>
            </div>

            {/* Divider */}
            <div className="max-sm:h-px max-sm:bg-border max-sm:my-4 sm:w-px sm:bg-border" />

            {/* Right column: details */}
            <div className="space-y-3 max-sm:mt-0">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">סוג</Label>
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
                  <Label className="text-xs text-muted-foreground">סטטוס</Label>
                  <Select value={status} onValueChange={v => setStatus(v as TransportStatus)}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="candidate">מועמד</SelectItem>
                      <SelectItem value="in_plan">בתוכנית</SelectItem>
                      <SelectItem value="booked">הוזמן</SelectItem>
                      <SelectItem value="completed">הושלם</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">מוביל</Label>
                  <Input value={carrierName} onChange={e => setCarrierName(e.target.value)} className="h-8" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">מספר הזמנה</Label>
                  <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} className="h-8" />
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">עלות</Label>
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="h-8" />
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

              <div className="flex items-center justify-between rounded-lg bg-secondary/30 px-3 py-1.5">
                <Label htmlFor="transport-detail-is-paid" className="text-sm">שולם?</Label>
                <Switch id="transport-detail-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">הערות</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} className="text-sm resize-none" />
              </div>

              <Button onClick={handleSave} className="w-full h-9 gap-1.5">
                <Save size={16} /> שמור שינויים
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
