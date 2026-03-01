import { AppLayout } from '@/components/layout';
import { PendingInbox } from '@/components/inbox/PendingInbox';
import { SourceEmailsDashboard } from '@/components/inbox/SourceEmailsDashboard';

const InboxPage = () => {
  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-muted-foreground">Incoming emails across trips</p>
        </div>

        <PendingInbox />
        <SourceEmailsDashboard />
      </div>
    </AppLayout>
  );
};

export default InboxPage;
