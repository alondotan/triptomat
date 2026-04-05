import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { ItineraryTree } from '@/shared/components/ItineraryTree';
import type { DraftDay } from '@/types/itineraryDraft';
import type { SelectedLevel } from '@/features/home/panelItems';

interface OverviewItineraryPanelProps {
  selectedName?: string | null;
  onSelectName?: (name: string | null) => void;
  /** Live or snapshot days — always provided by Home.tsx */
  overrideDays?: DraftDay[];
  /** Currently selected tree level (drives map + objects list filtering) */
  selectedLevel?: SelectedLevel;
  /** Called when user clicks a level row in the tree */
  onSelectLevel?: (level: SelectedLevel) => void;
}

export function OverviewItineraryPanel({ selectedName, onSelectName, overrideDays, selectedLevel, onSelectLevel }: OverviewItineraryPanelProps = {}) {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();

  return (
    <div className="flex flex-col min-h-0">
      <h3 className="text-sm font-semibold px-2 py-2 shrink-0">{t('overview.itinerary')}</h3>
      <div className="overflow-y-auto flex-1 min-h-0 px-1">
        <ItineraryTree
          days={overrideDays ?? []}
          emptyText={t('overview.noItinerary')}
          selectedName={selectedName ?? null}
          onSelectName={onSelectName}
          selectedLevel={selectedLevel}
          onSelectLevel={onSelectLevel}
          tripName={activeTrip?.name}
        />
      </div>
    </div>
  );
}
