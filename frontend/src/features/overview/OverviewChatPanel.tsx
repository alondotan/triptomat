import { AIChatCore } from '@/features/chat/AIChatCore';
import type { TripContext } from '@/features/chat/AIChatSheet';

interface OverviewChatPanelProps {
  tripContext: TripContext;
}

export function OverviewChatPanel({ tripContext }: OverviewChatPanelProps) {
  return (
    <AIChatCore
      tripContext={tripContext}
      compact
      className="flex-1 min-h-0"
    />
  );
}
