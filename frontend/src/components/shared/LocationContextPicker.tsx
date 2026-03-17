import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LocationSelector } from './LocationSelector';

interface LocationContextPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onChange: (value: string) => void;
  totalDays: number;
  onTotalDaysChange: (n: number) => void;
  maxTotalDays: number;
  onSave: () => void;
}

export function LocationContextPicker({
  open, onOpenChange, value, onChange, totalDays, onTotalDaysChange,
  maxTotalDays, onSave,
}: LocationContextPickerProps) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs max-sm:top-[30%] max-sm:translate-y-[-30%] max-sm:slide-in-from-top-[28%]" preventAutoFocus>
        <DialogHeader>
          <DialogTitle className="text-sm">{t('timeline.setLocation')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <LocationSelector
            value={value}
            onChange={onChange}
            placeholder={t('locationSelector.chooseLocation')}
          />
          <TotalDaysControl value={totalDays} onChange={onTotalDaysChange} max={maxTotalDays} />
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-xs" onClick={onSave} disabled={!value}>{t('common.save')}</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TotalDaysControl({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const { t } = useTranslation();
  if (max <= 1) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span>{t('timeline.totalDays')}</span>
      <Input
        type="number"
        min={1}
        max={max}
        value={value}
        onChange={e => onChange(Math.max(1, Math.min(max, parseInt(e.target.value) || 1)))}
        className="h-6 text-xs w-12 text-center"
        aria-label={t('timeline.totalDays')}
        name="total-days"
      />
    </div>
  );
}
