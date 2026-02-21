import { AppLayout } from '@/components/AppLayout';
import { PendingInbox } from '@/components/PendingInbox';
import { SourceEmailsDashboard } from '@/components/SourceEmailsDashboard';
import { UrlSubmit } from '@/components/UrlSubmit';
import { MapListManager } from '@/components/MapListManager';

const InboxPage = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Inbox & Sources</h1>
          <p className="text-muted-foreground">Manage webhook items and view all source emails across trips</p>
        </div>

        <UrlSubmit />
        <MapListManager />
        <PendingInbox />
        <SourceEmailsDashboard />
      </div>
    </AppLayout>
  );
};

export default InboxPage;
