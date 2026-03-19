import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useActiveTrip } from '@/context/ActiveTripContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  FileText, Plus, Trash2, Download, Pencil, Eye,
  CreditCard, Stamp, Shield, Plane, Hotel, Car, Ticket,
  ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { AppLayout } from '@/components/layout';
import { DocumentUploadDialog } from '@/components/documents/DocumentUploadDialog';
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

const CATEGORIES: DocumentCategory[] = ['passport', 'visa', 'insurance', 'id', 'flight', 'hotel', 'car_rental', 'activity', 'other'];

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const [tripSectionOpen, setTripSectionOpen] = useState(true);
  const [generalSectionOpen, setGeneralSectionOpen] = useState(true);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<DocumentCategory>('other');
  const [editNotes, setEditNotes] = useState('');

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

  const canPreview = (mimeType?: string) => {
    if (!mimeType) return false;
    return mimeType.startsWith('image/') || mimeType === 'application/pdf';
  };

  const renderDocCard = (doc: TripDocument) => {
    const Icon = CATEGORY_ICONS[doc.category] || FileText;
    return (
      <Card key={doc.id}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="rounded-lg bg-secondary p-2 shrink-0">
                <Icon size={20} className="text-muted-foreground" />
              </div>
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold truncate">{doc.name}</p>
                  <Badge variant="secondary" className="text-xs shrink-0">
                    {t(`documentCategory.${doc.category}`)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {doc.fileName}
                  {doc.fileSize ? ` · ${formatFileSize(doc.fileSize)}` : ''}
                </p>
                {doc.notes && <p className="text-xs text-muted-foreground italic mt-1">{doc.notes}</p>}
              </div>
            </div>
            <div className="flex gap-1 shrink-0 ml-2">
              {canPreview(doc.mimeType) && (
                <Button variant="ghost" size="sm" onClick={() => handlePreview(doc)} title={t('documentsPage.preview')}>
                  <Eye size={14} />
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={() => handleDownload(doc)} title={t('documentsPage.download')}>
                <Download size={14} />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => openEdit(doc)}>
                <Pencil size={14} />
              </Button>
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setDeleteTarget(doc)}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  if (!activeTrip) {
    return <AppLayout><div className="text-center py-12 text-muted-foreground">{t('common.noTripSelected')}</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="space-y-6">
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
          <>
            {/* Trip Documents Section */}
            <div>
              <button
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
                onClick={() => setTripSectionOpen(!tripSectionOpen)}
              >
                {tripSectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {t('documentsPage.tripDocuments')} ({tripDocs.length})
              </button>
              {tripSectionOpen && (
                <div className="space-y-3">
                  {tripDocs.length === 0 ? (
                    <Card>
                      <CardContent className="py-6 text-center text-muted-foreground">
                        <FileText className="mx-auto mb-2 h-10 w-10 opacity-40" />
                        <p className="text-sm">{t('documentsPage.noTripDocuments')}</p>
                      </CardContent>
                    </Card>
                  ) : (
                    tripDocs.map(renderDocCard)
                  )}
                </div>
              )}
            </div>

            {/* General Documents Section */}
            <div>
              <button
                className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground transition-colors"
                onClick={() => setGeneralSectionOpen(!generalSectionOpen)}
              >
                {generalSectionOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                {t('documentsPage.myDocuments')} ({generalDocs.length})
              </button>
              {generalSectionOpen && (
                <div className="space-y-3">
                  {generalDocs.length === 0 ? (
                    <Card>
                      <CardContent className="py-6 text-center text-muted-foreground">
                        <CreditCard className="mx-auto mb-2 h-10 w-10 opacity-40" />
                        <p className="text-sm">{t('documentsPage.noGeneralDocuments')}</p>
                      </CardContent>
                    </Card>
                  ) : (
                    generalDocs.map(renderDocCard)
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </div>

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
