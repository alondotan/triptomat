import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { useCountrySites, type FlatSite } from '@/hooks/useCountrySites';

export const TYPE_LABELS: Record<string, string> = {
  city: 'עיר',
  town: 'עיירה',
  state: 'מדינה/מחוז',
  neighborhood: 'שכונה',
  historicDistrict: 'רובע היסטורי',
  island: 'אי',
  region: 'אזור',
  archipelago: 'ארכיפלג',
  waterfall: 'מפל',
  nationalPark: 'פארק לאומי',
  resort: 'ריזורט',
  village: 'כפר',
  district: 'מחוז',
  beach: 'חוף',
  province: 'פרובינציה',
  peninsula: 'חצי אי',
  valley: 'עמק',
  desert: 'מדבר',
  lake: 'אגם',
  volcano: 'הר געש',
  mountain: 'הר',
  municipality: 'עירייה',
};

interface LocationSelectorProps {
  countries: string[];
  value: string;
  onChange: (location: string) => void;
  placeholder?: string;
  className?: string;
  extraHierarchy?: import('@/hooks/useCountrySites').SiteNode[];
}

export function LocationSelector({ countries, value, onChange, placeholder = 'בחר מיקום...', className, extraHierarchy }: LocationSelectorProps) {
  const { sites, loading } = useCountrySites(countries, extraHierarchy);
  const [open, setOpen] = useState(false);
  const [manualMode, setManualMode] = useState(false);

  const options = useMemo(() => {
    const seen = new Set<string>();
    return sites.filter(s => {
      if (seen.has(s.label)) return false;
      seen.add(s.label);
      return true;
    });
  }, [sites]);

  const grouped = useMemo(() => {
    const groups: Record<string, FlatSite[]> = {};
    for (const site of options) {
      const country = site.path[0] || 'Other';
      if (!groups[country]) groups[country] = [];
      groups[country].push(site);
    }
    return Object.entries(groups);
  }, [options]);

  if (manualMode) {
    return (
      <div className={cn('flex gap-1', className)}>
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="הזן מיקום ידנית..."
          className="flex-1"
        />
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setManualMode(false)}>
          רשימה
        </Button>
      </div>
    );
  }

  return (
    <div className={cn('flex gap-1', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="flex-1 justify-between font-normal"
          >
            {value ? (
              <span className="truncate">{value}</span>
            ) : (
              <span className="text-muted-foreground">{loading ? 'טוען...' : placeholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0 z-50" align="start">
          <Command>
            <CommandInput placeholder="חפש מיקום..." />
            <CommandList>
              <CommandEmpty>לא נמצא. נסה הזנה ידנית.</CommandEmpty>
              {grouped.map(([country, sites]) => (
                <CommandGroup key={country} heading={country}>
                  {sites.map((site) => (
                    <CommandItem
                      key={site.label + site.path.join('/')}
                      value={site.label}
                      onSelect={() => { onChange(site.label); setOpen(false); }}
                    >
                      <Check className={cn('mr-2 h-4 w-4', value === site.label ? 'opacity-100' : 'opacity-0')} />
                      <span style={{ paddingRight: `${Math.max(0, (site.depth - 1)) * 12}px` }}>
                        {site.label}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {TYPE_LABELS[site.siteType] || site.siteType}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="ghost" size="icon" className="shrink-0 h-9 w-9" onClick={() => setManualMode(true)} title="הזנה ידנית">
        <Pencil size={14} />
      </Button>
    </div>
  );
}
