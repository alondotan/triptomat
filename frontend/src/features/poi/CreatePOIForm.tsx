import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { usePOI } from '@/features/poi/POIContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { LocationSelector } from '@/shared/components/LocationSelector';
import { SubCategorySelector } from '@/shared/components/SubCategorySelector';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/shared/hooks/use-toast';
import { createPOISchema } from '@/schemas/poi.schema';
import type { PointOfInterest, POICategory, POIStatus } from '@/types/trip';
import { getPOICategories, getCategoryLabel } from '@/shared/lib/subCategoryConfig';

const CURRENCIES = ['ILS', 'USD', 'EUR', 'GBP', 'PHP', 'THB', 'JPY', 'AUD', 'CAD', 'CHF', 'NZD', 'SGD', 'HKD', 'TWD', 'MYR', 'IDR', 'VND', 'KRW', 'INR', 'TRY', 'EGP', 'GEL', 'CZK', 'HUF', 'PLN', 'RON', 'BGN', 'SEK', 'NOK', 'DKK', 'ISK', 'MXN', 'BRL', 'ZAR', 'AED', 'SAR', 'CNY', 'QAR', 'KWD', 'JOD'];

interface CreatePOIFormProps {
  /** Controlled mode: when provided, hides the trigger button and uses external state */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
  /** Pre-fill the category (e.g. 'accommodation') */
  initialCategory?: POICategory;
  /** Edit mode: when provided, the form edits an existing POI instead of creating a new one */
  editPoi?: PointOfInterest;
}

export function CreatePOIForm({ open: openProp, onOpenChange, initialCategory, editPoi }: CreatePOIFormProps = {}) {
  const { t } = useTranslation();
  const isControlled = openProp !== undefined;
  const isEditMode = !!editPoi;
  const { activeTrip } = useActiveTrip();
  const { addPOI, updatePOI, deletePOI } = usePOI();
  const { toast } = useToast();
  const [openInternal, setOpenInternal] = useState(false);
  const open = isControlled ? openProp! : openInternal;
  const setOpen = (v: boolean) => { if (isControlled) { onOpenChange?.(v); } else { setOpenInternal(v); } };

  const tripCountries = activeTrip?.countries || [];
  const defaultCountry = tripCountries.length === 1 ? tripCountries[0] : '';

  const getDefaults = () => ({
    name: editPoi?.name || '',
    category: editPoi?.category || initialCategory || 'attraction' as POICategory,
    subCategory: editPoi?.subCategory || '',
    city: editPoi?.location.city || '',
    country: editPoi?.location.country || defaultCountry,
    address: editPoi?.location.address || '',
    costAmount: editPoi?.details.cost?.amount?.toString() || '',
    costCurrency: editPoi?.details.cost?.currency || activeTrip?.currency || 'ILS',
    isPaid: editPoi?.isPaid || false,
    notes: editPoi?.details.notes?.user_summary || '',
  });

  const [name, setName] = useState('');
  const [category, setCategory] = useState<POICategory>(initialCategory || 'attraction');
  const [subCategory, setSubCategory] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState(defaultCountry);
  const [manualCountry, setManualCountry] = useState(false);
  const [address, setAddress] = useState('');
  const [costAmount, setCostAmount] = useState('');
  const [costCurrency, setCostCurrency] = useState(activeTrip?.currency || 'ILS');
  const [isPaid, setIsPaid] = useState(false);
  const [notes, setNotes] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const resetForm = () => {
    const d = getDefaults();
    setName(d.name);
    setCategory(d.category);
    setSubCategory(d.subCategory);
    setCity(d.city);
    setCountry(d.country);
    setManualCountry(false);
    setAddress(d.address);
    setCostAmount(d.costAmount);
    setCostCurrency(d.costCurrency);
    setIsPaid(d.isPaid);
    setNotes(d.notes);
  };

  // Reset form whenever dialog opens or editPoi changes
  useEffect(() => {
    if (open) resetForm();
  }, [open, editPoi?.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTrip) return;

    const status: POIStatus = editPoi?.status || 'suggested';

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

    if (isEditMode && editPoi) {
      await updatePOI({
        ...editPoi,
        name: name.trim(),
        category,
        subCategory: subCategory || undefined,
        isPaid,
        location: {
          ...editPoi.location,
          city: city || undefined,
          country: country || undefined,
          address: address || undefined,
        },
        details: {
          ...editPoi.details,
          cost: costAmount ? { amount: parseFloat(costAmount), currency: costCurrency } : editPoi.details.cost,
          notes: notes ? { ...editPoi.details.notes, user_summary: notes } : editPoi.details.notes,
        },
      });
    } else {
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
    }

    setOpen(false);
  };

  const handleDelete = async () => {
    if (editPoi) {
      await deletePOI(editPoi.id);
      setOpen(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button className="gap-1"><Plus size={16} /> {t('createPOI.newPOI')}</Button>
        </DialogTrigger>
      )}
      <DialogContent preventAutoFocus className="max-w-md max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0 max-sm:translate-y-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 !flex !flex-col overflow-hidden">
        <DialogHeader className="shrink-0"><DialogTitle>{isEditMode ? t('createPOI.editTitle') : t('createPOI.title')}</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-5 flex-1 min-h-0 overflow-y-auto max-sm:pb-4">
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
                    {CURRENCIES.map(c => (
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

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">{isEditMode ? t('common.save') : t('createPOI.addPOI')}</Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            {isEditMode && (
              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <Button type="button" variant="outline" size="icon" className="shrink-0 text-destructive border-destructive/30 hover:text-destructive hover:bg-destructive/10">
                    <Trash2 size={16} />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('poiDetail.deleteConfirm', { name: editPoi?.name })}</AlertDialogTitle>
                    <AlertDialogDescription>{t('poiDetail.cannotUndo')}</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('common.delete')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
