import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { COUNTRIES } from '@/data/countries';

interface CountrySelectorProps {
  value: string[];
  onChange: (countries: string[]) => void;
  placeholder?: string;
  className?: string;
}

export function CountrySelector({ value, onChange, placeholder = 'Select countries...', className }: CountrySelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filteredCountries = useMemo(() => {
    if (!search) return COUNTRIES;
    const lower = search.toLowerCase();
    return COUNTRIES.filter(country => country.toLowerCase().includes(lower));
  }, [search]);

  const toggleCountry = (country: string) => {
    if (value.includes(country)) {
      onChange(value.filter(c => c !== country));
    } else {
      onChange([...value, country]);
    }
  };

  const removeCountry = (country: string) => {
    onChange(value.filter(c => c !== country));
  };

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen} modal={false}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between"
          >
            {value.length === 0 ? (
              <span className="text-muted-foreground">{placeholder}</span>
            ) : (
              <span>{value.length} countr{value.length === 1 ? 'y' : 'ies'} selected</span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[300px] p-0" align="start">
          <Command>
            <CommandInput 
              placeholder="Search countries..." 
              value={search}
              onValueChange={setSearch}
            />
            <CommandList>
              <CommandEmpty>No country found.</CommandEmpty>
              <CommandGroup className="max-h-[200px] overflow-auto">
                {filteredCountries.map((country) => (
                  <CommandItem
                    key={country}
                    value={country}
                    onSelect={() => toggleCountry(country)}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value.includes(country) ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    {country}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((country) => (
            <Badge key={country} variant="secondary" className="gap-1">
              {country}
              <button
                type="button"
                onClick={() => removeCountry(country)}
                className="ml-1 rounded-full outline-none hover:bg-secondary-foreground/20"
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
