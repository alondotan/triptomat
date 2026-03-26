import { useTranslation } from 'react-i18next';
import { useDroppable } from '@dnd-kit/core';
import {
  FileText, CreditCard, Stamp, Shield, Plane, Hotel, Car, Ticket,
  ChevronDown, ChevronRight, Folder, FolderOpen,
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { DocumentCategory } from '@/types/trip';
import { useState } from 'react';

export type FolderPath = {
  scope: 'trip' | 'general';
  category: DocumentCategory | null;
};

const CATEGORY_ICONS: Record<DocumentCategory, typeof FileText> = {
  passport: CreditCard,
  id: CreditCard,
  visa: Stamp,
  insurance: Shield,
  flight: Plane,
  hotel: Hotel,
  car_rental: Car,
  activity: Ticket,
  other: FileText,
};

const CATEGORIES: DocumentCategory[] = [
  'passport', 'visa', 'insurance', 'id', 'flight', 'hotel', 'car_rental', 'activity', 'other',
];

interface FolderSidebarProps {
  currentPath: FolderPath | null;
  onNavigate: (path: FolderPath | null) => void;
  tripDocCounts: Record<DocumentCategory, number>;
  generalDocCounts: Record<DocumentCategory, number>;
  tripTotal: number;
  generalTotal: number;
  hasTripContext: boolean;
}

function DroppableFolder({
  folderId,
  isSelected,
  icon: Icon,
  label,
  count,
  indent,
  onClick,
}: {
  folderId: string;
  isSelected: boolean;
  icon: typeof FileText;
  label: string;
  count: number;
  indent: boolean;
  onClick: () => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: folderId });

  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        'flex items-center gap-2 w-full rounded-md px-2 py-1.5 text-sm transition-colors text-start',
        indent && 'ps-6',
        isSelected
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        isOver && !isSelected && 'bg-primary/5 ring-1 ring-primary/30',
      )}
    >
      <Icon size={16} className="shrink-0" />
      <span className="truncate flex-1">{label}</span>
      {count > 0 && (
        <span className={cn(
          'text-xs tabular-nums shrink-0',
          isSelected ? 'text-primary' : 'text-muted-foreground/60',
        )}>
          {count}
        </span>
      )}
    </button>
  );
}

export function FolderSidebar({
  currentPath,
  onNavigate,
  tripDocCounts,
  generalDocCounts,
  tripTotal,
  generalTotal,
  hasTripContext,
}: FolderSidebarProps) {
  const { t } = useTranslation();
  const [tripOpen, setTripOpen] = useState(true);
  const [generalOpen, setGeneralOpen] = useState(true);

  const isSelected = (scope: 'trip' | 'general', cat: DocumentCategory | null) =>
    currentPath?.scope === scope && currentPath?.category === cat;

  return (
    <nav className="w-56 shrink-0 space-y-1 border-e pe-3">
      {/* Trip Documents group */}
      {hasTripContext && (
        <>
          <button
            onClick={() => setTripOpen(!tripOpen)}
            className="flex items-center gap-1.5 w-full text-sm font-semibold py-1 hover:text-foreground transition-colors"
          >
            {tripOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isSelected('trip', null) ? <FolderOpen size={16} /> : <Folder size={16} />}
            <span className="flex-1 text-start">{t('documentsPage.tripDocuments')}</span>
            <span className="text-xs text-muted-foreground/60 tabular-nums">{tripTotal}</span>
          </button>
          {tripOpen && (
            <div className="space-y-0.5">
              {CATEGORIES.map((cat) => (
                <DroppableFolder
                  key={`trip:${cat}`}
                  folderId={`folder:trip:${cat}`}
                  isSelected={isSelected('trip', cat)}
                  icon={CATEGORY_ICONS[cat]}
                  label={t(`documentCategory.${cat}`)}
                  count={tripDocCounts[cat] || 0}
                  indent
                  onClick={() => onNavigate({ scope: 'trip', category: cat })}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* General Documents group */}
      <button
        onClick={() => setGeneralOpen(!generalOpen)}
        className={cn(
          'flex items-center gap-1.5 w-full text-sm font-semibold py-1 hover:text-foreground transition-colors',
          hasTripContext && 'mt-3',
        )}
      >
        {generalOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {isSelected('general', null) ? <FolderOpen size={16} /> : <Folder size={16} />}
        <span className="flex-1 text-start">{t('documentsPage.myDocuments')}</span>
        <span className="text-xs text-muted-foreground/60 tabular-nums">{generalTotal}</span>
      </button>
      {generalOpen && (
        <div className="space-y-0.5">
          {CATEGORIES.map((cat) => (
            <DroppableFolder
              key={`general:${cat}`}
              folderId={`folder:general:${cat}`}
              isSelected={isSelected('general', cat)}
              icon={CATEGORY_ICONS[cat]}
              label={t(`documentCategory.${cat}`)}
              count={generalDocCounts[cat] || 0}
              indent
              onClick={() => onNavigate({ scope: 'general', category: cat })}
            />
          ))}
        </div>
      )}
    </nav>
  );
}
