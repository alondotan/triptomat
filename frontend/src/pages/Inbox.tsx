import { useTranslation } from 'react-i18next';
import { AppLayout } from '@/components/layout';
import { PendingInbox } from '@/components/inbox/PendingInbox';
import { SourceEmailsDashboard } from '@/components/inbox/SourceEmailsDashboard';

const InboxPage = () => {
  const { t } = useTranslation();

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">{t('inboxPage.title')}</h1>
          <p className="text-muted-foreground">{t('inboxPage.subtitle')}</p>
        </div>

        <PendingInbox />
        <SourceEmailsDashboard />
      </div>
    </AppLayout>
  );
};

export default InboxPage;
