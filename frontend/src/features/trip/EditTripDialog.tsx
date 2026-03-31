import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { useTripList } from '@/features/trip/TripListContext';
import { useToast } from '@/shared/hooks/use-toast';
import {
  transitionToDetailedPlanning,
  transitionToPlanning,
  transitionToResearch,
} from '@/features/trip/tripStatusTransition';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Trip } from '@/types/trip';

interface EditTripDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EditTripDialog({ open, onOpenChange }: EditTripDialogProps) {
  const { t } = useTranslation();
  const { activeTrip, updateCurrentTrip } = useActiveTrip();
  const { updateTripInList } = useTripList();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [numberOfDays, setNumberOfDays] = useState<number | ''>('');
  const [hasExactDates, setHasExactDates] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmClearDates, setConfirmClearDates] = useState(false);

  // Sync form state when dialog opens or trip changes
  useEffect(() => {
    if (open && activeTrip) {
      setName(activeTrip.name);
      const hasDates = !!(activeTrip.startDate && activeTrip.endDate);
      setHasExactDates(hasDates);
      setNumberOfDays(hasDates ? '' : (activeTrip.numberOfDays || ''));
      setStartDate(activeTrip.startDate || '');
      setEndDate(activeTrip.endDate || '');
    }
  }, [open, activeTrip]);

  if (!activeTrip) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: t('createTrip.mustEnterName'), variant: 'destructive' });
      return;
    }
    if (numberOfDays !== '' && Number(numberOfDays) < 1) {
      toast({ title: t('createTrip.mustEnterDays'), variant: 'destructive' });
      return;
    }
    if (hasExactDates) {
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
      const hadDates = !!(activeTrip.startDate && activeTrip.endDate);
      const hadDays = !!(activeTrip.numberOfDays && activeTrip.numberOfDays > 0);

      // Determine new status
      const newHasDates = hasExactDates && startDate && endDate;
      const newHasDays = !hasExactDates && numberOfDays !== '' && Number(numberOfDays) >= 1;

      let updates: Partial<Trip> = {};

      if (newHasDates) {
        // Upgrading to / staying at detailed_planning
        const days = Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
        if (!hadDates) {
          // Transition: create itinerary days if needed
          const tripWithDays = { ...activeTrip, numberOfDays: days };
          updates = await transitionToDetailedPlanning(tripWithDays, startDate);
        } else {
          // Already had dates — just update values
          if (startDate !== activeTrip.startDate) updates.startDate = startDate;
          if (endDate !== activeTrip.endDate) updates.endDate = endDate;
          if (days !== activeTrip.numberOfDays) updates.numberOfDays = days;
          updates.status = 'detailed_planning';
        }
      } else if (newHasDays) {
        // planning mode
        if (hadDates) {
          updates = await transitionToPlanning(activeTrip);
          updates.numberOfDays = Number(numberOfDays);
        } else {
          updates.status = 'planning';
          updates.numberOfDays = Number(numberOfDays);
          updates.startDate = undefined;
          updates.endDate = undefined;
        }
      } else {
        // No days, no dates → research
        if (hadDates || hadDays) {
          updates = await transitionToResearch(activeTrip);
        }
      }

      if (name.trim() !== activeTrip.name) updates.name = name.trim();

      if (Object.keys(updates).length > 0) {
        await updateCurrentTrip(updates);
        updateTripInList({ id: activeTrip.id, ...updates } as typeof activeTrip & { id: string });
      }

      onOpenChange(false);
    } catch {
      toast({ title: t('common.somethingWentWrong'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleDates = (checked: boolean) => {
    if (!checked && hasExactDates && (activeTrip.startDate || activeTrip.endDate)) {
      // Warn before clearing dates
      setConfirmClearDates(true);
    } else {
      setHasExactDates(checked);
      if (checked) setNumberOfDays('');
      else { setStartDate(''); setEndDate(''); }
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px]" preventAutoFocus>
          <DialogHeader>
            <DialogTitle>{t('editTrip.editTrip')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Trip name */}
            <div className="space-y-2">
              <Label htmlFor="editName">{t('editTrip.tripName')}</Label>
              <Input
                id="editName"
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="off"
              />
            </div>

            {/* Number of days (optional) */}
            <div className="space-y-2">
              <Label htmlFor="editDays">
                {t('editTrip.numberOfDays')} <span className="text-muted-foreground text-xs font-normal">({t('common.optional')})</span>
              </Label>
              <Input
                id="editDays"
                name="days"
                type="number"
                min={1}
                max={365}
                placeholder="7"
                value={numberOfDays}
                onChange={(e) => setNumberOfDays(e.target.value ? parseInt(e.target.value) : '')}
                autoComplete="off"
                disabled={hasExactDates}
              />
            </div>

            {/* Exact dates */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={hasExactDates}
                  onChange={(e) => handleToggleDates(e.target.checked)}
                  className="rounded border-border"
                />
                <span className="text-sm font-medium">{t('createTrip.haveExactDates')}</span>
              </label>

              {hasExactDates && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1.5">
                    <Label htmlFor="editStart" className="text-xs">{t('editTrip.startDate')}</Label>
                    <Input
                      id="editStart"
                      name="startDate"
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="editEnd" className="text-xs">{t('editTrip.endDate')}</Label>
                    <Input
                      id="editEnd"
                      name="endDate"
                      type="date"
                      value={endDate}
                      min={startDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSave} disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? t('editTrip.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm clearing exact dates */}
      <AlertDialog open={confirmClearDates} onOpenChange={setConfirmClearDates}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('editTrip.statusChange')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('editTrip.switchToPlanning')} {t('editTrip.continueQuestion')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setHasExactDates(false);
                setStartDate('');
                setEndDate('');
                setConfirmClearDates(false);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
