import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { usePOI } from '@/context/POIContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { LocationSelector } from '@/components/shared/LocationSelector';
import { SubCategorySelector } from '@/components/shared/SubCategorySelector';
import { useToast } from '@/hooks/use-toast';
import { createPOISchema } from '@/schemas/poi.schema';
import type { POICategory, POIStatus } from '@/types/trip';
import { getPOICategories, getCategoryLabel } from '@/lib/subCategoryConfig';

export function CreatePOIForm() {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { addPOI } = usePOI();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<POICategory>('attraction');
  const [subCategory, setSubCategory] = useState('');
  const status: POIStatus = 'suggested';
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');
  const [manualCountry, setManualCountry] = useState(false);
  const [address, setAddress] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState(activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(false);
  const [notes, setNotes] = useState('');

  const tripCountries = activeTrip?.countries || [];

  const resetForm = () => {
    setName('');
    setCategory('attraction');
    setSubCategory('');
    setCity('');
    setCountry('');
    setManualCountry(false);
    setAddress('');
    setCostAmount('');
    setCostCurrency(activeTrip?.currency || 'ILS');
    setIsPaid(false);
    setNotes('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;

    const result = createPOISchema.safeParse({
      name: name.trim(),
      category,
      status,
      subCategory: subCategory || undefined,
      country: country || undefined,
      city: city || undefined,
      address: address || undefined,
      costAmount: costAmount ? parseFloat(costAmount) : undefined,
      costCurrency: costCurrency || undefined,
      notes: notes || undefined,
    });
    if (!result.success) {
      toast({ title: "Validation error", description: result.error.issues[0].message, variant: "destructive" });
      return;
    }

    await addPOI({
      tripId: activeTrip.id,
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

  // Countries to pass to LocationSelector: use selected country if from trip, otherwise trip countries
  const citySelectorCountries = country && tripCountries.includes(country) ? [country] : tripCountries;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-1"><Plus size={16} /> {t('createPOI.newPOI')}</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t('createPOI.title')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Basic Info */}
          <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('createPOI.basicInfo')}</span>
            <div className="space-y-2">
              <Label htmlFor="poi-name">{t('createPOI.name')}</Label>
              <Input id="poi-name" name="name" value={name} onChange={e => setName(e.target.value)} required placeholder={t('createPOI.namePlaceholder')} autoComplete="off" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>{t('createPOI.category')}</Label>
                <Select value={category} onValueChange={v => setCategory(v as POICategory)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {getPOICategories().map(c => (
                      <SelectItem key={c} value={c}>{getCategoryLabel(c)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('createPOI.subCategory')}</Label>
              <SubCategorySelector categoryFilter={category} value={subCategory} onChange={setSubCategory} placeholder={t('createPOI.chooseSubCategory')} />
            </div>
          </div>

          {/* Location */}
          <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('createPOI.location')}</span>
            <div className="space-y-2">
              <Label htmlFor="poi-country">{t('createPOI.country')}</Label>
              {manualCountry ? (
                <div className="flex gap-1">
                  <Input id="poi-country" name="country" value={country} onChange={e => setCountry(e.target.value)} placeholder={t('createPOI.enterCountryManually')} className="flex-1" autoComplete="off" />
                  <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setManualCountry(false)}>
                    {t('createPOI.list')}
                  </Button>
                </div>
              ) : tripCountries.length > 0 ? (
                <div className="flex gap-1">
                  <Select value={country} onValueChange={v => { setCountry(v); setCity(''); }}>
                    <SelectTrigger className="flex-1"><SelectValue placeholder={t('createPOI.chooseCountry')} /></SelectTrigger>
                    <SelectContent>
                      {tripCountries.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => setManualCountry(true)} title={t('createPOI.enterCountryManually')} aria-label={t('createPOI.editCountry')}>
                    <Pencil size={14} />
                  </Button>
                </div>
              ) : (
                <Input id="poi-country" name="country" value={country} onChange={e => setCountry(e.target.value)} placeholder="France" autoComplete="off" />
              )}
            </div>
            <div className="space-y-2">
              <Label>{t('createPOI.location')}</Label>
              <LocationSelector
                value={city}
                onChange={setCity}
                placeholder={t('createPOI.chooseLocation')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="poi-address">{t('createPOI.address')}</Label>
              <Input id="poi-address" name="address" value={address} onChange={e => setAddress(e.target.value)} placeholder={t('createPOI.addressPlaceholder')} autoComplete="off" />
            </div>
          </div>

          {/* Cost & Payment */}
          <div className="rounded-xl bg-secondary/40 p-4 space-y-3">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t('createPOI.cost')}</span>
            <div className="space-y-2">
              <Label htmlFor="poi-cost">{t('createPOI.cost')}</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input id="poi-cost" name="cost" type="number" min="0" step="0.01" value={costAmount} onChange={e => setCostAmount(e.target.value)} placeholder="0.00" className="col-span-2" autoComplete="off" />
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
            <div className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2.5">
              <Label htmlFor="poi-is-paid">{t('createPOI.paid')}</Label>
              <Switch id="poi-is-paid" checked={isPaid} onCheckedChange={setIsPaid} />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="poi-notes">{t('createPOI.notes')}</Label>
            <Textarea id="poi-notes" name="notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('createPOI.notesPlaceholder')} autoComplete="off" />
          </div>

          <Button type="submit" className="w-full">{t('createPOI.addPOI')}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
