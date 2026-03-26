import { useTranslation } from 'react-i18next';
import { useDraggable } from '@dnd-kit/core';
import {
  FileText, CreditCard, Stamp, Shield, Plane, Hotel, Car, Ticket,
  Eye, Download, Pencil, Trash2, Folder, LayoutGrid, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/lib/utils';
import type { TripDocument, DocumentCategory } from '@/types/trip';
import type { FolderPath } from './FolderSidebar';
import {
  Breadcrumb, BreadcrumbList, BreadcrumbItem,
  BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';

const CATEGORY_ICONS: Record<DocumentCategory, typeof FileText> = {
  passport: CreditCard, id: CreditCard, visa: Stamp, insurance: Shield,
  flight: Plane, hotel: Hotel, car_rental: Car, activity: Ticket, other: FileText,
};

const CATEGORIES: DocumentCategory[] = [
  'passport', 'visa', 'insurance', 'id', 'flight', 'hotel', 'car_rental', 'activity', 'other',
];

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mimeType?: string) {
  if (!mimeType) return FileText;
  if (mimeType === 'application/pdf') return FileText;
  return FileText;
}

// ── Draggable document item ──

function DraggableDocItem({
  doc, viewMode, onPreview, onDownload, onEdit, onDelete,
}: {
  doc: TripDocument;
  viewMode: 'grid' | 'list';
  onPreview: (d: TripDocument) => void;
  onDownload: (d: TripDocument) => void;
  onEdit: (d: TripDocument) => void;
  onDelete: (d: TripDocument) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `doc:${doc.id}`,
    data: { doc },
  });
  const canPreview = doc.mimeType?.startsWith('image/') || doc.mimeType === 'application/pdf';
  const Icon = CATEGORY_ICONS[doc.category] || FileText;
  const FileIcon = fileIcon(doc.mimeType);

  if (viewMode === 'grid') {
    return (
      <div
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        className={cn(
          'group relative flex flex-col items-center gap-2 rounded-lg border p-4 cursor-grab transition-all hover:bg-accent',
          isDragging && 'opacity-40',
        )}
      >
        <div className="rounded-lg bg-secondary p-3">
          <FileIcon size={28} className="text-muted-foreground" />
        </div>
        <div className="text-center w-full min-w-0">
          <p className="text-sm font-medium truncate">{doc.name}</p>
          <p className="text-xs text-muted-foreground">{formatFileSize(doc.fileSize)}</p>
        </div>
        {/* Hover actions */}
        <div className="absolute top-1 end-1 opacity-0 group-hover:opacity-100 flex gap-0.5 transition-opacity">
          {canPreview && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onPreview(doc); }}>
              <Eye size={12} />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDownload(doc); }}>
            <Download size={12} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(doc); }}>
            <Pencil size={12} />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(doc); }}>
            <Trash2 size={12} />
          </Button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 cursor-grab transition-all hover:bg-accent',
        isDragging && 'opacity-40',
      )}
    >
      <Icon size={18} className="text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm font-medium truncate">{doc.name}</span>
      <span className="text-xs text-muted-foreground shrink-0 w-16 text-end">{formatFileSize(doc.fileSize)}</span>
      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        {canPreview && (
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onPreview(doc); }}>
            <Eye size={12} />
          </Button>
        )}
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDownload(doc); }}>
          <Download size={12} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(doc); }}>
          <Pencil size={12} />
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={(e) => { e.stopPropagation(); onDelete(doc); }}>
          <Trash2 size={12} />
        </Button>
      </div>
    </div>
  );
}

// ── Main content area ──

interface FileExplorerContentProps {
  currentPath: FolderPath | null;
  onNavigate: (path: FolderPath | null) => void;
  documents: TripDocument[];
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
  onPreview: (doc: TripDocument) => void;
  onDownload: (doc: TripDocument) => void;
  onEdit: (doc: TripDocument) => void;
  onDelete: (doc: TripDocument) => void;
  onUpload: () => void;
  hasTripContext: boolean;
  // For folder view when no category selected
  tripDocCounts: Record<DocumentCategory, number>;
  generalDocCounts: Record<DocumentCategory, number>;
}

export function FileExplorerContent({
  currentPath,
  onNavigate,
  documents,
  viewMode,
  onViewModeChange,
  onPreview,
  onDownload,
  onEdit,
  onDelete,
  onUpload,
  hasTripContext,
  tripDocCounts,
  generalDocCounts,
}: FileExplorerContentProps) {
  const { t } = useTranslation();

  // Show category folders when scope selected but no category
  const showFolders = currentPath && !currentPath.category;
  const counts = currentPath?.scope === 'trip' ? tripDocCounts : generalDocCounts;

  return (
    <div className="flex-1 min-w-0">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-4">
        {/* Breadcrumb */}
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              {currentPath ? (
                <BreadcrumbLink className="cursor-pointer" onClick={() => onNavigate(null)}>
                  {t('documentsPage.title')}
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>{t('documentsPage.title')}</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {currentPath && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  {currentPath.category ? (
                    <BreadcrumbLink
                      className="cursor-pointer"
                      onClick={() => onNavigate({ scope: currentPath.scope, category: null })}
                    >
                      {t(currentPath.scope === 'trip' ? 'documentsPage.tripDocuments' : 'documentsPage.myDocuments')}
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>
                      {t(currentPath.scope === 'trip' ? 'documentsPage.tripDocuments' : 'documentsPage.myDocuments')}
                    </BreadcrumbPage>
                  )}
                </BreadcrumbItem>
              </>
            )}
            {currentPath?.category && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{t(`documentCategory.${currentPath.category}`)}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        {/* Right side controls */}
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => onViewModeChange('grid')}
            title={t('documentsPage.gridView')}
          >
            <LayoutGrid size={16} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="icon"
            className="h-8 w-8"
            onClick={() => onViewModeChange('list')}
            title={t('documentsPage.listView')}
          >
            <List size={16} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!currentPath ? (
        // Root: show scope folders
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {hasTripContext && (
            <button
              className="flex flex-col items-center gap-2 rounded-lg border p-6 hover:bg-accent transition-colors"
              onClick={() => onNavigate({ scope: 'trip', category: null })}
            >
              <Folder size={36} className="text-primary" />
              <span className="text-sm font-medium">{t('documentsPage.tripDocuments')}</span>
            </button>
          )}
          <button
            className="flex flex-col items-center gap-2 rounded-lg border p-6 hover:bg-accent transition-colors"
            onClick={() => onNavigate({ scope: 'general', category: null })}
          >
            <Folder size={36} className="text-amber-500" />
            <span className="text-sm font-medium">{t('documentsPage.myDocuments')}</span>
          </button>
        </div>
      ) : showFolders ? (
        // Scope selected, show category folders
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat];
            const count = counts[cat] || 0;
            return (
              <button
                key={cat}
                className="flex flex-col items-center gap-2 rounded-lg border p-4 hover:bg-accent transition-colors"
                onClick={() => onNavigate({ scope: currentPath.scope, category: cat })}
              >
                <Folder size={30} className="text-muted-foreground" />
                <div className="flex items-center gap-1.5">
                  <Icon size={14} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{t(`documentCategory.${cat}`)}</span>
                </div>
                {count > 0 && (
                  <span className="text-xs text-muted-foreground">{count} {t('documentsPage.files').toLowerCase()}</span>
                )}
              </button>
            );
          })}
        </div>
      ) : documents.length === 0 ? (
        // Empty folder
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <Folder size={48} className="mb-3 opacity-30" />
          <p className="text-sm">{t('documentsPage.emptyFolder')}</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={onUpload}>
            {t('documentsPage.upload')}
          </Button>
        </div>
      ) : viewMode === 'grid' ? (
        // Grid view
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {documents.map((doc) => (
            <DraggableDocItem
              key={doc.id}
              doc={doc}
              viewMode="grid"
              onPreview={onPreview}
              onDownload={onDownload}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      ) : (
        // List view
        <div className="space-y-0.5 border rounded-md divide-y">
          {documents.map((doc) => (
            <DraggableDocItem
              key={doc.id}
              doc={doc}
              viewMode="list"
              onPreview={onPreview}
              onDownload={onDownload}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
}
