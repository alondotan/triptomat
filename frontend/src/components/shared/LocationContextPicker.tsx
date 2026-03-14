import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { LocationSelector } from './LocationSelector';

interface LocationContextPickerProps {
  value: string;
  onChange: (value: string) => void;
  daysForward: number;
  onDaysForwardChange: (n: number) => void;
  maxDaysForward: number;
  onSave: () => void;
  onCancel: () => void;
}

export function LocationContextPicker({
  value, onChange, daysForward, onDaysForwardChange,
  maxDaysForward, onSave, onCancel,
}: LocationContextPickerProps) {
  return (
    <div className="space-y-2">
      <LocationSelector
        value={value}
        onChange={onChange}
        placeholder="Choose location..."
      />
      <DaysForwardControl value={daysForward} onChange={onDaysForwardChange} max={maxDaysForward} />
      <div className="flex gap-2">
        <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={!value}>Save</Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  );
}

function DaysForwardControl({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  if (max <= 0) return null;
  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>Apply also to</span>
      <Input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(0, parseInt(e.target.value) || 0))}
        className="h-6 text-xs w-12 text-center"
        aria-label="Number of days"
        name="days"
      />
      <span>days forward</span>
    </div>
  );
}
