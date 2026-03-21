import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2 } from 'lucide-react';
import type { DraftDay } from '@/types/itineraryDraft';
import { ItineraryTree } from '@/components/shared/ItineraryTree';

interface DraftTreePanelProps {
  draft: DraftDay[];
  applying: boolean;
  onClear: () => void;
}

export function DraftTreePanel({ draft, applying, onClear }: DraftTreePanelProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <h3 className="text-sm font-medium text-foreground">{t('aiChat.planTitle')}</h3>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="px-3 py-2">
          <ItineraryTree days={draft} />
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-border shrink-0 flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs h-7 gap-1 text-muted-foreground"
          onClick={onClear}
          disabled={draft.length === 0 || applying}
        >
          <Trash2 size={12} /> {t('aiChat.clearDraft')}
        </Button>
      </div>
    </div>
  );
}
