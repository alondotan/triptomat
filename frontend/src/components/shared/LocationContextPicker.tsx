import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LocationSelector } from './LocationSelector';

interface LocationContextPickerProps {
  countries: string[];
  value: string;
  onChange: (value: string) => void;
  daysForward: number;
  onDaysForwardChange: (n: number) => void;
  maxDaysForward: number;
  onSave: () => void;
  onCancel: () => void;
  extraHierarchy?: import('@/hooks/useCountrySites').SiteNode[];
}

export function LocationContextPicker({
  countries, value, onChange, daysForward, onDaysForwardChange,
  maxDaysForward, onSave, onCancel, extraHierarchy,
}: LocationContextPickerProps) {
  return (
    <div className="space-y-2">
      <LocationSelector
        countries={countries}
        value={value}
        onChange={onChange}
        placeholder="בחר מיקום..."
        extraHierarchy={extraHierarchy}
      />
      <DaysForwardControl value={daysForward} onChange={onDaysForwardChange} max={maxDaysForward} />
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={!value}>שמור</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>ביטול</Button>
      </div>
    </div>
  );
}

function DaysForwardControl({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  if (max <= 0) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>החל גם על</span>
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="h-6 text-xs w-12 text-center"
      />
      <span>ימים קדימה</span>
    </div>
  );
}
