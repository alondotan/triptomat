import { useState, useEffect, useMemo } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil, ChevronDown } from 'lucide-react';
import {
  type SubCategoryEntry,
  getSubCategoriesForPOICategory,
  getTransportSubCategories,
  getLucideIcon,
  loadSubCategoryConfig,
} from '@/lib/subCategoryConfig';

interface SubCategorySelectorProps {
  /** POI category ('accommodation','eatery','attraction','service') or 'transport' */
  categoryFilter: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SubCategorySelector({ categoryFilter, value, onChange, placeholder = 'בחר סוג...' }: SubCategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [manual, setManual] = useState(false);
  const [entries, setEntries] = useState<SubCategoryEntry[]>([]);

  useEffect(() => {
    loadSubCategoryConfig().then(() => {
      const list = categoryFilter === 'transport'
        ? getTransportSubCategories()
        : getSubCategoriesForPOICategory(categoryFilter);
      setEntries(list);
    });
  }, [categoryFilter]);

  const filtered = useMemo(() => {
    if (!search) return entries;
    const q = search.toLowerCase();
    return entries.filter(e => e.type.toLowerCase().includes(q));
  }, [entries, search]);

  // Get icon for current value
  const currentEntry = entries.find(e => e.type.toLowerCase() === value.toLowerCase());
  const CurrentIcon = currentEntry ? getLucideIcon(currentEntry.icon) : null;

  if (manual) {
    return (
      <div className="flex gap-1">
        <Input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="הזן ידנית..."
          className="flex-1"
        />
        <Button type="button" variant="ghost" size="sm" className="shrink-0 text-xs" onClick={() => setManual(false)}>
          רשימה
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" className="flex-1 justify-between font-normal h-10" type="button">
            <span className="flex items-center gap-2 truncate">
              {CurrentIcon && <CurrentIcon size={14} className="shrink-0 text-muted-foreground" />}
              {value || <span className="text-muted-foreground">{placeholder}</span>}
            </span>
            <ChevronDown size={14} className="shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-64 overflow-hidden flex flex-col" align="start">
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש..."
            className="mb-2 h-8 text-sm"
            autoFocus
          />
          <div className="overflow-y-auto flex-1 space-y-0.5">
            {/* Clear option */}
            <button
              type="button"
              className="w-full text-right px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-muted-foreground"
              onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
            >
              — ללא —
            </button>
            {filtered.map(entry => {
              const Icon = getLucideIcon(entry.icon);
              return (
                <button
                  key={entry.type}
                  type="button"
                  className={`w-full text-right px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors flex items-center gap-2 ${value === entry.type ? 'bg-accent' : ''}`}
                  onClick={() => { onChange(entry.type); setOpen(false); setSearch(''); }}
                >
                  <Icon size={14} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{entry.type}</span>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-2">אין תוצאות</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      <Button type="button" variant="ghost" size="icon" className="shrink-0 h-10 w-10" onClick={() => setManual(true)} title="הזנה ידנית">
        <Pencil size={14} />
      </Button>
    </div>
  );
}
