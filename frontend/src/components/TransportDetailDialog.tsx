import { useState, useEffect } from 'react';
import { useTrip } from '@/context/TripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save } from 'lucide-react';
import type { Transportation, TransportStatus } from '@/types/trip';

const TRANSPORT_CATEGORIES = [
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'ferry', label: 'Ferry' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'car_rental', label: 'Car Rental' },
  { value: 'other', label: 'Other' },
];

interface TransportDetailDialogProps {
  transport: Transportation;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function TransportDetailDialog({ transport, open, onOpenChange }: TransportDetailDialogProps) {
  const { updateTransportation, state } = useTrip();

  const [category, setCategory] = useState(transport.category);
  const [status, setStatus] = useState<TransportStatus>(transport.status);
  const [costAmount, setCostAmount] = useState(transport.cost.total_amount?.toString() || '');
  const [costCurrency, setCostCurrency] = useState(transport.cost.currency || state.activeTrip?.currency || 'ILS');
  const [orderNumber, setOrderNumber] = useState(transport.booking.order_number || '');
  const [carrierName, setCarrierName] = useState(transport.booking.carrier_name || '');
  const [notes, setNotes] = useState(transport.additionalInfo.notes || '');

  // Segment 0 editing
  const seg = transport.segments[0];
  const [fromName, setFromName] = useState(seg?.from.name || '');
  const [fromCode, setFromCode] = useState(seg?.from.code || '');
  const [toName, setToName] = useState(seg?.to.name || '');
  const [toCode, setToCode] = useState(seg?.to.code || '');
  const [departureTime, setDepartureTime] = useState(seg?.departure_time?.slice(0, 16) || '');
  const [arrivalTime, setArrivalTime] = useState(seg?.arrival_time?.slice(0, 16) || '');
  const [flightNumber, setFlightNumber] = useState(seg?.flight_or_vessel_number || '');

  useEffect(() => {
    setCategory(transport.category);
    setStatus(transport.status);
    setCostAmount(transport.cost.total_amount?.toString() || '');
    setCostCurrency(transport.cost.currency || state.activeTrip?.currency || 'ILS');
    setOrderNumber(transport.booking.order_number || '');
    setCarrierName(transport.booking.carrier_name || '');
    setNotes(transport.additionalInfo.notes || '');
    const s = transport.segments[0];
    setFromName(s?.from.name || '');
    setFromCode(s?.from.code || '');
    setToName(s?.to.name || '');
    setToCode(s?.to.code || '');
    setDepartureTime(s?.departure_time?.slice(0, 16) || '');
    setArrivalTime(s?.arrival_time?.slice(0, 16) || '');
    setFlightNumber(s?.flight_or_vessel_number || '');
  }, [transport]);

  const handleSave = async () => {
    const updatedSegments = [...transport.segments];
    if (updatedSegments.length > 0) {
      updatedSegments[0] = {
        ...updatedSegments[0],
        from: { ...updatedSegments[0].from, name: fromName, code: fromCode || undefined },
        to: { ...updatedSegments[0].to, name: toName, code: toCode || undefined },
        departure_time: departureTime ? new Date(departureTime).toISOString() : updatedSegments[0].departure_time,
        arrival_time: arrivalTime ? new Date(arrivalTime).toISOString() : updatedSegments[0].arrival_time,
        flight_or_vessel_number: flightNumber || undefined,
      };
    }

    const updated: Transportation = {
      ...transport,
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
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>עריכת תחבורה</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>סוג</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRANSPORT_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>סטטוס</Label>
              <Select value={status} onValueChange={v => setStatus(v as TransportStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="candidate">מועמד</SelectItem>
                  <SelectItem value="in_plan">בתוכנית</SelectItem>
                  <SelectItem value="booked">הוזמן</SelectItem>
                  <SelectItem value="completed">הושלם</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="border border-border rounded-md p-3 space-y-2">
            <legend className="text-sm font-medium px-1">מוצא</legend>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder="שם" />
              </div>
              <Input value={fromCode} onChange={e => setFromCode(e.target.value)} placeholder="קוד" />
            </div>
          </fieldset>

          <fieldset className="border border-border rounded-md p-3 space-y-2">
            <legend className="text-sm font-medium px-1">יעד</legend>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <Input value={toName} onChange={e => setToName(e.target.value)} placeholder="שם" />
              </div>
              <Input value={toCode} onChange={e => setToCode(e.target.value)} placeholder="קוד" />
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>יציאה</Label>
              <Input type="datetime-local" value={departureTime} onChange={e => setDepartureTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>הגעה</Label>
              <Input type="datetime-local" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>מספר טיסה/כלי</Label>
              <Input value={flightNumber} onChange={e => setFlightNumber(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>מוביל</Label>
              <Input value={carrierName} onChange={e => setCarrierName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>עלות</Label>
              <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>מטבע</Label>
              <Input value={costCurrency} onChange={e => setCostCurrency(e.target.value)} placeholder="ILS" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>מספר הזמנה</Label>
            <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} />
          </div>

          <div className="space-y-2">
            <Label>הערות</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
          </div>

          <Button onClick={handleSave} className="w-full gap-1.5">
            <Save size={16} /> שמור שינויים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
