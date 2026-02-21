import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTrip } from '@/context/TripContext';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AppLayout } from '@/components/AppLayout';
import { CreateTripForm } from '@/components/forms/CreateTripForm';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Plane, Building2, MapPin, CalendarDays, Pencil } from 'lucide-react';
import { format, eachDayOfInterval, parseISO } from 'date-fns';
import * as tripService from '@/services/tripService';
import { DaySection, type LocationSuggestion } from '@/components/DaySection';
import { LocationContextPicker } from '@/components/LocationContextPicker';

const Index = () => {
  const { state, loadTripData, addPOI, addTransportation, addMission, updatePOI } = useTrip();
  const [selectedDayNum, setSelectedDayNum] = useState(1);
  const [locationContext, setLocationContext] = useState('');
  const [editingLocation, setEditingLocation] = useState(false);
  const [locationDaysForward, setLocationDaysForward] = useState(0);

  // Reset editing state when switching trips
  useEffect(() => {
    setEditingLocation(false);
    setSelectedDayNum(1);
    setLocationDaysForward(0);
  }, [state.activeTrip?.id]);

  const tripDays = useMemo(() => {
    if (!state.activeTrip) return [];
    return eachDayOfInterval({
      start: parseISO(state.activeTrip.startDate),
      end: parseISO(state.activeTrip.endDate),
    });
  }, [state.activeTrip?.startDate, state.activeTrip?.endDate]);

  const currentItDay = useMemo(() =>
    state.itineraryDays.find(d => d.dayNumber === selectedDayNum),
    [state.itineraryDays, selectedDayNum]
  );

  const dayAccommodations = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.accommodationOptions
      .map(opt => ({ ...opt, poi: state.pois.find(p => p.id === opt.poi_id) }))
      .filter(opt => opt.poi);
  }, [currentItDay, state.pois]);

  const dayActivities = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.activities
      .filter(a => a.type === 'poi')
      .map(a => ({ ...a, poi: state.pois.find(p => p.id === a.id) }))
      .filter(a => a.poi)
      .sort((a, b) => a.order - b.order);
  }, [currentItDay, state.pois]);

  const dayTransport = useMemo(() => {
    if (!currentItDay) return [];
    return currentItDay.transportationSegments
      .map(seg => ({ ...seg, transport: state.transportation.find(t => t.id === seg.transportation_id) }))
      .filter(seg => seg.transport);
  }, [currentItDay, state.transportation]);

  // Location suggestions for transport quick-create form
  const transportLocationSuggestions = useMemo<LocationSuggestion[]>(() => {
    const suggestions: LocationSuggestion[] = [];
    // Activities assigned to this day
    dayActivities.forEach(a => {
      if (a.poi?.name) {
        const label = a.poi.location?.city ? `${a.poi.name} (${a.poi.location.city})` : a.poi.name;
        suggestions.push({ label, type: 'activity' });
      }
    });
    // Accommodation of this day
    dayAccommodations.forEach(a => {
      if (a.poi?.name) {
        const label = a.poi.location?.city ? `${a.poi.name} (${a.poi.location.city})` : a.poi.name;
        suggestions.push({ label, type: 'accommodation' });
      }
    });
    // Accommodation of previous day
    const prevItDay = state.itineraryDays.find(d => d.dayNumber === selectedDayNum - 1);
    if (prevItDay) {
      prevItDay.accommodationOptions.forEach(opt => {
        const poi = state.pois.find(p => p.id === opt.poi_id);
        if (poi && !suggestions.some(s => s.label.startsWith(poi.name))) {
          const label = poi.location?.city ? `${poi.name} (${poi.location.city})` : poi.name;
          suggestions.push({ label, type: 'accommodation' });
        }
      });
    }
    // Airports from flights assigned to this day
    dayTransport.forEach(dt => {
      if (dt.transport?.category === 'flight' && dt.transport.segments) {
        dt.transport.segments.forEach(seg => {
          const depLabel = seg.from.code ? `${seg.from.name} (${seg.from.code})` : seg.from.name;
          const arrLabel = seg.to.code ? `${seg.to.name} (${seg.to.code})` : seg.to.name;
          if (!suggestions.some(s => s.label === depLabel)) {
            suggestions.push({ label: depLabel, type: 'airport' });
          }
          if (!suggestions.some(s => s.label === arrLabel)) {
            suggestions.push({ label: arrLabel, type: 'airport' });
          }
        });
      }
    });
    return suggestions;
  }, [dayActivities, dayAccommodations, dayTransport, state.itineraryDays, state.pois, selectedDayNum]);

  const locationSpans = useMemo(() => {
    if (tripDays.length === 0) return [];
    const spans: { location: string; startIdx: number; endIdx: number }[] = [];
    for (let i = 0; i < tripDays.length; i++) {
      const itDay = state.itineraryDays.find(d => d.dayNumber === i + 1);
      const loc = itDay?.locationContext || '';
      if (loc && spans.length > 0 && spans[spans.length - 1].location === loc && spans[spans.length - 1].endIdx === i - 1) {
        spans[spans.length - 1].endIdx = i;
      } else if (loc) {
        spans.push({ location: loc, startIdx: i, endIdx: i });
      }
    }
    return spans;
  }, [tripDays, state.itineraryDays]);

  const refreshDays = useCallback(async () => {
    if (state.activeTrip) await loadTripData(state.activeTrip.id);
  }, [state.activeTrip, loadTripData]);

  const ensureItDay = useCallback(async () => {
    if (currentItDay) return currentItDay;
    if (!state.activeTrip) return null;
    const day = tripDays[selectedDayNum - 1];
    return await tripService.createItineraryDay({
      tripId: state.activeTrip.id,
      dayNumber: selectedDayNum,
      date: day ? format(day, 'yyyy-MM-dd') : undefined,
      locationContext: '',
      accommodationOptions: [],
      activities: [],
      transportationSegments: [],
    });
  }, [currentItDay, state.activeTrip, selectedDayNum, tripDays]);

  const addEntityToDay = useCallback(async (
    entityType: 'accommodation' | 'activity' | 'transport',
    entityId: string,
    nights?: number,
  ) => {
    const itDay = await ensureItDay();
    if (!itDay) return;

    if (entityType === 'accommodation') {
      // For multi-night: assign to consecutive days starting from selected
      const nightCount = nights || 1;
      const dayNumbers: number[] = [];
      for (let i = 0; i < nightCount; i++) {
        const dayNum = selectedDayNum + i;
        if (dayNum <= tripDays.length) dayNumbers.push(dayNum);
      }

      for (const dayNum of dayNumbers) {
        let targetDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
        if (!targetDay && state.activeTrip) {
          const day = tripDays[dayNum - 1];
          targetDay = await tripService.createItineraryDay({
            tripId: state.activeTrip.id,
            dayNumber: dayNum,
            date: day ? format(day, 'yyyy-MM-dd') : undefined,
            locationContext: '',
            accommodationOptions: [],
            activities: [],
            transportationSegments: [],
          });
        }
        if (targetDay) {
          const existing = targetDay.accommodationOptions || [];
          if (!existing.some(o => o.poi_id === entityId)) {
            await tripService.updateItineraryDay(targetDay.id, {
              accommodationOptions: [...existing, { is_selected: false, poi_id: entityId }],
            });
          }
        }
      }
      // Update POI status to 'matched' if it's candidate or in_plan
      const poi = state.pois.find(p => p.id === entityId);
      if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
        await updatePOI({ ...poi, status: 'matched' });
      }
    } else if (entityType === 'activity') {
      const existing = itDay.activities || [];
      if (existing.some(a => a.id === entityId)) return;
      await tripService.updateItineraryDay(itDay.id, {
        activities: [...existing, { order: existing.length + 1, type: 'poi', id: entityId }],
      });
      // Update POI status to 'matched' if it's candidate or in_plan
      const poi = state.pois.find(p => p.id === entityId);
      if (poi && (poi.status === 'candidate' || poi.status === 'in_plan')) {
        await updatePOI({ ...poi, status: 'matched' });
      }
    } else if (entityType === 'transport') {
      const existing = itDay.transportationSegments || [];
      if (existing.some(s => s.transportation_id === entityId)) return;
      await tripService.updateItineraryDay(itDay.id, {
        transportationSegments: [...existing, { is_selected: true, transportation_id: entityId }],
      });
    }

    await refreshDays();
  }, [ensureItDay, refreshDays, selectedDayNum, tripDays, state.itineraryDays, state.activeTrip]);

  const removeEntityFromDay = useCallback(async (
    entityType: 'accommodation' | 'activity' | 'transport',
    entityId: string,
  ) => {
    if (!currentItDay) return;

    if (entityType === 'accommodation') {
      await tripService.updateItineraryDay(currentItDay.id, {
        accommodationOptions: currentItDay.accommodationOptions.filter(o => o.poi_id !== entityId),
      });
    } else if (entityType === 'activity') {
      await tripService.updateItineraryDay(currentItDay.id, {
        activities: currentItDay.activities.filter(a => a.id !== entityId),
      });
    } else if (entityType === 'transport') {
      await tripService.updateItineraryDay(currentItDay.id, {
        transportationSegments: currentItDay.transportationSegments.filter(s => s.transportation_id !== entityId),
      });
    }

    await refreshDays();
  }, [currentItDay, refreshDays]);

  const toggleAccommodationSelected = useCallback(async (poiId: string, selected: boolean) => {
    if (!currentItDay) return;
    const updated = currentItDay.accommodationOptions.map(o => ({
      ...o,
      is_selected: o.poi_id === poiId ? selected : false, // only one selected at a time
    }));
    await tripService.updateItineraryDay(currentItDay.id, { accommodationOptions: updated });
    await refreshDays();
  }, [currentItDay, refreshDays]);

  const handleCreateNewPOI = useCallback(async (
    entityType: 'accommodation' | 'activity',
    data: Record<string, string>,
    createBookingMission?: boolean,
  ) => {
    if (!state.activeTrip) return;
    const nights = parseInt(data._nights) || 1;
    const newPOI = await addPOI({
      tripId: state.activeTrip.id,
      category: data.category as any,
      subCategory: data.subCategory || undefined,
      name: data.name,
      status: 'candidate',
      location: { city: data.city || undefined },
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      details: {},
      isCancelled: false,
    });
    if (newPOI) {
      await addEntityToDay(entityType, newPOI.id, entityType === 'accommodation' ? nights : undefined);
      if (createBookingMission) {
        await addMission({
          tripId: state.activeTrip.id,
          title: `להזמין: ${data.name}`,
          description: data.category,
          status: 'pending',
          contextLinks: [],
          reminders: [],
          objectLink: newPOI.id,
        });
      }
    }
  }, [state.activeTrip, addPOI, addEntityToDay, addMission]);

  const handleCreateNewTransport = useCallback(async (data: Record<string, string>, createBookingMission?: boolean) => {
    if (!state.activeTrip) return;
    const newT = await addTransportation({
      tripId: state.activeTrip.id,
      category: data.category || 'flight',
      status: 'candidate',
      sourceRefs: { email_ids: [], recommendation_ids: [] },
      cost: { total_amount: 0, currency: state.activeTrip.currency },
      booking: {},
      segments: [{
        from: { name: data.fromName },
        to: { name: data.toName },
        departure_time: new Date().toISOString(),
        arrival_time: new Date().toISOString(),
      }],
      additionalInfo: {},
      isCancelled: false,
    });
    if (newT) {
      await addEntityToDay('transport', newT.id);
      // Auto-create booking mission for transport
      const label = `${data.fromName} → ${data.toName}`;
      await addMission({
        tripId: state.activeTrip.id,
        title: `להזמין: ${label}`,
        description: `${data.category || 'flight'}`,
        status: 'pending',
        contextLinks: [],
        reminders: [],
        objectLink: newT.id,
      });
    }
  }, [state.activeTrip, addTransportation, addEntityToDay, addMission]);

  const updateLocationContext = useCallback(async () => {
    const totalDays = 1 + locationDaysForward;
    for (let i = 0; i < totalDays; i++) {
      const dayNum = selectedDayNum + i;
      if (dayNum > tripDays.length) break;

      let targetDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
      if (!targetDay && state.activeTrip) {
        const day = tripDays[dayNum - 1];
        targetDay = await tripService.createItineraryDay({
          tripId: state.activeTrip.id,
          dayNumber: dayNum,
          date: day ? format(day, 'yyyy-MM-dd') : undefined,
          locationContext: '',
          accommodationOptions: [],
          activities: [],
          transportationSegments: [],
        });
      }
      if (targetDay) {
        await tripService.updateItineraryDay(targetDay.id, { locationContext });
      }
    }
    setEditingLocation(false);
    setLocationDaysForward(0);
    await refreshDays();
  }, [ensureItDay, currentItDay, locationContext, locationDaysForward, selectedDayNum, tripDays, state.itineraryDays, state.activeTrip, refreshDays]);

  if (state.isLoading) {
    return (
      <AppLayout>
        <div className="space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }

  if (!state.activeTrip) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <CalendarDays size={48} className="text-muted-foreground/40 mb-4" />
          <h2 className="text-xl font-semibold mb-2">No trips yet</h2>
          <p className="text-muted-foreground mb-6">Create your first trip to get started!</p>
          <CreateTripForm />
        </div>
      </AppLayout>
    );
  }

  const trip = state.activeTrip;
  const selectedDate = tripDays[selectedDayNum - 1];

  const availableAccom = state.pois.filter(p => p.category === 'accommodation' && !p.isCancelled && !dayAccommodations.some(d => d.poi_id === p.id));
  const availableActivities = state.pois.filter(p => p.category !== 'accommodation' && !p.isCancelled && !dayActivities.some(d => d.id === p.id));
  const availableTransport = state.transportation.filter(t => !t.isCancelled && !dayTransport.some(d => d.transportation_id === t.id));

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Trip info */}
        <div>
          {trip.description && <p className="text-muted-foreground text-sm">{trip.description}</p>}
          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge variant="outline">{trip.status}</Badge>
            <Badge variant="secondary">
              {format(parseISO(trip.startDate), 'MMM d')} – {format(parseISO(trip.endDate), 'MMM d, yyyy')}
            </Badge>
            {trip.countries.map(c => <Badge key={c} variant="secondary">{c}</Badge>)}
          </div>
        </div>

        {/* Horizontal Day Selector */}
        <ScrollArea className="w-full">
          <div className="flex gap-2 pb-1" id="day-selector-row">
            {tripDays.map((day, idx) => {
              const dayNum = idx + 1;
              const isSelected = dayNum === selectedDayNum;
              const itDay = state.itineraryDays.find(d => d.dayNumber === dayNum);
              const hasContent = !!itDay && (
                (itDay.accommodationOptions?.length || 0) > 0 ||
                (itDay.activities?.length || 0) > 0 ||
                (itDay.transportationSegments?.length || 0) > 0
              );

              return (
                <button
                  key={dayNum}
                  onClick={() => {
                    setSelectedDayNum(dayNum);
                    const it = state.itineraryDays.find(d => d.dayNumber === dayNum);
                    setLocationContext(it?.locationContext || '');
                    setEditingLocation(false);
                  }}
                  className={`flex flex-col items-center min-w-[56px] sm:min-w-[72px] px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl border-2 transition-all text-xs sm:text-sm ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : hasContent
                        ? 'border-primary/30 bg-muted/50 hover:bg-muted'
                        : 'border-transparent bg-muted/30 hover:bg-muted text-muted-foreground'
                  }`}
                >
                  <span className="text-[10px] sm:text-xs">{format(day, 'EEE')}</span>
                  <span className="text-base sm:text-lg font-bold">{format(day, 'd')}</span>
                  <span className="text-[9px] sm:text-[10px]">{format(day, 'MMM')}</span>
                  {hasContent && <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1" />}
                </button>
              );
            })}
          </div>
          {/* Gantt-like location bar */}
          {locationSpans.length > 0 && (
            <div className="relative h-6 mt-1 mb-1">
              {locationSpans.map((span, i) => {
                const dayWidth = window.innerWidth < 640 ? 64 : 80; // match min-w
                const left = span.startIdx * dayWidth;
                const width = (span.endIdx - span.startIdx + 1) * dayWidth - 8;
                return (
                  <div
                    key={i}
                    className="absolute top-0 h-full bg-primary/15 border border-primary/30 rounded-md flex items-center justify-center px-2 overflow-hidden"
                    style={{ left: `${left}px`, width: `${width}px` }}
                  >
                    <span className="text-[11px] font-medium text-primary truncate">📍 {span.location}</span>
                  </div>
                );
              })}
            </div>
          )}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        {/* Selected Day Editor */}
        {selectedDate && (
          <div className="space-y-5">
            <div className="flex items-center gap-2 sm:gap-3">
              <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-primary text-primary-foreground font-bold text-sm sm:text-base">
                {selectedDayNum}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base sm:text-lg font-semibold">{format(selectedDate, 'EEEE, MMM d')}</h3>
              {editingLocation ? (
                  <div className="mt-1 w-full sm:w-80">
                    <LocationContextPicker
                      countries={trip.countries}
                      value={locationContext}
                      onChange={setLocationContext}
                      daysForward={locationDaysForward}
                      onDaysForwardChange={setLocationDaysForward}
                      maxDaysForward={tripDays.length - selectedDayNum}
                      onSave={updateLocationContext}
                      onCancel={() => { setEditingLocation(false); setLocationDaysForward(0); }}
                      extraHierarchy={state.tripSitesHierarchy}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => { setLocationContext(currentItDay?.locationContext || ''); setEditingLocation(true); }}
                    className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                  >
                    📍 {currentItDay?.locationContext || 'הוסף מיקום'}
                    <Pencil size={12} />
                  </button>
                )}
              </div>
            </div>

            {/* Accommodation Section */}
            <DaySection
              title="לינה"
              icon={<Building2 size={16} />}
              entityType="accommodation"
              items={dayAccommodations.map(d => ({
                id: d.poi_id,
                label: d.poi?.name || 'Unknown',
                sublabel: d.poi?.location.city || '',
                status: d.poi?.status || 'candidate',
                isSelected: d.is_selected,
                subCategory: d.poi?.subCategory || '',
              }))}
              onRemove={(id) => removeEntityFromDay('accommodation', id)}
              availableItems={availableAccom.map(p => ({ id: p.id, label: p.name, sublabel: p.location.city || '', city: p.location.city || '', status: p.status }))}
              locationContext={currentItDay?.locationContext || ''}
              onAdd={async (id, nights, createBookingMission) => {
                await addEntityToDay('accommodation', id, nights);
                if (createBookingMission && state.activeTrip) {
                  const poi = state.pois.find(p => p.id === id);
                  await addMission({
                    tripId: state.activeTrip.id,
                    title: `להזמין: ${poi?.name || 'לינה'}`,
                    description: 'accommodation',
                    status: 'pending',
                    contextLinks: [],
                    reminders: [],
                    objectLink: id,
                  });
                }
              }}
              onCreateNew={(data, bookingMission) => handleCreateNewPOI('accommodation', { ...data, category: 'accommodation' }, bookingMission)}
              onToggleSelected={toggleAccommodationSelected}
              addLabel="הוסף לינה"
              maxNights={tripDays.length - selectedDayNum + 1}
              showBookingMissionOption
              countries={trip.countries}
              extraHierarchy={state.tripSitesHierarchy}
            />

            <Separator />

            {/* Activities Section */}
            <DaySection
              title="פעילויות ואטרקציות"
              icon={<MapPin size={16} />}
              entityType="activity"
              items={dayActivities.map(d => ({
                id: d.id,
                label: d.poi?.name || 'Unknown',
                sublabel: d.poi?.subCategory || d.poi?.category || '',
                status: d.poi?.status || 'candidate',
                subCategory: d.poi?.subCategory || d.poi?.category || '',
              }))}
              onRemove={(id) => removeEntityFromDay('activity', id)}
              availableItems={availableActivities.map(p => ({ id: p.id, label: p.name, sublabel: `${p.category} • ${p.location.city || ''}`, city: p.location.city || '', status: p.status }))}
              locationContext={currentItDay?.locationContext || ''}
              onAdd={async (id, _nights, createBookingMission) => {
                await addEntityToDay('activity', id);
                if (createBookingMission && state.activeTrip) {
                  const poi = state.pois.find(p => p.id === id);
                  await addMission({
                    tripId: state.activeTrip.id,
                    title: `להזמין: ${poi?.name || 'פעילות'}`,
                    description: poi?.category || 'activity',
                    status: 'pending',
                    contextLinks: [],
                    reminders: [],
                    objectLink: id,
                  });
                }
              }}
              onCreateNew={(data, bookingMission) => handleCreateNewPOI('activity', data, bookingMission)}
              addLabel="הוסף פעילות"
              showBookingMissionOption
              countries={trip.countries}
              extraHierarchy={state.tripSitesHierarchy}
            />

            <Separator />

            {/* Transport Section */}
            <DaySection
              title="תחבורה"
              icon={<Plane size={16} />}
              entityType="transport"
              items={dayTransport.map(d => {
                const seg = d.segment_id && d.transport
                  ? d.transport.segments.find(s => s.segment_id === d.segment_id)
                  : null;
                const label = seg
                  ? `${seg.from.name} → ${seg.to.name}`
                  : d.transport
                    ? d.transport.segments.length > 0
                      ? `${d.transport.segments[0].from.name} → ${d.transport.segments[d.transport.segments.length - 1].to.name}`
                      : d.transport.category
                    : 'Unknown';
                const formatTime = (iso: string) => {
                  try { return format(parseISO(iso), 'HH:mm'); } catch { return ''; }
                };
                let sublabel = d.transport?.category || '';
                if (seg?.departure_time || seg?.arrival_time) {
                  const dep = seg.departure_time ? formatTime(seg.departure_time) : '';
                  const arr = seg.arrival_time ? formatTime(seg.arrival_time) : '';
                  sublabel = dep && arr ? `${dep} – ${arr}` : dep || arr;
                  if (d.transport?.category) sublabel = `${d.transport.category} • ${sublabel}`;
                }
                return {
                  id: d.transportation_id,
                  label,
                  sublabel,
                  status: d.transport?.status || 'candidate',
                  subCategory: d.transport?.category || '',
                };
              })}
              onRemove={(id) => removeEntityFromDay('transport', id)}
              availableItems={availableTransport.map(t => ({
                id: t.id,
                label: t.segments.length > 0
                  ? `${t.segments[0].from.name} → ${t.segments[t.segments.length - 1].to.name}`
                  : t.category,
                sublabel: t.category,
              }))}
              onAdd={async (id) => {
                await addEntityToDay('transport', id);
                // Auto-create booking mission for transport
                if (state.activeTrip) {
                  const t = state.transportation.find(tr => tr.id === id);
                  const label = t && t.segments.length > 0
                    ? `${t.segments[0].from.name} → ${t.segments[t.segments.length - 1].to.name}`
                    : t?.category || 'תחבורה';
                  await addMission({
                    tripId: state.activeTrip.id,
                    title: `להזמין: ${label}`,
                    description: t?.category || 'transport',
                    status: 'pending',
                    contextLinks: [],
                    reminders: [],
                    objectLink: id,
                  });
                }
              }}
              onCreateNew={handleCreateNewTransport}
              addLabel="הוסף תחבורה"
              locationSuggestions={transportLocationSuggestions}
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default Index;
