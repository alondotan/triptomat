import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { useToast } from '@/hooks/use-toast';
import { Search, CalendarDays, Calendar, ArrowRight, AlertTriangle } from 'lucide-react';
import type { TripStatus } from '@/types/trip';
import { useTripList } from '@/context/TripListContext';
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

interface TripStatusDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STATUS_INFO: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  research: { label: 'מחקר', icon: <Search size={16} />, color: 'bg-amber-100 text-amber-800' },
  planning: { label: 'תכנון', icon: <CalendarDays size={16} />, color: 'bg-blue-100 text-blue-800' },
  detailed_planning: { label: 'תכנון מפורט', icon: <Calendar size={16} />, color: 'bg-green-100 text-green-800' },
};

export function TripStatusDialog({ open, onOpenChange }: TripStatusDialogProps) {
  const { activeTrip, updateCurrentTrip } = useActiveTrip();
  const { updateTripInList } = useTripList();
  const { toast } = useToast();
  const [numberOfDays, setNumberOfDays] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [confirmDowngrade, setConfirmDowngrade] = useState<TripStatus | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!activeTrip) return null;

  const currentStatus = activeTrip.status;

  const handleTransition = async (target: TripStatus) => {
    // Downgrade transitions require confirmation
    if (
      (target === 'research' && currentStatus !== 'research') ||
      (target === 'planning' && currentStatus === 'detailed_planning')
    ) {
      setConfirmDowngrade(target);
      return;
    }
    await executeTransition(target);
  };

  const executeTransition = async (target: TripStatus) => {
    setIsSubmitting(true);
    try {
      let updates: Partial<typeof activeTrip> = {};

      if (target === 'research') {
        updates = await transitionToResearch(activeTrip);
      } else if (target === 'planning') {
        if (currentStatus === 'research') {
          if (!numberOfDays || Number(numberOfDays) < 1) {
            toast({ title: 'יש להזין מספר ימים', variant: 'destructive' });
            setIsSubmitting(false);
            return;
          }
          await updateCurrentTrip({
            status: 'planning',
            numberOfDays: Number(numberOfDays),
          });
          updates = { status: 'planning', numberOfDays: Number(numberOfDays) };
        } else if (currentStatus === 'detailed_planning') {
          updates = await transitionToPlanning(activeTrip);
        }
      } else if (target === 'detailed_planning') {
        if (!startDate) {
          toast({ title: 'יש להזין תאריך התחלה', variant: 'destructive' });
          setIsSubmitting(false);
          return;
        }
        // For research→detailed_planning, set numberOfDays first
        if (currentStatus === 'research') {
          const days = Number(numberOfDays) || 7;
          const tripWithDays = { ...activeTrip, numberOfDays: days };
          updates = await transitionToDetailedPlanning(tripWithDays, startDate);
        } else {
          updates = await transitionToDetailedPlanning(activeTrip, startDate);
        }
      }

      // Update local state
      if (updates && activeTrip) {
        updateTripInList({ id: activeTrip.id, ...updates } as typeof activeTrip & { id: string });
      }

      toast({ title: 'סטטוס הטיול עודכן' });
      onOpenChange(false);
      setNumberOfDays('');
      setStartDate('');
    } catch {
      toast({ title: 'שגיאה בעדכון הסטטוס', variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
      setConfirmDowngrade(null);
    }
  };

  // Build available transitions
  const transitions: { target: TripStatus; label: string; needsInput: 'days' | 'date' | null; warning?: string }[] = [];

  if (currentStatus === 'research') {
    transitions.push({ target: 'planning', label: 'עבור לתכנון', needsInput: 'days' });
    transitions.push({ target: 'detailed_planning', label: 'עבור לתכנון מפורט', needsInput: 'date' });
  } else if (currentStatus === 'planning') {
    transitions.push({ target: 'detailed_planning', label: 'עבור לתכנון מפורט', needsInput: 'date' });
    transitions.push({ target: 'research', label: 'חזור למחקר', needsInput: null, warning: 'כל שיבוץ הימים יימחק' });
  } else if (currentStatus === 'detailed_planning') {
    transitions.push({ target: 'planning', label: 'חזור לתכנון (ללא תאריכים)', needsInput: null, warning: 'התאריכים יוסרו, מספר הימים יישמר' });
    transitions.push({ target: 'research', label: 'חזור למחקר', needsInput: null, warning: 'כל התאריכים ושיבוץ הימים יימחקו' });
  }

  const currentInfo = STATUS_INFO[currentStatus] || STATUS_INFO.research;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>מצב הטיול</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Current status */}
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted">
              <span>מצב נוכחי:</span>
              <Badge className={currentInfo.color}>
                {currentInfo.icon}
                <span className="mr-1">{currentInfo.label}</span>
              </Badge>
              {activeTrip.numberOfDays && (
                <span className="text-sm text-muted-foreground">({activeTrip.numberOfDays} ימים)</span>
              )}
            </div>

            {/* Transitions */}
            <div className="space-y-3">
              {transitions.map((t) => (
                <div key={t.target} className="space-y-2 p-3 rounded-lg border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ArrowRight size={14} className="text-muted-foreground" />
                      <span className="text-sm font-medium">{t.label}</span>
                    </div>
                    {t.warning && (
                      <span className="text-xs text-amber-600 flex items-center gap-1">
                        <AlertTriangle size={12} />
                        {t.warning}
                      </span>
                    )}
                  </div>

                  {t.needsInput === 'days' && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="transitionDays" className="text-xs shrink-0">מספר ימים:</Label>
                      <Input
                        id="transitionDays"
                        type="number"
                        min={1}
                        max={365}
                        placeholder="7"
                        value={numberOfDays}
                        onChange={(e) => setNumberOfDays(e.target.value ? parseInt(e.target.value) : '')}
                        className="h-8 w-24"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleTransition(t.target)}
                        disabled={isSubmitting || !numberOfDays}
                      >
                        אישור
                      </Button>
                    </div>
                  )}

                  {t.needsInput === 'date' && (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="transitionDate" className="text-xs shrink-0">תאריך התחלה:</Label>
                      <Input
                        id="transitionDate"
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-8 w-40"
                      />
                      {currentStatus === 'research' && (
                        <>
                          <Label htmlFor="transitionDays2" className="text-xs shrink-0">ימים:</Label>
                          <Input
                            id="transitionDays2"
                            type="number"
                            min={1}
                            max={365}
                            placeholder="7"
                            value={numberOfDays}
                            onChange={(e) => setNumberOfDays(e.target.value ? parseInt(e.target.value) : '')}
                            className="h-8 w-20"
                          />
                        </>
                      )}
                      <Button
                        size="sm"
                        onClick={() => handleTransition(t.target)}
                        disabled={isSubmitting || !startDate || (currentStatus === 'research' && !numberOfDays)}
                      >
                        אישור
                      </Button>
                    </div>
                  )}

                  {t.needsInput === null && (
                    <Button
                      size="sm"
                      variant={t.warning ? 'outline' : 'default'}
                      onClick={() => handleTransition(t.target)}
                      disabled={isSubmitting}
                    >
                      {t.label}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation for downgrade */}
      <AlertDialog open={!!confirmDowngrade} onOpenChange={() => setConfirmDowngrade(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>שינוי מצב טיול</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDowngrade === 'research'
                ? 'מעבר למצב מחקר ימחק את כל שיבוצי הימים והתאריכים. פעולה זו אינה הפיכה. להמשיך?'
                : 'מעבר לתכנון יסיר את התאריכים המדויקים. מספר הימים יישמר. להמשיך?'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmDowngrade && executeTransition(confirmDowngrade)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              אישור
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
