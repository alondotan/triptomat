import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, X, Star, Moon, Heart, ArrowRight, CalendarDays } from 'lucide-react';
import { CitySelector } from '@/components/CitySelector';
import { SubCategorySelector } from '@/components/SubCategorySelector';
import { SubCategoryIcon } from '@/components/SubCategoryIcon';
import { useCountrySites, type SiteNode } from '@/hooks/useCountrySites';

export interface DaySectionItem {
  id: string;
  label: string;
  sublabel: string;
  status?: string;
  isSelected?: boolean;
  subCategory?: string;
}

export interface LocationSuggestion {
  label: string;
  type: 'activity' | 'accommodation' | 'airport';
}

export interface DaySectionProps {
  title: string;
  icon: React.ReactNode;
  items: DaySectionItem[];
  onRemove: (id: string) => void;
  availableItems: { id: string; label: string; sublabel: string; city?: string; status?: string }[];
  onAdd: (id: string, nights?: number, createBookingMission?: boolean) => void;
  locationContext?: string;
  onCreateNew?: (data: Record<string, string>, createBookingMission?: boolean) => Promise<void>;
  onToggleSelected?: (id: string, selected: boolean) => void;
  addLabel: string;
  entityType: 'accommodation' | 'activity' | 'transport';
  maxNights?: number;
  locationSuggestions?: LocationSuggestion[];
  showBookingMissionOption?: boolean;
  countries?: string[];
  extraHierarchy?: SiteNode[];
  // New optional props
  hideHeader?: boolean;
  hideEmptyState?: boolean;
  onMoveToSchedule?: (id: string) => void;
  onMoveToDay?: (id: string, dayNum: number) => void;
  tripDays?: Date[];
  selectedDayNum?: number;
}


const ACCOMMODATION_SUBCATEGORIES = ['hotel', 'hostel', 'apartment', 'resort', 'guesthouse', 'other'];
const POI_CATEGORIES = [
  { value: 'attraction', label: 'אטרקציה' },
  { value: 'eatery', label: 'מסעדה/בית קפה' },
  { value: 'service', label: 'שירות' },
];
const TRANSPORT_CATEGORIES = [
  { value: 'flight', label: 'טיסה' },
  { value: 'train', label: 'רכבת' },
  { value: 'bus', label: 'אוטובוס' },
  { value: 'ferry', label: 'מעבורת' },
  { value: 'taxi', label: 'מונית' },
  { value: 'car_rental', label: 'השכרת רכב' },
  { value: 'other', label: 'אחר' },
];

export function DaySection({
  title, icon, items, onRemove, availableItems, onAdd,
  onCreateNew, onToggleSelected, addLabel, entityType, maxNights, locationSuggestions,
  showBookingMissionOption, locationContext, countries, extraHierarchy,
  hideHeader, hideEmptyState, onMoveToSchedule, onMoveToDay, tripDays, selectedDayNum,
}: DaySectionProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [nights, setNights] = useState(1);
  const [createBookingMission, setCreateBookingMission] = useState(false);

  // Build set of location names that are descendants of locationContext in the hierarchy
  const { sites } = useCountrySites(countries || [], extraHierarchy);
  const localLocationNames = useMemo(() => {
    if (!locationContext) return new Set<string>();
    const loc = locationContext.toLowerCase();
    const names = new Set<string>([loc]);
    // Any site whose path includes locationContext is considered local
    for (const site of sites) {
      if (site.path.some(p => p.toLowerCase() === loc)) {
        names.add(site.label.toLowerCase());
      }
    }
    return names;
  }, [locationContext, sites]);

  // Sort by status: in_plan/matched first, then others
  const sortByStatus = (items: typeof availableItems) => {
    return [...items].sort((a, b) => {
      const aInPlan = (a.status === 'in_plan' || a.status === 'matched') ? 0 : 1;
      const bInPlan = (b.status === 'in_plan' || b.status === 'matched') ? 0 : 1;
      return aInPlan - bInPlan;
    });
  };

  // Split available items by location context match (hierarchy-aware), then sub-sort by status
  const { localItems, otherItems } = useMemo(() => {
    if (!locationContext) return { localItems: [] as typeof availableItems, otherItems: sortByStatus(availableItems) };
    const local = availableItems.filter(item => {
      if (!item.city) return false;
      const cityLower = item.city.toLowerCase();
      return localLocationNames.has(cityLower);
    });
    const other = availableItems.filter(item => !local.includes(item));
    return { localItems: sortByStatus(local), otherItems: sortByStatus(other) };
  }, [availableItems, locationContext, localLocationNames]);

  return (
    <div className="space-y-2">
      {!hideHeader && <h4 className="text-sm font-semibold flex items-center gap-2">{icon} {title}</h4>}

      {!hideEmptyState && items.length === 0 && (
        <p className="text-xs text-muted-foreground mr-0 sm:mr-6">אין פריטים</p>
      )}

      {items.map(item => (
        <div key={item.id} className="flex items-center gap-2 mr-0 sm:mr-6 bg-muted/50 rounded-lg px-2 sm:px-3 py-2">
          {entityType === 'accommodation' && onToggleSelected && (
            <button
              onClick={() => onToggleSelected(item.id, !item.isSelected)}
              className={`shrink-0 transition-colors ${item.isSelected ? 'text-yellow-500' : 'text-muted-foreground/40 hover:text-yellow-400'}`}
              title={item.isSelected ? 'נבחר' : 'סמן כנבחר'}
            >
              <Star size={16} fill={item.isSelected ? 'currentColor' : 'none'} />
            </button>
          )}
          <div className="flex-1 min-w-0 flex items-center gap-2">
            {item.subCategory && <SubCategoryIcon type={item.subCategory} size={15} className="shrink-0 text-muted-foreground" />}
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.label}</p>
              {item.sublabel && <p className="text-xs text-muted-foreground">{item.sublabel}</p>}
            </div>
          </div>
          {item.status && (
            <Badge variant={item.status === 'booked' ? 'default' : 'secondary'} className="text-xs shrink-0">{item.status}</Badge>
          )}
          {/* Move to schedule button */}
          {onMoveToSchedule && (
            <button
              onClick={() => onMoveToSchedule(item.id)}
              title="העבר ללו״ז"
              className="shrink-0 p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <ArrowRight size={13} />
            </button>
          )}
          {/* Move to another day */}
          {onMoveToDay && tripDays && (
            <select
              className="shrink-0 appearance-none bg-transparent text-muted-foreground hover:text-primary cursor-pointer p-1 text-[10px] rounded hover:bg-primary/10 transition-colors"
              value=""
              title="העבר ליום אחר"
              onChange={e => {
                const targetDay = parseInt(e.target.value);
                if (targetDay) onMoveToDay(item.id, targetDay);
              }}
            >
              <option value="">📅</option>
              {tripDays.map((day, idx) => {
                const dayNum = idx + 1;
                if (dayNum === selectedDayNum) return null;
                return (
                  <option key={dayNum} value={dayNum}>
                    יום {dayNum} — {format(day, 'MMM d')}
                  </option>
                );
              })}
            </select>
          )}
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={() => onRemove(item.id)}>
            <X size={14} />
          </Button>
        </div>
      ))}

      <Dialog open={showPicker} onOpenChange={setShowPicker}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1 mr-0 sm:mr-6 text-xs">
            <Plus size={14} /> {addLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{addLabel}</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue={availableItems.length > 0 ? "existing" : "new"}>
            <TabsList className="w-full">
              <TabsTrigger value="existing" className="flex-1">בחר קיים</TabsTrigger>
              {onCreateNew && <TabsTrigger value="new" className="flex-1">צור חדש</TabsTrigger>}
            </TabsList>

            <TabsContent value="existing">
              {entityType === 'accommodation' && maxNights && maxNights > 1 && (
                <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                  <Moon size={14} className="text-muted-foreground" />
                  <Label className="text-xs">מספר לילות:</Label>
                  <Input
                    type="number"
                    min={1}
                    max={maxNights}
                    value={nights}
                    onChange={e => setNights(Math.min(maxNights, Math.max(1, parseInt(e.target.value) || 1)))}
                    className="h-7 w-16 text-sm"
                  />
                </div>
              )}
              {availableItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">אין פריטים זמינים</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {localItems.length > 0 && (
                    <>
                      <p className="text-xs font-semibold text-muted-foreground px-3 pt-1">📍 {locationContext}</p>
                      {localItems.map(item => (
                        <button
                          key={item.id}
                          onClick={() => { onAdd(item.id, entityType === 'accommodation' ? nights : undefined, createBookingMission); setShowPicker(false); setNights(1); setCreateBookingMission(false); }}
                          className="w-full text-right px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                        >
                          {(item.status === 'in_plan' || item.status === 'matched') && <Heart size={12} className="text-red-500 shrink-0" fill="currentColor" />}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">{item.label}</p>
                            {item.sublabel && <p className="text-xs text-muted-foreground">{item.sublabel}</p>}
                          </div>
                        </button>
                      ))}
                    </>
                  )}
                  {localItems.length > 0 && otherItems.length > 0 && (
                    <div className="border-t my-1" />
                  )}
                  {otherItems.length > 0 && locationContext && localItems.length > 0 && (
                    <p className="text-xs font-semibold text-muted-foreground px-3 pt-1">מקומות אחרים</p>
                  )}
                  {otherItems.map(item => (
                    <button
                      key={item.id}
                      onClick={() => { onAdd(item.id, entityType === 'accommodation' ? nights : undefined, createBookingMission); setShowPicker(false); setNights(1); setCreateBookingMission(false); }}
                      className="w-full text-right px-3 py-2 rounded-lg hover:bg-muted transition-colors flex items-center gap-2"
                    >
                      {(item.status === 'in_plan' || item.status === 'matched') && <Heart size={12} className="text-red-500 shrink-0" fill="currentColor" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{item.label}</p>
                        {item.sublabel && <p className="text-xs text-muted-foreground">{item.sublabel}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              {showBookingMissionOption && (
                <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                  <Checkbox id="booking-existing" checked={createBookingMission} onCheckedChange={(v) => setCreateBookingMission(!!v)} />
                  <Label htmlFor="booking-existing" className="text-xs cursor-pointer">צור משימת הזמנה</Label>
                </div>
              )}
            </TabsContent>

            {onCreateNew && (
              <TabsContent value="new">
                {entityType === 'accommodation' && maxNights && maxNights > 1 && (
                  <div className="flex items-center gap-2 mb-3 pb-3 border-b">
                    <Moon size={14} className="text-muted-foreground" />
                    <Label className="text-xs">מספר לילות:</Label>
                    <Input
                      type="number"
                      min={1}
                      max={maxNights}
                      value={nights}
                      onChange={e => setNights(Math.min(maxNights, Math.max(1, parseInt(e.target.value) || 1)))}
                      className="h-7 w-16 text-sm"
                    />
                  </div>
                )}
                <QuickCreateForm
                  entityType={entityType}
                  locationSuggestions={locationSuggestions}
                  showBookingMissionOption={showBookingMissionOption}
                  countries={countries}
                  onSubmit={async (data, bookingMission) => {
                    await onCreateNew({ ...data, _nights: String(nights) }, bookingMission);
                    setShowPicker(false);
                    setNights(1);
                    setCreateBookingMission(false);
                  }}
                />
              </TabsContent>
            )}
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface QuickCreateFormProps {
  entityType: 'accommodation' | 'activity' | 'transport';
  onSubmit: (data: Record<string, string>, createBookingMission?: boolean) => Promise<void>;
  locationSuggestions?: LocationSuggestion[];
  showBookingMissionOption?: boolean;
  countries?: string[];
}

function LocationInput({ value, onChange, placeholder, suggestions }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  suggestions?: LocationSuggestion[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions?.filter(s =>
    !value || s.label.toLowerCase().includes(value.toLowerCase())
  ) || [];

  return (
    <div className="relative">
      <Input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        required
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-popover border border-border rounded-md shadow-md max-h-40 overflow-y-auto">
          {filtered.map((s, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-right px-3 py-1.5 hover:bg-muted transition-colors flex items-center gap-2"
              onClick={() => { onChange(s.label); setOpen(false); }}
            >
              <span className="text-xs text-muted-foreground shrink-0">
                {s.type === 'airport' ? '✈️' : s.type === 'accommodation' ? '🏨' : '📍'}
              </span>
              <span className="text-sm truncate">{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function QuickCreateForm({ entityType, onSubmit, locationSuggestions, showBookingMissionOption, countries }: QuickCreateFormProps) {
  const { tripSitesHierarchy } = useActiveTrip();
  const [name, setName] = useState('');
  const [city, setCity] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [category, setCategory] = useState(entityType === 'transport' ? 'flight' : 'attraction');
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createBookingMission, setCreateBookingMission] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (entityType === 'transport') {
        await onSubmit({ category, fromName, toName }, createBookingMission);
      } else {
        await onSubmit({ name, city, subCategory, category: entityType === 'accommodation' ? 'accommodation' : category }, createBookingMission);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (entityType === 'transport') {
    return (
      <form onSubmit={handleSubmit} className="space-y-3 pt-2">
        <div className="space-y-1">
          <Label className="text-xs">סוג</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {TRANSPORT_CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">מוצא *</Label>
          <LocationInput value={fromName} onChange={setFromName} placeholder="תל אביב" suggestions={locationSuggestions} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">יעד *</Label>
          <LocationInput value={toName} onChange={setToName} placeholder="מנילה" suggestions={locationSuggestions} />
        </div>
        {showBookingMissionOption && (
          <div className="flex items-center gap-2 mt-1">
            <Checkbox id="booking-new-transport" checked={createBookingMission} onCheckedChange={(v) => setCreateBookingMission(!!v)} />
            <Label htmlFor="booking-new-transport" className="text-xs cursor-pointer">צור משימת הזמנה</Label>
          </div>
        )}
        <Button type="submit" className="w-full" size="sm" disabled={submitting}>
          {submitting ? 'יוצר...' : 'צור והוסף'}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 pt-2">
      {entityType === 'activity' && (
        <div className="space-y-1">
          <Label className="text-xs">קטגוריה</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {POI_CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">שם *</Label>
        <Input value={name} onChange={e => setName(e.target.value)} required placeholder={entityType === 'accommodation' ? 'שם המלון' : 'שם המקום'} />
      </div>
      {entityType === 'accommodation' && (
        <div className="space-y-1">
          <Label className="text-xs">סוג</Label>
          <SubCategorySelector categoryFilter="accommodation" value={subCategory} onChange={setSubCategory} placeholder="בחר סוג..." />
        </div>
      )}
      <div className="space-y-1">
        <Label className="text-xs">עיר</Label>
        <CitySelector countries={countries || []} value={city} onChange={setCity} placeholder="בחר עיר..." extraHierarchy={tripSitesHierarchy} />
      </div>
      {showBookingMissionOption && (
        <div className="flex items-center gap-2 mt-1">
          <Checkbox id="booking-new-poi" checked={createBookingMission} onCheckedChange={(v) => setCreateBookingMission(!!v)} />
          <Label htmlFor="booking-new-poi" className="text-xs cursor-pointer">צור משימת הזמנה</Label>
        </div>
      )}
      <Button type="submit" className="w-full" size="sm" disabled={submitting}>
        {submitting ? 'יוצר...' : 'צור והוסף'}
      </Button>
    </form>
  );
}
