import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useActiveTrip } from '@/context/ActiveTripContext';

interface TripDaySelectProps {
  value: number | '';
  onChange: (dayNum: number | '') => void;
  placeholder?: string;
  className?: string;
}

export function TripDaySelect({ value, onChange, placeholder = 'Choose day...', className }: TripDaySelectProps) {
  const { activeTrip } = useActiveTrip();
  const numDays = activeTrip?.numberOfDays || 0;

  if (numDays === 0) return null;

  return (
    <Select
      value={value ? String(value) : ''}
      onValueChange={(v) => onChange(v ? parseInt(v) : '')}
      aria-label="Choose day"
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {Array.from({ length: numDays }, (_, i) => i + 1).map((day) => (
          <SelectItem key={day} value={String(day)}>
            Day {day}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
