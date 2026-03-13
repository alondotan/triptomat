import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronsUpDown, ChevronDown, ChevronLeft, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { SiteNode } from '@/hooks/useCountrySites';
import { useActiveTrip } from '@/context/ActiveTripContext';

export const TYPE_LABEL_KEYS: Record<string, string> = {
  city: 'locationType.city',
  town: 'locationType.town',
  state: 'locationType.state',
  neighborhood: 'locationType.neighborhood',
  historicDistrict: 'locationType.historicDistrict',
  island: 'locationType.island',
  region: 'locationType.region',
  archipelago: 'locationType.archipelago',
  waterfall: 'locationType.waterfall',
  nationalPark: 'locationType.nationalPark',
  resort: 'locationType.resort',
  village: 'locationType.village',
  district: 'locationType.district',
  beach: 'locationType.beach',
  province: 'locationType.province',
  peninsula: 'locationType.peninsula',
  valley: 'locationType.valley',
  desert: 'locationType.desert',
  lake: 'locationType.lake',
  volcano: 'locationType.volcano',
  mountain: 'locationType.mountain',
  municipality: 'locationType.municipality',
  country: 'locationType.country',
};

const RECENT_KEY = 'triptomat-recent-locations';
const MAX_RECENT = 8;

function getRecentLocations(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function addRecentLocation(location: string) {
  const recent = getRecentLocations().filter(l => l !== location);
  recent.unshift(location);
  localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
}

interface LocationSelectorProps {
  value: string;
  onChange: (location: string) => void;
  placeholder?: string;
  className?: string;
}

export function LocationSelector({ value, onChange, placeholder, className }: LocationSelectorProps) {
  const { t } = useTranslation();
  const effectivePlaceholder = placeholder ?? t('locationSelector.chooseLocation');
  const { tripLocationTree, addSiteToHierarchy } = useActiveTrip();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const handleSelect = useCallback((label: string) => {
    addRecentLocation(label);
    onChange(label);
    setOpen(false);
    setSearch('');
  }, [onChange]);

  const recentLocations = useMemo(() => getRecentLocations(), [open]); // refresh on open

  return (
    <div className={cn('flex gap-1', className)}>
      <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
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
              <span className="text-muted-foreground">{effectivePlaceholder}</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0 z-50" align="start" dir="rtl">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('locationSelector.searchLocation')}
                className="h-8 text-sm pr-8"
                autoFocus
                aria-label={t('locationSelector.searchLocation')}
                name="location-search"
              />
            </div>
          </div>
          <div className="max-h-[300px] overflow-y-auto p-1">
            <LocationTree
              nodes={tripLocationTree}
              search={search}
              value={value}
              onSelect={handleSelect}
              onAddToTree={addSiteToHierarchy}
              recentLocations={recentLocations}
            />
          </div>
          {/* Always-visible manual entry at bottom */}
          <ManualEntryFooter onSelect={handleSelect} onAddToTree={addSiteToHierarchy} />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ── Tree components ─────────────────────────────

interface LocationTreeProps {
  nodes: SiteNode[];
  search: string;
  value: string;
  onSelect: (label: string) => void;
  onAddToTree?: (siteName: string, parentSiteName?: string) => void;
  recentLocations: string[];
}

function LocationTree({ nodes, search, value, onSelect, onAddToTree, recentLocations }: LocationTreeProps) {
  const { t } = useTranslation();
  const lower = search.toLowerCase();

  // Collect all site names for recent matching
  const allNames = useMemo(() => {
    const names = new Set<string>();
    function collect(n: SiteNode) {
      names.add(n.site);
      n.sub_sites?.forEach(collect);
    }
    nodes.forEach(collect);
    return names;
  }, [nodes]);

  // Filter recent to only those that exist in the tree
  const validRecent = useMemo(
    () => recentLocations.filter(r => allNames.has(r)),
    [recentLocations, allNames]
  );

  if (search) {
    // Flat search results
    const results: { label: string; siteType: string; path: string[] }[] = [];
    function searchNodes(node: SiteNode, path: string[]) {
      const currentPath = [...path, node.site];
      if (node.site.toLowerCase().includes(lower)) {
        results.push({ label: node.site, siteType: node.site_type, path: currentPath });
      }
      node.sub_sites?.forEach(child => searchNodes(child, currentPath));
    }
    nodes.forEach(n => searchNodes(n, []));

    if (results.length === 0) {
      return <p className="text-xs text-muted-foreground text-center py-4">{t('locationSelector.notFound')}</p>;
    }

    return (
      <div>
        {results.map((r, i) => (
          <button
            key={`${r.label}-${i}`}
            type="button"
            onClick={() => onSelect(r.label)}
            className={cn(
              'flex items-center gap-1.5 w-full text-right py-1.5 px-2 rounded-md transition-colors text-sm hover:bg-accent',
              value === r.label && 'bg-accent/50'
            )}
          >
            <Check className={cn('h-3.5 w-3.5 shrink-0', value === r.label ? 'opacity-100' : 'opacity-0')} />
            <span className="truncate">{r.label}</span>
            <span className="text-[10px] text-muted-foreground mr-auto shrink-0">
              {TYPE_LABEL_KEYS[r.siteType] ? t(TYPE_LABEL_KEYS[r.siteType]) : r.siteType}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Recently used */}
      {validRecent.length > 0 && (
        <div className="mb-1">
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground">{t('locationSelector.recentlyUsed')}</div>
          {validRecent.map(label => (
            <button
              key={`recent-${label}`}
              type="button"
              onClick={() => onSelect(label)}
              className={cn(
                'flex items-center gap-1.5 w-full text-right py-1.5 px-2 rounded-md transition-colors text-sm hover:bg-accent',
                value === label && 'bg-accent/50'
              )}
            >
              <Check className={cn('h-3.5 w-3.5 shrink-0', value === label ? 'opacity-100' : 'opacity-0')} />
              <span className="truncate">{label}</span>
            </button>
          ))}
          <div className="border-b my-1" />
        </div>
      )}

      {/* Tree */}
      {nodes.map(node => (
        <TreeNode key={node.site} node={node} depth={0} value={value} onSelect={onSelect} onAddToTree={onAddToTree} />
      ))}
    </div>
  );
}

interface TreeNodeProps {
  node: SiteNode;
  depth: number;
  value: string;
  onSelect: (label: string) => void;
  onAddToTree?: (siteName: string, parentSiteName?: string) => void;
}

function ManualEntryFooter({ onSelect, onAddToTree }: { onSelect: (label: string) => void; onAddToTree?: (siteName: string, parentSiteName?: string) => void }) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (trimmed) {
      onAddToTree?.(trimmed);
      onSelect(trimmed);
      setNewName('');
      setAdding(false);
    }
  };

  if (!adding) {
    return (
      <div className="border-t p-2">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 w-full text-right py-1.5 px-2 rounded-md transition-colors text-sm hover:bg-accent text-muted-foreground"
        >
          <Plus size={14} />
          <span>{t('locationSelector.addManually')}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="border-t p-2">
      <form onSubmit={handleSubmit} className="flex items-center gap-1">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder={t('locationSelector.locationNamePlaceholder')}
          className="h-8 text-sm flex-1"
          autoFocus
          onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
          aria-label={t('locationSelector.locationNamePlaceholder')}
          name="new-location"
        />
        <Button type="submit" size="sm" className="h-8 text-xs px-3" disabled={!newName.trim()}>
          {t('locationSelector.choose')}
        </Button>
      </form>
    </div>
  );
}

function TreeNode({ node, depth, value, onSelect, onAddToTree }: TreeNodeProps) {
  const { t } = useTranslation();
  const hasChildren = node.sub_sites && node.sub_sites.length > 0;
  const isCountry = node.site_type === 'country';
  const [expanded, setExpanded] = useState(depth < 1);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');

  const handleClick = () => {
    if (isCountry) {
      setExpanded(!expanded);
    } else {
      onSelect(node.site);
    }
  };

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(!expanded);
  };

  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (trimmed) {
      onAddToTree?.(trimmed, node.site);
      onSelect(trimmed);
      setNewName('');
      setAdding(false);
    }
  };

  const typeLabel = TYPE_LABEL_KEYS[node.site_type] ? t(TYPE_LABEL_KEYS[node.site_type]) : node.site_type;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 w-full text-right rounded-md transition-colors text-sm group',
          isCountry ? 'hover:bg-muted/50 cursor-pointer' : 'hover:bg-accent cursor-pointer',
          !isCountry && value === node.site && 'bg-accent/50',
        )}
      >
        <button
          type="button"
          onClick={handleClick}
          className="flex items-center gap-1 flex-1 py-1.5 min-w-0"
          style={{ paddingRight: `${depth * 16 + 8}px` }}
        >
          {hasChildren ? (
            <button type="button" onClick={handleToggle} className="shrink-0 p-0.5 rounded hover:bg-muted-foreground/20 bg-transparent border-0 cursor-pointer">
              {expanded
                ? <ChevronDown size={14} className="text-muted-foreground" />
                : <ChevronLeft size={14} className="text-muted-foreground" />
              }
            </button>
          ) : (
            !isCountry && <Check className={cn('h-3.5 w-3.5 shrink-0', value === node.site ? 'opacity-100' : 'opacity-0')} />
          )}
          <span className={cn('truncate', isCountry && 'font-semibold')}>{node.site}</span>
          {!isCountry && (
            <span className="text-[10px] text-muted-foreground mr-auto shrink-0">{typeLabel}</span>
          )}
        </button>
        {/* Add child button */}
        {expanded && !adding && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAdding(true); }}
            className="p-1 rounded hover:bg-muted-foreground/20 ml-1 shrink-0"
            title={t('locationSelector.addManually')}
            aria-label={t('common.add')}
          >
            <Plus size={12} className="text-muted-foreground" />
          </button>
        )}
      </div>

      {expanded && (
        <div>
          {hasChildren && node.sub_sites!.map(child => (
            <TreeNode key={child.site + child.site_type} node={child} depth={depth + 1} value={value} onSelect={onSelect} onAddToTree={onAddToTree} />
          ))}
          {/* Inline manual add */}
          {adding && (
            <form
              onSubmit={handleAddManual}
              className="flex items-center gap-1 py-1"
              style={{ paddingRight: `${(depth + 1) * 16 + 8}px` }}
            >
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('locationSelector.locationNamePlaceholder')}
                className="h-7 text-xs flex-1"
                autoFocus
                onKeyDown={e => { if (e.key === 'Escape') { setAdding(false); setNewName(''); } }}
                aria-label={t('locationSelector.locationNamePlaceholder')}
                name="new-child-location"
              />
              <Button type="submit" size="sm" className="h-7 text-xs px-2" disabled={!newName.trim()}>
                {t('locationSelector.choose')}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs px-1" onClick={() => { setAdding(false); setNewName(''); }}>
                ✕
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
