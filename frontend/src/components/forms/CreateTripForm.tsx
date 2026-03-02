import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useTripList } from '@/context/TripListContext';
import { CountrySelector } from '@/components/trip/CountrySelector';
import { Plus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { PlanningLevelPicker, type PlanningLevel } from '@/components/shared/PlanningLevelPicker';
import type { TripStatus } from '@/types/trip';

interface CreateTripFormProps {
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function CreateTripForm({ trigger, open: openProp, onOpenChange }: CreateTripFormProps) {
  const { createNewTrip } = useTripList();
  const { toast } = useToast();
  const [openInternal, setOpenInternal] = useState(false);
  const open = openProp !== undefined ? openProp : openInternal;
  const setOpen = (v: boolean) => { setOpenInternal(v); onOpenChange?.(v); };

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
      toast({ title: 'יש לבחור מצב תכנון', variant: 'destructive' });
      return;
    }
    if (!name.trim()) {
      toast({ title: 'יש להזין שם לטיול', variant: 'destructive' });
      return;
    }
    if (countries.length === 0) {
      toast({ title: 'יש לבחור לפחות מדינה אחת', variant: 'destructive' });
      return;
    }
    if (planningLevel === 'planning' && (!numberOfDays || numberOfDays < 1)) {
      toast({ title: 'יש להזין מספר ימים', variant: 'destructive' });
      return;
    }
    if (planningLevel === 'detailed_planning') {
      if (!startDate || !endDate) {
        toast({ title: 'יש להזין תאריך התחלה וסיום', variant: 'destructive' });
        return;
      }
      if (endDate < startDate) {
        toast({ title: 'תאריך סיום חייב להיות אחרי תאריך התחלה', variant: 'destructive' });
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
      <Plus size={18} />
      New Trip
    </Button>
  ) : null);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {triggerEl && <DialogTrigger asChild>{triggerEl}</DialogTrigger>}
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>טיול חדש</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Basic info */}
          <div className="space-y-2">
            <Label htmlFor="name">שם הטיול</Label>
            <Input
              id="name"
              placeholder="למשל: הרפתקה באירופה"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">תיאור (אופציונלי)</Label>
            <Textarea
              id="description"
              placeholder="שבוע בלונדון ופריז..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>מדינות</Label>
            <CountrySelector
              value={countries}
              onChange={setCountries}
              placeholder="בחר יעדים..."
            />
          </div>

          {/* Planning level selection */}
          <div className="space-y-2">
            <Label>באיזה שלב אתה?</Label>
            <PlanningLevelPicker value={planningLevel} onChange={setPlanningLevel} />
          </div>

          {/* Conditional fields based on planning level */}
          {planningLevel === 'planning' && (
            <div className="space-y-2">
              <Label htmlFor="numberOfDays">מספר ימים</Label>
              <Input
                id="numberOfDays"
                type="number"
                min={1}
                max={365}
                placeholder="7"
                value={numberOfDays}
                onChange={(e) => setNumberOfDays(e.target.value ? parseInt(e.target.value) : '')}
                required
              />
            </div>
          )}

          {planningLevel === 'detailed_planning' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startDate">תאריך התחלה</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">תאריך סיום</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  min={startDate}
                  required
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={isSubmitting || !planningLevel}>
              {isSubmitting ? 'יוצר...' : 'צור טיול'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
