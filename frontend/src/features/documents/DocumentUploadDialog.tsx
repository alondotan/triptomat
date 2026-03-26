import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Loader2 } from 'lucide-react';
import type { DocumentCategory } from '@/types/trip';

const CATEGORIES: DocumentCategory[] = ['passport', 'visa', 'insurance', 'id', 'flight', 'hotel', 'car_rental', 'activity', 'other'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ACCEPTED_TYPES = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';

interface DocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (data: { category: DocumentCategory; name: string; notes?: string; isGeneral: boolean }, file: File) => Promise<void>;
  hasTripContext: boolean;
}

export function DocumentUploadDialog({ open, onOpenChange, onUpload, hasTripContext }: DocumentUploadDialogProps) {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>('other');
  const [isGeneral, setIsGeneral] = useState(false);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setFile(null);
    setName('');
    setCategory('other');
    setIsGeneral(false);
    setNotes('');
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > MAX_FILE_SIZE) {
      setError(t('documentsPage.fileTooLarge'));
      return;
    }
    setFile(f);
    setError('');
    if (!name) setName(f.name.replace(/\.[^/.]+$/, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !name) return;
    setUploading(true);
    try {
      await onUpload({ category, name, notes: notes || undefined, isGeneral }, file);
      reset();
      onOpenChange(false);
    } catch {
      setError(t('common.somethingWentWrong'));
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('documentsPage.uploadDocument')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File picker */}
          <div
            className="rounded-xl border-2 border-dashed border-muted-foreground/25 p-6 text-center cursor-pointer hover:border-primary/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileChange}
            />
            {file ? (
              <p className="text-sm font-medium truncate">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>
            ) : (
              <div className="space-y-1">
                <Upload className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">{t('documentsPage.selectFile')}</p>
                <p className="text-xs text-muted-foreground">{t('documentsPage.maxSize')}</p>
              </div>
            )}
          </div>

          {/* Name + Category */}
          <div className="rounded-xl bg-secondary/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('documentsPage.documentName')}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">{t('documentsPage.category')}</Label>
              <Select value={category} onValueChange={v => setCategory(v as DocumentCategory)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{t(`documentCategory.${c}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Scope toggle — only show when inside a trip */}
          {hasTripContext && (
            <div className="rounded-xl bg-secondary/40 p-3">
              <Label className="text-xs text-muted-foreground">{t('documentsPage.scope')}</Label>
              <div className="flex gap-2 mt-1.5">
                <Button
                  type="button"
                  variant={!isGeneral ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsGeneral(false)}
                >
                  {t('documentsPage.scopeTrip')}
                </Button>
                <Button
                  type="button"
                  variant={isGeneral ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setIsGeneral(true)}
                >
                  {t('documentsPage.scopeGeneral')}
                </Button>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="rounded-xl bg-secondary/40 p-3 space-y-1">
            <Label className="text-xs text-muted-foreground">{t('documentsPage.notes')}</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" className="flex-1" disabled={!file || !name || uploading}>
              {uploading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t('documentsPage.uploading')}</> : t('documentsPage.upload')}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => { reset(); onOpenChange(false); }}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
