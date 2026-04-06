import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/shared/components/layout';
import { useActiveTrip } from '@/features/trip/ActiveTripContext';
import { OverviewFeed } from '@/features/overview/OverviewFeed';

const OverviewPage = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();

  if (!activeTrip) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <OverviewFeed />
    </AppLayout>
  );
};

export default OverviewPage;
