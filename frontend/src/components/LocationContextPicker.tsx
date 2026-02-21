import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useCountrySites, FlatSite } from '@/hooks/useCountrySites';
import { ChevronRight, MapPin, Search, PenLine } from 'lucide-react';

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

const TYPE_LABELS: Record<string, string> = {
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

export function LocationContextPicker({
  countries, value, onChange, daysForward, onDaysForwardChange,
  maxDaysForward, onSave, onCancel, extraHierarchy,
}: LocationContextPickerProps) {
  const { sites, loading } = useCountrySites(countries, extraHierarchy);
  const [search, setSearch] = useState('');
  const [manualMode, setManualMode] = useState(false);

  const filtered = useMemo(() => {
    if (!search) return sites;
    const lower = search.toLowerCase();
    return sites.filter(s => s.label.toLowerCase().includes(lower) || s.path.some(p => p.toLowerCase().includes(lower)));
  }, [sites, search]);

  // Group by country (first element of path)
  const grouped = useMemo(() => {
    const groups: Record<string, FlatSite[]> = {};
    for (const site of filtered) {
      const country = site.path[0];
      if (!groups[country]) groups[country] = [];
      groups[country].push(site);
    }
    return groups;
  }, [filtered]);

  const handleSelect = (site: FlatSite) => {
    onChange(site.label);
  };

  if (manualMode || (sites.length === 0 && !loading)) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder="הזן מיקום ידנית..."
            className="h-8 text-sm flex-1"
            autoFocus
          />
          {sites.length > 0 && (
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs shrink-0" onClick={() => setManualMode(false)}>
              חזרה לרשימה
            </Button>
          )}
        </div>
        <DaysForwardControl value={daysForward} onChange={onDaysForwardChange} max={maxDaysForward} />
        <div className="flex gap-2">
          <Button size="sm" className="h-7 text-xs" onClick={onSave}>שמור</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onCancel}>ביטול</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Search + manual toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש מיקום..."
            className="h-8 text-sm pr-8"
            autoFocus
          />
        </div>
        <Button type="button" variant="outline" size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={() => setManualMode(true)}>
          <PenLine size={12} /> ידני
        </Button>
      </div>

      {/* Selected value display */}
      {value && (
        <div className="text-xs bg-primary/10 text-primary rounded px-2 py-1 flex items-center gap-1">
          <MapPin size={12} /> {value}
        </div>
      )}

      {/* Sites list */}
      <div className="max-h-48 overflow-y-auto border border-border rounded-md bg-popover">
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">טוען...</p>
        ) : Object.keys(grouped).length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">לא נמצאו תוצאות</p>
        ) : (
          Object.entries(grouped).map(([country, countrySites]) => (
            <div key={country}>
              <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/50 sticky top-0">
                🌍 {country}
              </div>
              {countrySites.map((site, i) => (
                <button
                  key={`${site.label}-${i}`}
                  type="button"
                  onClick={() => handleSelect(site)}
                  className={`w-full text-right px-3 py-1.5 hover:bg-accent transition-colors flex items-center gap-1 ${
                    value === site.label ? 'bg-accent/50 font-medium' : ''
                  }`}
                  style={{ paddingRight: `${12 + (site.depth - 1) * 16}px` }}
                >
                  {site.depth > 1 && <ChevronRight size={10} className="text-muted-foreground shrink-0" />}
                  <span className="text-sm truncate">{site.label}</span>
                  <span className="text-[10px] text-muted-foreground mr-auto shrink-0">
                    {TYPE_LABELS[site.siteType] || site.siteType}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </div>

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
