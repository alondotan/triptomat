import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PanelLeftOpen, PanelRightOpen, PanelLeftClose, PanelRightClose } from 'lucide-react';
import { AppLayout } from '@/shared/components/layout';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { OverviewFeed } from '@/features/overview/OverviewFeed';
import { OverviewMap } from '@/features/overview/OverviewMap';
import { OverviewItineraryPanel } from '@/features/overview/OverviewItineraryPanel';
import { OverviewChatPanel } from '@/features/overview/OverviewChatPanel';
import type { TripContext } from '@/features/chat/AIChatSheet';
import { Button } from '@/components/ui/button';

const OverviewPage = () => {
  const { t } = useTranslation();
  const { activeTrip, tripLocationTree } = useActiveTrip();
  const [showMap, setShowMap] = useState(false);
  const [showPlan, setShowPlan] = useState(false);

  if (!activeTrip) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div>
      </AppLayout>
    );
  }

  const tripContext: TripContext = {
    tripId: activeTrip.id,
    tripName: activeTrip.name,
    countries: activeTrip.countries,
    startDate: activeTrip.startDate,
    endDate: activeTrip.endDate,
    numberOfDays: activeTrip.numberOfDays,
    status: activeTrip.status,
    currency: activeTrip.currency,
    locations: (tripLocationTree || []).flatMap(n => [n.site, ...(n.sub_sites || []).flatMap(s => [s.site, ...(s.sub_sites || []).map(c => c.site)])]),
  };

  return (
    <AppLayout>
      {/* Desktop toggle buttons */}
      <div className="hidden lg:flex items-center gap-2 mb-3">
        <Button
          variant={showMap ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowMap(v => !v)}
        >
          {showMap ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
          {t('overview.map')}
        </Button>
        <div className="flex-1" />
        <Button
          variant={showPlan ? 'default' : 'outline'}
          size="sm"
          className="gap-1.5 text-xs"
          onClick={() => setShowPlan(v => !v)}
        >
          {t('overview.plan')}
          {showPlan ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
        </Button>
      </div>

      {/* Layout */}
      <div className="flex gap-3 -mx-1.5 sm:-mx-6">
        {/* Left: Map (desktop only) */}
        {showMap && (
          <div className="hidden lg:block w-[30%] shrink-0 sticky top-[64px] h-[calc(100vh-80px)] self-start">
            <OverviewMap />
          </div>
        )}

        {/* Center: Feed — always visible */}
        <div className={`min-w-0 flex flex-col flex-1 ${!showMap && !showPlan ? 'lg:px-6' : ''}`}>
          <OverviewFeed />
        </div>

        {/* Right: Itinerary Tree + Embedded Chat (desktop only) */}
        {showPlan && (
          <div className="hidden lg:flex lg:flex-col w-[320px] shrink-0 sticky top-[64px] h-[calc(100vh-80px)] self-start border-s">
            <div className="h-[40%] min-h-0 overflow-y-auto border-b">
              <OverviewItineraryPanel />
            </div>
            <OverviewChatPanel tripContext={tripContext} />
          </div>
        )}
      </div>
    </AppLayout>
  );
};

export default OverviewPage;
