import { Search, CalendarDays, Calendar } from 'lucide-react';

export type PlanningLevel = 'research' | 'planning' | 'detailed_planning';

const options: { value: PlanningLevel; icon: React.ReactNode; title: string; desc: string }[] = [
  { value: 'research', icon: <Search size={20} aria-hidden="true" />, title: 'מחקר', desc: 'אוסף מידע על יעד, בלי תאריכים' },
  { value: 'planning', icon: <CalendarDays size={20} aria-hidden="true" />, title: 'תכנון', desc: 'יודע כמה ימים, בלי תאריכים מדויקים' },
  { value: 'detailed_planning', icon: <Calendar size={20} aria-hidden="true" />, title: 'תכנון מפורט', desc: 'יש תאריכים מדויקים' },
];

interface PlanningLevelPickerProps {
  value: PlanningLevel | null;
  onChange: (level: PlanningLevel) => void;
}

export function PlanningLevelPicker({ value, onChange }: PlanningLevelPickerProps) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
          className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors text-center ${
            value === opt.value
              ? 'border-primary bg-primary/10'
              : 'border-border hover:border-primary/40'
          }`}
        >
          <span className={value === opt.value ? 'text-primary' : 'text-muted-foreground'}>
            {opt.icon}
          </span>
          <span className="text-xs font-medium">{opt.title}</span>
          <span className="text-[10px] text-muted-foreground leading-tight">{opt.desc}</span>
        </button>
      ))}
    </div>
  );
}
