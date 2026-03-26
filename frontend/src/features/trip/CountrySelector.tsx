import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, X, Globe, Search } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useWorldTree, collectCountries, type WorldTreeNode } from '@/features/geodata/useWorldTree';

interface CountrySelectorProps {
  value: string[];
  onChange: (countries: string[]) => void;
  placeholder?: string;
  className?: string;
}

const TYPE_LABELS: Record<string, string> = {
  continent: 'Continent',
  region: 'Region',
  country: 'Country',
  tourism_region: 'Tourism region',
};

export function CountrySelector({ value, onChange, placeholder = 'Choose destinations...', className }: CountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const { tree, loading } = useWorldTree();

  // Navigation state — path of nodes drilled into
  const [navPath, setNavPath] = useState<WorldTreeNode[]>([]);
  const [searchFocused, setSearchFocused] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus search input on desktop when dialog opens
  useEffect(() => {
    if (open && window.matchMedia('(min-width: 640px)').matches) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }, [open]);

  const currentNode = navPath.length > 0 ? navPath[navPath.length - 1] : tree;
  const currentChildren = currentNode?.children ?? [];

  const isSearching = search.length > 0;

  const filteredNodes = useMemo(() => {
    if (!isSearching || !tree) return [];
    const lower = search.toLowerCase();
    const results: WorldTreeNode[] = [];
    function walk(node: WorldTreeNode) {
      if (node.type === 'country') {
        const matchName = node.name.toLowerCase().includes(lower);
        const matchHe = node.name_he.toLowerCase().includes(lower);
        if (matchName || matchHe) {
          results.push(node);
        }
      }
      for (const child of node.children ?? []) walk(child);
    }
    walk(tree);
    return results;
  }, [isSearching, search, tree]);

  const scrollToTop = useCallback(() => {
    // ScrollArea uses a viewport div inside
    const viewport = scrollRef.current?.querySelector('[data-radix-scroll-area-viewport]');
    if (viewport) viewport.scrollTop = 0;
  }, []);

  const drillInto = useCallback((node: WorldTreeNode) => {
    setNavPath(prev => [...prev, node]);
    setSearch('');
    requestAnimationFrame(scrollToTop);
  }, [scrollToTop]);

  const goBack = useCallback(() => {
    setNavPath(prev => prev.slice(0, -1));
    setSearch('');
    requestAnimationFrame(scrollToTop);
  }, [scrollToTop]);

  const goToRoot = useCallback(() => {
    setNavPath([]);
    setSearch('');
    requestAnimationFrame(scrollToTop);
  }, [scrollToTop]);

  const toggleCountry = useCallback((countryName: string) => {
    if (value.includes(countryName)) {
      onChange(value.filter(c => c !== countryName));
    } else {
      onChange([...value, countryName]);
    }
  }, [value, onChange]);

  const selectAllInNode = useCallback((node: WorldTreeNode) => {
    const countries = collectCountries(node);
    const newCountries = countries.filter(c => !value.includes(c));
    if (newCountries.length > 0) {
      onChange([...value, ...newCountries]);
    }
  }, [value, onChange]);

  const removeCountry = (country: string) => {
    onChange(value.filter(c => c !== country));
  };

  const getCountryCount = useCallback((node: WorldTreeNode): number => {
    return collectCountries(node).length;
  }, []);

  const getSelectedCount = useCallback((node: WorldTreeNode): number => {
    return collectCountries(node).filter(c => value.includes(c)).length;
  }, [value]);

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setNavPath([]);
      setSearch('');
    }
  };

  const renderItem = (node: WorldTreeNode) => {
    const isCountry = node.type === 'country';
    const isSelected = isCountry && value.includes(node.name);
    const countryCount = !isCountry ? getCountryCount(node) : 0;
    const selectedCount = !isCountry ? getSelectedCount(node) : 0;

    return (
      <button
        key={node.name}
        type="button"
        onClick={() => {
          if (isCountry) {
            toggleCountry(node.name);
          } else if (isSearching) {
            selectAllInNode(node);
          } else {
            drillInto(node);
          }
        }}
        className={cn(
          'flex items-center gap-2 w-full px-3 py-2 text-sm rounded-md transition-colors text-start',
          'hover:bg-accent hover:text-accent-foreground',
          isSelected && 'bg-accent/50',
        )}
      >
        {isCountry ? (
          <div className={cn(
            'h-4 w-4 shrink-0 rounded border flex items-center justify-center',
            isSelected ? 'bg-primary border-primary' : 'border-muted-foreground/30',
          )}>
            {isSelected && <Check className="h-3 w-3 text-primary-foreground" />}
          </div>
        ) : (
          <Globe className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {node.flag && (
              <img src={node.flag} alt="" className="h-4 w-6 object-cover rounded-sm shrink-0" />
            )}
            <span className="truncate">{node.name_he !== node.name ? node.name_he : node.name}</span>
          </div>
          {!isCountry && (
            <span className="text-xs text-muted-foreground">
              {TYPE_LABELS[node.type] || node.type} · {countryCount} countries
              {selectedCount > 0 && ` · ${selectedCount} selected`}
            </span>
          )}
        </div>

        {isCountry ? (
          node.country_code && (
            <span className="text-xs text-muted-foreground shrink-0">{node.country_code}</span>
          )
        ) : !isSearching ? (
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : null}
      </button>
    );
  };

  const breadcrumbs = !isSearching && navPath.length > 0 && (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b text-sm">
      <button
        type="button"
        onClick={goToRoot}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        World
      </button>
      {navPath.map((node, i) => (
        <span key={node.name} className="flex items-center gap-1">
          <ChevronLeft className="h-3 w-3 text-muted-foreground" />
          {i < navPath.length - 1 ? (
            <button
              type="button"
              onClick={() => {
                setNavPath(navPath.slice(0, i + 1));
                requestAnimationFrame(scrollToTop);
              }}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {node.name_he !== node.name ? node.name_he : node.name}
            </button>
          ) : (
            <span className="font-medium">
              {node.name_he !== node.name ? node.name_he : node.name}
            </span>
          )}
        </span>
      ))}
    </div>
  );

  const displayNodes = isSearching ? filteredNodes : currentChildren;

  return (
    <div className={cn('space-y-2', className)}>
      <Button
        variant="outline"
        type="button"
        className="w-full justify-between"
        onClick={() => setOpen(true)}
      >
        {value.length === 0 ? (
          <span className="text-muted-foreground">{placeholder}</span>
        ) : (
          <span>{value.length} {value.length === 1 ? 'country' : 'countries'} selected</span>
        )}
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="sm:max-w-[420px] h-[70vh] max-h-[70vh] max-sm:h-[85vh] max-sm:max-h-[85vh] flex flex-col p-0 gap-0 z-[1200]" preventAutoFocus>
          <DialogHeader className="px-4 pt-4 pb-2">
            <DialogTitle>Choose destinations</DialogTitle>
          </DialogHeader>

          {/* Search input */}
          <div className="px-3 pb-2">
            <div className="flex items-center border rounded-md px-3">
              <Search className="h-4 w-4 shrink-0 opacity-50 mr-2" />
              <input
                ref={searchInputRef}
                placeholder="Search country or region..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                inputMode="search"
                enterKeyHint="search"
                className="flex h-10 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
              {search && (
                <button type="button" onClick={() => setSearch('')} className="opacity-50 hover:opacity-100">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {breadcrumbs}

          {/* Selected badges */}
          {value.length > 0 && (
            <div className="flex flex-wrap gap-1 px-3 pb-2 border-b">
              {value.map((country) => (
                <Badge key={country} variant="secondary" className="gap-1 text-xs">
                  {country}
                  <button
                    type="button"
                    onClick={() => removeCountry(country)}
                    className="ml-0.5 rounded-full hover:bg-secondary-foreground/20"
                    aria-label="Remove country"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {/* List */}
          <ScrollArea ref={scrollRef} className="flex-1">
            <div className="p-1">
              {/* Back button when drilled in */}
              {!isSearching && navPath.length > 0 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-muted-foreground rounded-md hover:bg-accent transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                  Back
                </button>
              )}

              {/* Select all button */}
              {!isSearching && navPath.length > 0 && currentNode && currentNode.type !== 'country' && (
                <button
                  type="button"
                  onClick={() => selectAllInNode(currentNode!)}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm text-primary font-medium rounded-md hover:bg-accent transition-colors"
                >
                  <Check className="h-4 w-4" />
                  Select all ({getCountryCount(currentNode!)} countries)
                </button>
              )}

              {displayNodes.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No results found.</p>
              )}

              {displayNodes.map(renderItem)}
            </div>
          </ScrollArea>

          {/* Done button — hidden when keyboard is open */}
          {!searchFocused && (
            <div className="px-4 py-3 border-t">
              <Button className="w-full" onClick={() => setOpen(false)}>
                Done{value.length > 0 ? ` (${value.length})` : ''}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {value.length > 0 && (
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {value.map((country) => (
            <Badge key={country} variant="secondary" className="gap-1 shrink-0 text-xs">
              {country}
              <button
                type="button"
                onClick={() => removeCountry(country)}
                className="ml-0.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-secondary-foreground/20"
                aria-label="Remove country"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
