import { useState, useMemo, useCallback } from 'react';
import { Check, ChevronLeft, ChevronRight, ChevronsUpDown, X, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Drawer, DrawerContent, DrawerTitle } from '@/components/ui/drawer';
import { Badge } from '@/components/ui/badge';
import { useWorldTree, collectCountries, type WorldTreeNode } from '@/hooks/useWorldTree';
import { useIsMobile } from '@/hooks/use-mobile';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';

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
  const { tree, loading, allCountries } = useWorldTree();
  const isMobile = useIsMobile();

  // Navigation state — path of nodes drilled into
  const [navPath, setNavPath] = useState<WorldTreeNode[]>([]);

  const currentNode = navPath.length > 0 ? navPath[navPath.length - 1] : tree;
  const currentChildren = currentNode?.children ?? [];

  // When searching, show flat filtered list of all countries
  const isSearching = search.length > 0;

  const filteredCountries = useMemo(() => {
    if (!isSearching) return [];
    const lower = search.toLowerCase();
    if (!tree) return [];

    // Search across all nodes (countries + regions + continents)
    const results: WorldTreeNode[] = [];
    function walk(node: WorldTreeNode) {
      if (node.type !== 'world') {
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

  const drillInto = useCallback((node: WorldTreeNode) => {
    setNavPath(prev => [...prev, node]);
    setSearch('');
  }, []);

  const goBack = useCallback(() => {
    setNavPath(prev => prev.slice(0, -1));
    setSearch('');
  }, []);

  const goToRoot = useCallback(() => {
    setNavPath([]);
    setSearch('');
  }, []);

  const selectNode = useCallback((node: WorldTreeNode) => {
    const countries = node.type === 'country' ? [node.name] : collectCountries(node);
    // Add countries that aren't already selected
    const newCountries = countries.filter(c => !value.includes(c));
    if (newCountries.length > 0) {
      onChange([...value, ...newCountries]);
    }
    setOpen(false);
    setSearch('');
    setNavPath([]);
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

  const renderNodeItem = (node: WorldTreeNode) => {
    const isCountry = node.type === 'country';
    const isSelected = isCountry && value.includes(node.name);
    const hasChildren = (node.children?.length ?? 0) > 0 && !isCountry;
    const countryCount = !isCountry ? getCountryCount(node) : 0;
    const selectedCount = !isCountry ? getSelectedCount(node) : 0;

    return (
      <CommandItem
        key={node.name}
        value={`${node.name} ${node.name_he}`}
        onSelect={() => {
          if (isCountry) {
            // Toggle country
            if (isSelected) {
              removeCountry(node.name);
            } else {
              selectNode(node);
            }
          } else {
            // Non-country: drill into
            drillInto(node);
          }
        }}
        className="flex items-center gap-2"
      >
        {isCountry ? (
          <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
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
        ) : (
          <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </CommandItem>
    );
  };

  // Render search result item — can be country or a group node
  const renderSearchItem = (node: WorldTreeNode) => {
    const isCountry = node.type === 'country';
    const isSelected = isCountry && value.includes(node.name);
    const countryCount = !isCountry ? getCountryCount(node) : 0;

    return (
      <CommandItem
        key={`${node.type}-${node.name}`}
        value={`${node.name} ${node.name_he}`}
        onSelect={() => {
          if (isCountry) {
            if (isSelected) {
              removeCountry(node.name);
            } else {
              selectNode(node);
            }
          } else {
            selectNode(node);
          }
        }}
        className="flex items-center gap-2"
      >
        {isCountry ? (
          <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
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
          <span className="text-xs text-muted-foreground">
            {TYPE_LABELS[node.type] || node.type}
            {!isCountry && ` · ${countryCount} countries`}
          </span>
        </div>
      </CommandItem>
    );
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) {
      setNavPath([]);
      setSearch('');
    }
  };

  const triggerButton = (
    <Button
      variant="outline"
      role="combobox"
      aria-expanded={open}
      className="w-full justify-between"
      onClick={isMobile ? () => setOpen(true) : undefined}
    >
      {value.length === 0 ? (
        <span className="text-muted-foreground">{placeholder}</span>
      ) : (
        <span>{value.length} {value.length === 1 ? 'country' : 'countries'} selected</span>
      )}
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  const commandContent = (
    <Command>
      <CommandInput
        placeholder="Search country or region..."
        value={search}
        onValueChange={setSearch}
      />

      {/* Breadcrumb navigation */}
      {!isSearching && navPath.length > 0 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-b text-sm">
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
                  onClick={() => setNavPath(navPath.slice(0, i + 1))}
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
      )}

      <CommandList className={isMobile ? 'max-h-[50vh]' : undefined}>
        <CommandEmpty>No results found.</CommandEmpty>

        {isSearching ? (
          <CommandGroup className={isMobile ? undefined : 'max-h-[280px] overflow-auto'}>
            {filteredCountries.map(renderSearchItem)}
          </CommandGroup>
        ) : (
          <CommandGroup className={isMobile ? undefined : 'max-h-[280px] overflow-auto'}>
            {/* Back button when drilled in */}
            {navPath.length > 0 && (
              <CommandItem onSelect={goBack} className="text-muted-foreground">
                <ChevronRight className="h-4 w-4 ml-0 mr-2" />
                Back
              </CommandItem>
            )}

            {/* "Select all in this group" button when inside a non-country node */}
            {navPath.length > 0 && currentNode && currentNode.type !== 'country' && (
              <CommandItem
                onSelect={() => selectNode(currentNode!)}
                className="text-primary font-medium"
              >
                <Check className="h-4 w-4 ml-0 mr-2" />
                Select all ({getCountryCount(currentNode!)} countries)
              </CommandItem>
            )}

            {currentChildren.map(renderNodeItem)}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );

  return (
    <div className={cn('space-y-2', className)}>
      {isMobile ? (
        <>
          {triggerButton}
          <Drawer open={open} onOpenChange={handleOpenChange}>
            <DrawerContent className="z-[1200]">
              <VisuallyHidden>
                <DrawerTitle>Choose destinations</DrawerTitle>
              </VisuallyHidden>
              <div className="p-2 pb-6">
                {commandContent}
              </div>
            </DrawerContent>
          </Drawer>
        </>
      ) : (
        <Popover open={open} onOpenChange={handleOpenChange} modal={true}>
          <PopoverTrigger asChild>
            {triggerButton}
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-0 z-[1200]" align="start">
            {commandContent}
          </PopoverContent>
        </Popover>
      )}

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((country) => (
            <Badge key={country} variant="secondary" className="gap-1">
              {country}
              <button
                type="button"
                onClick={() => removeCountry(country)}
                className="ml-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring hover:bg-secondary-foreground/20"
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
