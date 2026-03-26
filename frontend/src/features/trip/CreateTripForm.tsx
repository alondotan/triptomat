import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useTripList } from '@/features/trip/TripListContext';
import { CountrySelector } from '@/features/trip/CountrySelector';
import { Plus } from 'lucide-react';
import { useToast } from '@/shared/hooks/use-toast';
import { PlanningLevelPicker, type PlanningLevel } from '@/shared/components/PlanningLevelPicker';
import type { TripStatus } from '@/types/trip';

interface CreateTripFormProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateTripForm({ trigger, open: openProp, onOpenChange }: CreateTripFormProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createNewTrip } = useTripList();
  const { toast } = useToast();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const setOpen = (v: boolean) => {
    setOpenInternal(v);
    onOpenChange?.(v);
    if (!v) resetForm();
  };

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [planningLevel, setPlanningLevel] = useState<PlanningLevel | null>(null);
  const [numberOfDays, setNumberOfDays] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!planningLevel) {
      toast({ title: t('createTrip.mustChoosePlanningMode'), variant: 'destructive' });
      return;
    }
    if (!name.trim()) {
      toast({ title: t('createTrip.mustEnterName'), variant: 'destructive' });
      return;
    }
    if (countries.length === 0) {
      toast({ title: t('createTrip.mustChooseCountry'), variant: 'destructive' });
      return;
    }
    if (planningLevel === 'planning' && (!numberOfDays || numberOfDays < 1)) {
      toast({ title: t('createTrip.mustEnterDays'), variant: 'destructive' });
      return;
    }
    if (planningLevel === 'detailed_planning') {
      if (!startDate || !endDate) {
        toast({ title: t('createTrip.mustEnterDates'), variant: 'destructive' });
        return;
      }
      if (endDate < startDate) {
        toast({ title: t('createTrip.endDateAfterStart'), variant: 'destructive' });
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const dayCount = planningLevel === 'detailed_planning' && startDate && endDate
        ? Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1
        : planningLevel === 'planning' && numberOfDays
          ? Number(numberOfDays)
          : undefined;

      await createNewTrip({
        name: name.trim(),
        description: description.trim() || undefined,
        countries,
        status: planningLevel as TripStatus,
        numberOfDays: dayCount,
        startDate: planningLevel === 'detailed_planning' ? startDate : undefined,
        endDate: planningLevel === 'detailed_planning' ? endDate : undefined,
      });
      setOpen(false);
      resetForm();
      navigate('/', { replace: true });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setName('');
    setDescription('');
    setCountries([]);
    setPlanningLevel(null);
    setNumberOfDays('');
    setStartDate('');
    setEndDate('');
  };

  const triggerEl = trigger || (openProp === undefined ? (
    <Button className="gap-2">
      <Plus size={18} aria-hidden="true" />
      {t('createTrip.newTrip')}
    </Button>
  ) : null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerEl && <DialogTrigger asChild>{triggerEl}</DialogTrigger>}
      <DialogContent className="sm:max-w-[750px] sm:max-h-[85dvh] max-sm:inset-0 max-sm:translate-x-0 max-sm:translate-y-0 max-sm:max-w-none max-sm:h-[100dvh] max-sm:max-h-none max-sm:rounded-none !flex flex-col overflow-hidden p-0" preventAutoFocus>
        <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-6 pb-0 shrink-0">
          <DialogTitle>{t('createTrip.newTrip')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Right column (RTL) - Name & Description */}
              <div className="space-y-3">
                <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2">
                  <Label htmlFor="name">{t('createTrip.tripName')}</Label>
                  <Input
                    id="name"
                    placeholder={t('createTrip.tripNamePlaceholder')}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoComplete="off"
                  />
                </div>

                <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2 flex-1">
                  <Label htmlFor="description">{t('createTrip.description')}</Label>
                  <Textarea
                    id="description"
                    placeholder={t('createTrip.descriptionPlaceholder')}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    autoComplete="off"
                    className="min-h-[120px] resize-none"
                  />
                </div>
              </div>

              {/* Left column (RTL) - Countries & Planning */}
              <div className="space-y-3">
                <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2">
                  <Label htmlFor="trip-countries">{t('createTrip.countries')}</Label>
                  <CountrySelector
                    value={countries}
                    onChange={setCountries}
                    placeholder={t('createTrip.chooseDestinations')}
                  />
                </div>

                <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2">
                  <Label htmlFor="trip-planning-level">{t('createTrip.planningStage')}</Label>
                  <PlanningLevelPicker value={planningLevel} onChange={setPlanningLevel} compact />
                </div>

                {planningLevel === 'planning' && (
                  <div className="rounded-lg border border-border/50 bg-card/50 p-3 space-y-2">
                    <Label htmlFor="numberOfDays">{t('createTrip.numberOfDays')}</Label>
                    <Input
                      id="numberOfDays"
                      type="number"
                      min={1}
                      max={365}
                      placeholder="7"
                      value={numberOfDays}
                      onChange={(e) => setNumberOfDays(e.target.value ? parseInt(e.target.value) : '')}
                      required
                      autoComplete="off"
                    />
                  </div>
                )}

                {planningLevel === 'detailed_planning' && (
                  <div className="rounded-lg border border-border/50 bg-card/50 p-3 grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="startDate">{t('createTrip.startDate')}</Label>
                      <Input
                        id="startDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        required
                        autoComplete="off"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="endDate">{t('createTrip.endDate')}</Label>
                      <Input
                        id="endDate"
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        min={startDate}
                        required
                        autoComplete="off"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 px-4 sm:px-6 py-3 border-t shrink-0 mt-auto">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={isSubmitting || !planningLevel}>
              {isSubmitting ? t('createTrip.creating') : t('createTrip.createTrip')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
