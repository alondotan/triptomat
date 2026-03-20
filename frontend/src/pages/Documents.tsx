import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Button } from '@/components/ui/button';
import { Plus, Loader2 } from 'lucide-react';
import { AppLayout } from '@/components/layout';
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog';
import { FolderSidebar, type FolderPath } from '@/components/documents/FolderSidebar';
import { FileExplorerContent } from '@/components/documents/FileExplorerContent';
import { useToast } from '@/hooks/use-toast';
import {
  fetchTripDocuments,
  fetchGeneralDocuments,
  createDocument,
  deleteDocument as deleteDocumentApi,
  getDocumentUrl,
  updateDocument,
} from '@/services/documentService';
import type { TripDocument, DocumentCategory } from '@/types/trip';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

const CATEGORIES: DocumentCategory[] = [
  'passport', 'visa', 'insurance', 'id', 'flight', 'hotel', 'car_rental', 'activity', 'other',
];

function countByCategory(docs: TripDocument[]): Record<DocumentCategory, number> {
  const counts = {} as Record<DocumentCategory, number>;
  for (const cat of CATEGORIES) counts[cat] = 0;
  for (const doc of docs) counts[doc.category] = (counts[doc.category] || 0) + 1;
  return counts;
}

const DocumentsPage = () => {
  const { t } = useTranslation();
  const { activeTrip } = useActiveTrip();
  const { toast } = useToast();

  const [tripDocs, setTripDocs] = useState<TripDocument[]>([]);
  const [generalDocs, setGeneralDocs] = useState<TripDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TripDocument | null>(null);
  const [editTarget, setEditTarget] = useState<TripDocument | null>(null);

  // Navigation state
  const [currentPath, setCurrentPath] = useState<FolderPath | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() =>
    (localStorage.getItem('docs-view-mode') as 'grid' | 'list') || 'grid',
  );

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<DocumentCategory>('other');
  const [editNotes, setEditNotes] = useState('');

  // DnD sensors
  const pointerSensor = useSensor(PointerSensor, { activationConstraint: { distance: 8 } });
  const touchSensor = useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } });
  const sensors = useSensors(pointerSensor, touchSensor);

  // Computed counts
  const tripDocCounts = useMemo(() => countByCategory(tripDocs), [tripDocs]);
  const generalDocCounts = useMemo(() => countByCategory(generalDocs), [generalDocs]);

  // Filtered documents for current view
  const filteredDocs = useMemo(() => {
    if (!currentPath || !currentPath.category) return [];
    const pool = currentPath.scope === 'trip' ? tripDocs : generalDocs;
    return pool.filter((d) => d.category === currentPath.category);
  }, [currentPath, tripDocs, generalDocs]);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const [trip, general] = await Promise.all([
        activeTrip ? fetchTripDocuments(activeTrip.id) : Promise.resolve([]),
        fetchGeneralDocuments(),
      ]);
      setTripDocs(trip);
      setGeneralDocs(general);
    } catch {
      toast({ title: t('common.somethingWentWrong'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeTrip, t, toast]);

  useEffect(() => { loadDocuments(); }, [loadDocuments]);

  // Persist view mode
  useEffect(() => { localStorage.setItem('docs-view-mode', viewMode); }, [viewMode]);

  // ── Handlers ──

  const handleUpload = async (
    data: { category: DocumentCategory; name: string; notes?: string; isGeneral: boolean },
    file: File,
  ) => {
    const tripId = data.isGeneral ? null : (activeTrip?.id || null);
    await createDocument({ tripId, category: data.category, name: data.name, notes: data.notes }, file);
    await loadDocuments();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteDocumentApi(deleteTarget.id, deleteTarget.storagePath);
      await loadDocuments();
    } catch {
      toast({ title: t('common.somethingWentWrong'), variant: 'destructive' });
    }
    setDeleteTarget(null);
  };

  const handlePreview = async (doc: TripDocument) => {
    const url = await getDocumentUrl(doc.storagePath);
    if (url) window.open(url, '_blank');
  };

  const handleDownload = async (doc: TripDocument) => {
    const url = await getDocumentUrl(doc.storagePath);
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = doc.fileName;
    a.click();
  };

  const openEdit = (doc: TripDocument) => {
    setEditTarget(doc);
    setEditName(doc.name);
    setEditCategory(doc.category);
    setEditNotes(doc.notes || '');
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    try {
      await updateDocument(editTarget.id, { name: editName, category: editCategory, notes: editNotes });
      await loadDocuments();
    } catch {
      toast({ title: t('common.somethingWentWrong'), variant: 'destructive' });
    }
    setEditTarget(null);
  };

  // ── Drag & Drop ──

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const overId = String(over.id);
    if (!overId.startsWith('folder:')) return;

    // Parse folder:scope:category
    const parts = overId.split(':');
    const targetScope = parts[1] as 'trip' | 'general';
    const targetCategory = parts[2] as DocumentCategory;

    // Get the dragged document
    const docData = active.data.current?.doc as TripDocument | undefined;
    if (!docData) return;

    // Skip if nothing changed
    const currentScope = docData.tripId ? 'trip' : 'general';
    if (currentScope === targetScope && docData.category === targetCategory) return;

    try {
      const updates: { category?: DocumentCategory; tripId?: string | null } = {};
      if (docData.category !== targetCategory) updates.category = targetCategory;
      if (currentScope !== targetScope) {
        updates.tripId = targetScope === 'trip' ? (activeTrip?.id || null) : null;
      }
      await updateDocument(docData.id, updates);
      await loadDocuments();

      const folderName = t(`documentCategory.${targetCategory}`);
      toast({ title: t('documentsPage.movedTo', { folder: folderName }) });
    } catch {
      toast({ title: t('common.somethingWentWrong'), variant: 'destructive' });
    }
  };

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  return (
    <AppLayout>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">{t('documentsPage.title')}</h2>
            <Button className="gap-1" onClick={() => setUploadOpen(true)}>
              <Plus size={16} /> {t('documentsPage.upload')}
            </Button>
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="flex gap-6">
              {/* Sidebar — hidden on mobile */}
              <div className="hidden md:block">
                <FolderSidebar
                  currentPath={currentPath}
                  onNavigate={setCurrentPath}
                  tripDocCounts={tripDocCounts}
                  generalDocCounts={generalDocCounts}
                  tripTotal={tripDocs.length}
                  generalTotal={generalDocs.length}
                  hasTripContext={!!activeTrip}
                />
              </div>

              {/* Content area */}
              <FileExplorerContent
                currentPath={currentPath}
                onNavigate={setCurrentPath}
                documents={filteredDocs}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                onPreview={handlePreview}
                onDownload={handleDownload}
                onEdit={openEdit}
                onDelete={setDeleteTarget}
                onUpload={() => setUploadOpen(true)}
                hasTripContext={!!activeTrip}
                tripDocCounts={tripDocCounts}
                generalDocCounts={generalDocCounts}
              />
            </div>
          )}
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {/* Minimal drag preview */}
          {null}
        </DragOverlay>
      </DndContext>

      {/* Upload Dialog */}
      <DocumentUploadDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUpload={handleUpload}
        hasTripContext={!!activeTrip}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('documentsPage.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>{deleteTarget?.name}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('documentsPage.editDocument')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('documentsPage.documentName')}</Label>
              <Input value={editName} onChange={e => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('documentsPage.category')}</Label>
              <Select value={editCategory} onValueChange={v => setEditCategory(v as DocumentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{t(`documentCategory.${c}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('documentsPage.notes')}</Label>
              <Textarea value={editNotes} onChange={e => setEditNotes(e.target.value)} rows={2} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={handleEditSave}>{t('common.save')}</Button>
              <Button variant="outline" className="flex-1" onClick={() => setEditTarget(null)}>{t('common.cancel')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default DocumentsPage;
