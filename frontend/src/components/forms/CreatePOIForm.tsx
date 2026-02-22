import { useState } from 'react';
import { useTrip } from '@/context/TripContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { CitySelector } from '@/components/CitySelector';
import { SubCategorySelector } from '@/components/SubCategorySelector';
import type { POICategory, POIStatus } from '@/types/trip';

export function CreatePOIForm() {
  const { state, addPOI } = useTrip();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<POICategory>('attraction');
  const [subCategory, setSubCategory] = useState('');
  const [status, setStatus] = useState<POIStatus>('candidate');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [manualCountry, setManualCountry] = useState(false);
  const [address, setAddress] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState(state.activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(false);
  const [notes, setNotes] = useState('');

  const tripCountries = state.activeTrip?.countries || [];

  const resetForm = () => {
    setName('');
    setCategory('attraction');
    setSubCategory('');
    setStatus('candidate');
    setCity('');
    setCountry('');
    setManualCountry(false);
    setAddress('');
    setCostAmount('');
    setCostCurrency(state.activeTrip?.currency || 'ILS');
    setIsPaid(false);
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!state.activeTrip || !name.trim()) return;

    await addPOI({
      tripId: state.activeTrip.id,
      category,
      subCategory: subCategory || undefined,
      name: name.trim(),
      status,
      location: {
        city: city || undefined,
        country: country || undefined,
        address: address || undefined,
      },
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      details: {
        cost: costAmount ? { amount: parseFloat(costAmount), currency: costCurrency } : undefined,
        notes: notes ? { user_summary: notes } : undefined,
      },
      isCancelled: false,
      isPaid,
    });

    resetForm();
    setOpen(false);
  };

  // Countries to pass to CitySelector: use selected country if from trip, otherwise trip countries
  const citySelectorCountries = country && tripCountries.includes(country) ? [country] : tripCountries;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1"><Plus size={16} /> New POI</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Add Point of Interest</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. Eiffel Tower" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={category} onValueChange={v => setCategory(v as POICategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="accommodation">Accommodation</SelectItem>
                  <SelectItem value="eatery">Eatery</SelectItem>
                  <SelectItem value="attraction">Attraction</SelectItem>
                  <SelectItem value="service">Service</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={status} onValueChange={v => setStatus(v as POIStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="candidate">Candidate</SelectItem>
                  <SelectItem value="in_plan">In Plan</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                  <SelectItem value="visited">Visited</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Sub-category</Label>
            <SubCategorySelector categoryFilter={category} value={subCategory} onChange={setSubCategory} placeholder="בחר תת-קטגוריה..." />
          </div>

          {/* Country selector */}
          <div className="space-y-2">
            <Label>Country</Label>
            {manualCountry ? (
              <div className="flex gap-1">
                <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="הזן מדינה ידנית..." className="flex-1" />
                <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setManualCountry(false)}>
                  רשימה
                </Button>
              </div>
            ) : tripCountries.length > 0 ? (
              <div className="flex gap-1">
                <Select value={country} onValueChange={v => { setCountry(v); setCity(''); }}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="בחר מדינה..." /></SelectTrigger>
                  <SelectContent>
                    {tripCountries.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => setManualCountry(true)} title="הזנה ידנית">
                  <Pencil size={14} />
                </Button>
              </div>
            ) : (
              <Input value={country} onChange={e => setCountry(e.target.value)} placeholder="France" />
            )}
          </div>

          {/* City selector */}
          <div className="space-y-2">
            <Label>City</Label>
            <CitySelector
              countries={citySelectorCountries}
              value={city}
              onChange={setCity}
              placeholder="בחר עיר..."
              extraHierarchy={state.tripSitesHierarchy}
            />
          </div>

          <div className="space-y-2">
            <Label>Address</Label>
            <Input value={address} onChange={e => setAddress(e.target.value)} placeholder="5 Avenue Anatole" />
          </div>

          <div className="space-y-2">
            <Label>עלות</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="col-span-2" />
              <Select value={costCurrency} onValueChange={setCostCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'].map(c => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="poi-is-paid">שולם?</Label>
            <Switch id="poi-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional notes..." />
          </div>

          <Button type="submit" className="w-full">Add POI</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
