import { useState } from 'react';
import { useTrip } from '@/context/TripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { TransportStatus } from '@/types/trip';

const TRANSPORT_CATEGORIES = [
  { value: 'flight', label: 'Flight' },
  { value: 'train', label: 'Train' },
  { value: 'bus', label: 'Bus' },
  { value: 'ferry', label: 'Ferry' },
  { value: 'taxi', label: 'Taxi' },
  { value: 'car_rental', label: 'Car Rental' },
  { value: 'other', label: 'Other' },
];

export function CreateTransportForm() {
  const { state, addTransportation } = useTrip();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState('flight');
  const [status, setStatus] = useState<TransportStatus>('candidate');
  const [fromName, setFromName] = useState('');
  const [fromCode, setFromCode] = useState('');
  const [toName, setToName] = useState('');
  const [toCode, setToCode] = useState('');
  const [departureTime, setDepartureTime] = useState('');
  const [arrivalTime, setArrivalTime] = useState('');
  const [flightNumber, setFlightNumber] = useState('');
  const [orderNumber, setOrderNumber] = useState('');
  const [carrierName, setCarrierName] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setCategory('flight');
    setStatus('candidate');
    setFromName(''); setFromCode('');
    setToName(''); setToCode('');
    setDepartureTime(''); setArrivalTime('');
    setFlightNumber(''); setOrderNumber(''); setCarrierName('');
    setCostAmount(''); setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.activeTrip || !fromName.trim() || !toName.trim()) return;

    await addTransportation({
      tripId: state.activeTrip.id,
      category,
      status,
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      cost: {
        total_amount: costAmount ? parseFloat(costAmount) : 0,
        currency: state.activeTrip.currency,
      },
      booking: {
        order_number: orderNumber || undefined,
        carrier_name: carrierName || undefined,
      },
      segments: [
        {
          from: { name: fromName.trim(), code: fromCode || undefined },
          to: { name: toName.trim(), code: toCode || undefined },
          departure_time: departureTime || new Date().toISOString(),
          arrival_time: arrivalTime || new Date().toISOString(),
          flight_or_vessel_number: flightNumber || undefined,
        },
      ],
      additionalInfo: { notes: notes || undefined },
      isCancelled: false,
    });

    resetForm();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1"><Plus size={16} /> New Transport</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Transportation</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Type</Label>
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
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as TransportStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="candidate">Candidate</SelectItem>
                  <SelectItem value="in_plan">In Plan</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <fieldset className="border border-border rounded-md p-3 space-y-3">
            <legend className="text-sm font-medium px-1">From</legend>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input value={fromName} onChange={e => setFromName(e.target.value)} required placeholder="Tel Aviv" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Code</Label>
                <Input value={fromCode} onChange={e => setFromCode(e.target.value)} placeholder="TLV" />
              </div>
            </div>
          </fieldset>

          <fieldset className="border border-border rounded-md p-3 space-y-3">
            <legend className="text-sm font-medium px-1">To</legend>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input value={toName} onChange={e => setToName(e.target.value)} required placeholder="Paris CDG" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Code</Label>
                <Input value={toCode} onChange={e => setToCode(e.target.value)} placeholder="CDG" />
              </div>
            </div>
          </fieldset>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Departure</Label>
              <Input type="datetime-local" value={departureTime} onChange={e => setDepartureTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Arrival</Label>
              <Input type="datetime-local" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Flight/Vessel #</Label>
              <Input value={flightNumber} onChange={e => setFlightNumber(e.target.value)} placeholder="LY321" />
            </div>
            <div className="space-y-2">
              <Label>Carrier</Label>
              <Input value={carrierName} onChange={e => setCarrierName(e.target.value)} placeholder="El Al" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Order #</Label>
              <Input value={orderNumber} onChange={e => setOrderNumber(e.target.value)} placeholder="ABC123" />
            </div>
            <div className="space-y-2">
              <Label>Cost ({state.activeTrip?.currency || 'USD'})</Label>
              <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Layover info, seat preferences..." />
          </div>

          <Button type="submit" className="w-full">Add Transportation</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
