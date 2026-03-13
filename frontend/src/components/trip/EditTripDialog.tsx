import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useTripList } from '@/context/TripListContext';
import { useToast } from '@/hooks/use-toast';
import { PlanningLevelPicker, type PlanningLevel } from '@/components/shared/PlanningLevelPicker';
import {
  transitionToDetailedPlanning,
  transitionToPlanning,
  transitionToResearch,
} from '@/services/tripStatusTransition';
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
  const [planningLevel, setPlanningLevel] = useState<PlanningLevel>('research');
  const [numberOfDays, setNumberOfDays] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDowngrade, setConfirmDowngrade] = useState<PlanningLevel | null>(null);

  // Sync form state when dialog opens or trip changes
  useEffect(() => {
    if (open && activeTrip) {
      setName(activeTrip.name);
      const level = (['research', 'planning', 'detailed_planning'].includes(activeTrip.status)
        ? activeTrip.status
        : 'detailed_planning') as PlanningLevel;
      setPlanningLevel(level);
      setNumberOfDays(activeTrip.numberOfDays || '');
      setStartDate(activeTrip.startDate || '');
      setEndDate(activeTrip.endDate || '');
    }
  }, [open, activeTrip]);

  if (!activeTrip) return null;

  const originalStatus = activeTrip.status as string;

  const isDowngrade = (target: PlanningLevel): boolean => {
    if (target === 'research' && originalStatus !== 'research') return true;
    if (target === 'planning' && originalStatus === 'detailed_planning') return true;
    return false;
  };

  const downgradeWarning = (target: PlanningLevel): string => {
    if (target === 'research') return t('editTrip.switchToResearch');
    if (target === 'planning') return t('editTrip.switchToPlanning');
    return '';
  };

  const handleLevelChange = (level: PlanningLevel) => {
    if (isDowngrade(level)) {
      setConfirmDowngrade(level);
    } else {
      setPlanningLevel(level);
    }
  };

  const handleConfirmDowngrade = () => {
    if (confirmDowngrade) {
      setPlanningLevel(confirmDowngrade);
      setConfirmDowngrade(null);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: t('createTrip.mustEnterName'), variant: 'destructive' });
      return;
    }
    if (planningLevel === 'planning' && (!numberOfDays || Number(numberOfDays) < 1)) {
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
      const statusChanged = planningLevel !== originalStatus;

      if (statusChanged) {
        // Handle status transition with data migration
        let updates: Partial<Trip> = {};

        if (planningLevel === 'research') {
          updates = await transitionToResearch(activeTrip);
        } else if (planningLevel === 'planning') {
          if (originalStatus === 'detailed_planning') {
            updates = await transitionToPlanning(activeTrip);
          } else {
            // research → planning
            updates = {
              status: 'planning',
              numberOfDays: Number(numberOfDays),
              startDate: undefined,
              endDate: undefined,
            };
            await updateCurrentTrip(updates);
          }
        } else if (planningLevel === 'detailed_planning') {
          const days = Number(numberOfDays) ||
            Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const tripWithDays = { ...activeTrip, numberOfDays: days };
          updates = await transitionToDetailedPlanning(tripWithDays, startDate);
        }

        // Update name if changed
        if (name.trim() !== activeTrip.name) {
          updates.name = name.trim();
          await updateCurrentTrip({ name: name.trim() });
        }

        // Sync local state
        if (updates && activeTrip) {
          updateTripInList({ id: activeTrip.id, ...updates } as typeof activeTrip & { id: string });
        }
      } else {
        // No status change — just update fields
        const updates: Partial<Trip> = {};
        if (name.trim() !== activeTrip.name) updates.name = name.trim();

        if (planningLevel === 'planning' && Number(numberOfDays) !== activeTrip.numberOfDays) {
          updates.numberOfDays = Number(numberOfDays);
        }
        if (planningLevel === 'detailed_planning') {
          if (startDate !== activeTrip.startDate) updates.startDate = startDate;
          if (endDate !== activeTrip.endDate) updates.endDate = endDate;
          const days = Math.floor((new Date(endDate).getTime() - new Date(startDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
          if (days !== activeTrip.numberOfDays) updates.numberOfDays = days;
        }

        if (Object.keys(updates).length > 0) {
          await updateCurrentTrip(updates);
        }
      }

      onOpenChange(false);
    } catch {
      toast({ title: t('common.somethingWentWrong'), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
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

            {/* Planning level */}
            <div className="space-y-2">
              <Label htmlFor="editPlanningLevel">{t('editTrip.planningStage')}</Label>
              <PlanningLevelPicker value={planningLevel} onChange={handleLevelChange} />
            </div>

            {/* Conditional fields */}
            {planningLevel === 'planning' && (
              <div className="space-y-2">
                <Label htmlFor="editDays">{t('editTrip.numberOfDays')}</Label>
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
                />
              </div>
            )}

            {planningLevel === 'detailed_planning' && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="editStart">{t('editTrip.startDate')}</Label>
                  <Input
                    id="editStart"
                    name="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="editEnd">{t('editTrip.endDate')}</Label>
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

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
              <Button onClick={handleSave} disabled={isSubmitting || !name.trim()}>
                {isSubmitting ? t('editTrip.saving') : t('common.save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation for downgrade */}
      <AlertDialog open={!!confirmDowngrade} onOpenChange={() => setConfirmDowngrade(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('editTrip.statusChange')}</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDowngrade && downgradeWarning(confirmDowngrade)} {t('editTrip.continueQuestion')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDowngrade}
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
