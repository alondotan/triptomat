import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ChevronDown } from 'lucide-react';
import {
  type SubCategoryEntry,
  getSubCategoriesForPOICategory,
  getTransportSubCategories,
  getLucideIcon,
  getSubCategoryLabel,
  loadSubCategoryConfig,
} from '@/shared/lib/subCategoryConfig';

interface SubCategorySelectorProps {
  /** POI category ('accommodation','eatery','attraction','service') or 'transport' */
  categoryFilter: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function SubCategorySelector({ categoryFilter, value, onChange, placeholder }: SubCategorySelectorProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const effectivePlaceholder = placeholder ?? t('subCategorySelector.chooseType');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
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
    return entries.filter(e => getSubCategoryLabel(e.type, lang).toLowerCase().includes(q) || e.type.toLowerCase().includes(q));
  }, [entries, search, lang]);

  // Get icon for current value
  const currentEntry = entries.find(e => e.type.toLowerCase() === value.toLowerCase());
  const CurrentIcon = currentEntry ? getLucideIcon(currentEntry.icon) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="w-full justify-between font-normal h-10" type="button">
          <span className="flex items-center gap-2 truncate">
            {CurrentIcon && <CurrentIcon size={14} className="shrink-0 text-muted-foreground" />}
            {value ? getSubCategoryLabel(value, lang) : <span className="text-muted-foreground">{effectivePlaceholder}</span>}
          </span>
          <ChevronDown size={14} className="shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2 max-h-64 overflow-hidden flex flex-col" align="start">
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t('subCategorySelector.search')}
          className="mb-2 h-8 text-sm"
          autoFocus
          aria-label={t('subCategorySelector.search')}
          name="subcategory-search"
          autoComplete="off"
        />
        <div className="overflow-y-auto flex-1 space-y-0.5">
          {/* Clear option */}
          <button
            type="button"
            className="w-full text-right px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors text-muted-foreground"
            onClick={() => { onChange(''); setOpen(false); setSearch(''); }}
          >
            {t('subCategorySelector.none')}
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
                <span className="truncate">{getSubCategoryLabel(entry.type, lang)}</span>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">{t('subCategorySelector.noResults')}</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
